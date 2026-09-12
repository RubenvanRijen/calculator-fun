import { evaluateString, isOperation } from "./expression.js";
import type { Operation } from "./types/operation.js";
import type { HistoryEntry } from "./interfaces/history-entry.js";
import type { AngleMode } from "./types/angle-mode.js";

/** How many past calculations to keep. Oldest are dropped beyond this. */
const MAX_HISTORY = 50;

/** Characters after which a "-" reads as a sign rather than a subtraction. */
const OPERATOR_CHARACTERS = "+-*÷^(";

/**
 * Binary floating point makes 0.1 + 0.2 come out as 0.30000000000000004.
 * Twelve significant digits is well inside a double's ~15-17 digits of
 * precision, so this trims the noise without changing any honest result.
 */
function roundResult(value: number): number {
  if (!Number.isFinite(value)) return value;
  return parseFloat(value.toPrecision(12));
}

/** True when a "-" appended to `text` would be a sign, not a subtraction. */
function expectsOperand(text: string): boolean {
  if (text === "") return true;
  const last = text[text.length - 1] ?? "";
  return OPERATOR_CHARACTERS.includes(last);
}

/**
 * Text that a single keypress inserts as a unit. DEL removes one of these
 * rather than one character, so undoing the "(e)" or "sqrt(" key takes one
 * press rather than three or five. Longest first.
 */
/** Close any parentheses the user left open, so "sqrt(9" still evaluates. */
function balanceParentheses(expression: string): string {
  let depth = 0;
  for (const character of expression) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
  }
  return depth > 0 ? expression + ")".repeat(depth) : expression;
}

/**
 * The calculator's state machine. It holds no reference to the DOM, so it can
 * be driven straight from a test; index.ts is what binds it to the buttons.
 *
 * The expression is kept as text and handed to the parser, which is what lets
 * precedence and parentheses work: 2 + 3 * 4 is 14, not 20.
 */
export class Calculator {
  /** The expression as typed, e.g. "12+3*4". */
  expression = "";

  /** Set when the last action could not be completed. Cleared on next input. */
  error: string | null = null;

  /** The memory register, as used by the MC/MR/M+/M- keys. */
  memory = 0;

  #angleMode: AngleMode = "rad";

  /** How trigonometry reads its arguments. Survives AC, like memory. */
  get angleMode(): AngleMode {
    return this.#angleMode;
  }

  /**
   * Setting it re-evaluates the preview: otherwise the display would keep
   * showing a value worked out in the previous mode, and M+ would bank it.
   */
  set angleMode(mode: AngleMode) {
    this.#angleMode = mode;
    this.#refreshPreview();
  }

  #history: HistoryEntry[] = [];
  /**
   * How many characters each keypress added, newest last, so DEL can undo one
   * press. Derived from what was actually typed rather than from how the text
   * looks: "10^(" reached by pressing 1, 0, x^n and ( is four presses, while
   * the same four characters from the 10^ key are one.
   */
  #atoms: number[] = [];
  #result: string | null = null;
  #preview = "";
  #justComputed = false;
  /** The trailing "+3" of the last sum, so "=" can be pressed again. */
  #repeatTail: string | null = null;

  /** Past calculations, most recent first. */
  get history(): readonly HistoryEntry[] {
    return this.#history;
  }

  /** Whether the display should show its "M" indicator. */
  get hasMemory(): boolean {
    return this.memory !== 0;
  }

  /** Restore history and memory from a previous visit. */
  restore(history: readonly HistoryEntry[], memory: number): void {
    this.#history = [...history].slice(0, MAX_HISTORY);
    this.memory = memory;
  }

  /** Reset the current entry. Memory and history deliberately survive. */
  clear(): void {
    this.expression = "";
    this.#atoms = [];
    this.error = null;
    this.#result = null;
    this.#preview = "";
    this.#justComputed = false;
    this.#repeatTail = null;
  }

  /** Remove the last character of the expression. */
  delete(): void {
    this.error = null;
    if (this.#justComputed) {
      this.clear();
      return;
    }
    const atom = this.#atoms.pop() ?? 1;
    this.expression = this.expression.slice(0, -atom);
    this.#refreshPreview();
  }

  /** Append a digit or the decimal point. */
  appendNumber(digit: string): void {
    this.error = null;
    if (this.#justComputed) {
      this.expression = "";
      this.#justComputed = false;
    }
    // Only one decimal point per number.
    if (digit === "." && /[0-9.]*\.[0-9]*$/.test(this.expression)) return;
    this.expression += digit;
    this.#atoms.push(digit.length);
    this.#refreshPreview();
  }

  /** Append an operator, continuing from the last result where there is one. */
  chooseOperation(operation: Operation): void {
    this.error = null;
    if (!isOperation(operation)) return;

    if (this.#justComputed && this.#result !== null) {
      this.expression = this.#result;
      this.#justComputed = false;
    }
    // A trailing "(" has nothing to operate on, so "(" then "+" would leave
    // "(+", which can never evaluate.
    if (this.expression === "" || this.expression.endsWith("(")) return;

    // Replace a trailing operator rather than stacking two.
    if (this.#endsWithOperator()) {
      this.expression = this.expression.slice(0, -1);
      this.#atoms.pop();
    }
    this.expression += operation;
    this.#atoms.push(operation.length);
    this.#refreshPreview();
  }

  /** Open a parenthesis. */
  openParen(): void {
    this.error = null;
    if (this.#justComputed) {
      this.expression = "";
      this.#justComputed = false;
    }
    this.expression += "(";
    this.#atoms.push(1);
    this.#refreshPreview();
  }

  /** Close a parenthesis, if there is one open to close. */
  closeParen(): void {
    this.error = null;
    if (this.#openDepth() === 0) return;
    if (expectsOperand(this.expression)) return;
    this.expression += ")";
    this.#atoms.push(1);
    this.#refreshPreview();
  }

  /** Append a named function, ready for its argument, e.g. "sqrt(". */
  appendFunction(name: string): void {
    this.error = null;
    if (this.#justComputed) {
      this.expression = "";
      this.#justComputed = false;
    }
    this.expression += `${name}(`;
    this.#atoms.push(name.length + 1);
    this.#refreshPreview();
  }

  /** Append raw text that one keypress produced, e.g. "π" or "10^(". */
  insert(text: string): void {
    this.error = null;
    if (this.#justComputed) {
      this.expression = "";
      this.#justComputed = false;
    }

    // Text that starts with a digit would otherwise glue onto the number
    // already being typed: 2 then the 10^ key must mean 2 x 10^n, not 210^n.
    // Symbols such as "π" and "(e)" need no help -- the tokenizer implies the
    // multiplication for those itself.
    let inserted = text;
    if (/^[0-9]/.test(text) && /[0-9.)π]$/.test(this.expression)) {
      inserted = `*${text}`;
    }

    this.expression += inserted;
    this.#atoms.push(inserted.length);
    this.#refreshPreview();
  }

  /** Append a constant such as π. */
  appendConstant(symbol: string): void {
    this.insert(symbol);
  }

  /** Square the expression so far: appends "^2". */
  square(): void {
    this.#appendPower("2");
  }

  /** Reciprocal: appends "^-1", which is 1/x. */
  reciprocal(): void {
    this.#appendPower("-1");
  }

  /** Every character becomes its own atom, the safe default after a rewrite. */
  #resetAtoms(): void {
    this.#atoms = Array.from({ length: this.expression.length }, () => 1);
  }

  /** Load a value straight into the display, as MR and history clicks do. */
  recall(value: string): void {
    this.error = null;
    this.expression = value;
    this.#resetAtoms();
    this.#justComputed = false;
    this.#refreshPreview();
  }

  /** Flip the sign of the number currently being typed. */
  toggleSign(): void {
    this.error = null;
    if (this.#justComputed && this.#result !== null) {
      this.expression = this.#result;
      this.#justComputed = false;
    }

    const match = /(\d*\.?\d+)$/.exec(this.expression);
    if (match?.[1] === undefined) return;

    const literal = match[1];
    const before = this.expression.slice(0, this.expression.length - literal.length);

    if (before.endsWith("-") && expectsOperand(before.slice(0, -1))) {
      this.expression = before.slice(0, -1) + literal;
    this.#resetAtoms();
    } else {
      this.expression = `${before}-${literal}`;
    this.#resetAtoms();
    }
    this.#refreshPreview();
  }

  /**
   * Convert the number being typed to a percentage. Inside a pending + or -,
   * it is read as "percent of what came before", so 50 + 10 % is 55 rather
   * than 50.1 -- which is how a physical calculator behaves.
   */
  percent(): void {
    this.error = null;
    if (this.#justComputed && this.#result !== null) {
      this.expression = this.#result;
      this.#justComputed = false;
    }

    const match = /(\d*\.?\d+)$/.exec(this.expression);
    if (match?.[1] === undefined) return;

    const literal = match[1];
    const start = this.expression.length - literal.length;
    const before = this.expression.slice(0, start);
    const operator = before[before.length - 1] ?? "";

    if ((operator === "+" || operator === "-") && before.length > 1) {
      const base = this.#tryEvaluate(before.slice(0, -1));
      if (base !== null) {
        this.expression = `${before}(${base}*${literal}/100)`;
    this.#resetAtoms();
        this.#refreshPreview();
        return;
      }
    }

    this.expression = `${before}(${literal}/100)`;
    this.#resetAtoms();
    this.#refreshPreview();
  }

  /** Add the displayed value to memory. */
  memoryAdd(): void {
    const value = this.#displayedValue();
    if (value === null) return;
    this.error = null;
    this.memory = roundResult(this.memory + value);
  }

  /** Subtract the displayed value from memory. */
  memorySubtract(): void {
    const value = this.#displayedValue();
    if (value === null) return;
    this.error = null;
    this.memory = roundResult(this.memory - value);
  }

  /** Copy memory into the display. */
  memoryRecall(): void {
    this.recall(this.memory.toString());
  }

  /** Empty the memory register. */
  memoryClear(): void {
    this.memory = 0;
  }

  /** Empty the history panel. */
  clearHistory(): void {
    this.#history = [];
  }

  /**
   * Evaluate the expression. Pressing "=" again repeats the last operation,
   * so 5 + 3 = gives 8, and = again gives 11.
   */
  compute(): void {
    this.error = null;

    if (this.#justComputed) {
      if (this.#repeatTail === null || this.#result === null) return;
      this.expression = this.#result + this.#repeatTail;
    }

    const expression = balanceParentheses(this.expression);
    if (expression === "") return;

    let value: number;
    try {
      value = evaluateString(expression, { angleMode: this.#angleMode });
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Invalid expression";
      return;
    }

    if (!Number.isFinite(value)) {
      this.error = "Result is not a number";
      return;
    }

    const result = roundResult(value).toString();
    this.#repeatTail = trailingOperation(expression);
    this.#history.unshift({ expression: formatExpression(expression), result });
    if (this.#history.length > MAX_HISTORY) this.#history.length = MAX_HISTORY;

    this.expression = expression;
    this.#resetAtoms();
    this.#result = result;
    this.#preview = result;
    this.#justComputed = true;
  }

  /** The expression as it should appear on the small upper line. */
  get expressionDisplay(): string {
    if (this.#justComputed) return `${formatExpression(this.expression)} =`;
    return formatExpression(this.expression);
  }

  /** The large lower line: the result, or a live preview while typing. */
  get resultDisplay(): string {
    if (this.expression === "" && this.#result === null) return "";
    return formatOperand(this.#preview);
  }

  /** How many parentheses are still open, for the display indicator. */
  get openParenCount(): number {
    return this.#openDepth();
  }

  #appendPower(exponent: string): void {
    this.error = null;
    if (this.#justComputed && this.#result !== null) {
      this.expression = this.#result;
      this.#justComputed = false;
    }
    if (this.expression === "" || this.#endsWithOperator()) return;
    this.expression += `^${exponent}`;
    this.#atoms.push(exponent.length + 1);
    this.#refreshPreview();
  }

  #endsWithOperator(): boolean {
    const last = this.expression[this.expression.length - 1] ?? "";
    return "+-*÷^".includes(last) && this.expression.length > 0;
  }

  #openDepth(): number {
    let depth = 0;
    for (const character of this.expression) {
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    return Math.max(depth, 0);
  }

  /**
   * Re-evaluate for the live preview. A half-typed tail such as "9+" is
   * previewed as "9" rather than left showing the previous expression's
   * value, which would otherwise go stale after DEL.
   */
  #refreshPreview(): void {
    this.#justComputed = false;
    if (this.expression === "") {
      this.#preview = "";
      return;
    }
    const whole = balanceParentheses(this.expression);
    const withoutTail = balanceParentheses(this.expression.replace(/[+\-*÷^]+$/, ""));
    for (const candidate of [whole, withoutTail]) {
      const value = this.#tryEvaluate(candidate);
      if (value !== null) {
        this.#preview = value;
        return;
      }
    }
    this.#preview = "";
  }

  #tryEvaluate(expression: string): string | null {
    if (expression === "") return null;
    try {
      const value = evaluateString(expression, { angleMode: this.#angleMode });
      return Number.isFinite(value) ? roundResult(value).toString() : null;
    } catch {
      return null;
    }
  }

  /** The number the memory keys act on: the preview, or the result. */
  #displayedValue(): number | null {
    const text = this.#preview !== "" ? this.#preview : this.#result;
    if (text === null || text === "") return null;
    const value = parseFloat(text);
    return isNaN(value) ? null : value;
  }
}

/** The trailing "+3" of an expression, so "=" can repeat it. */
export function trailingOperation(expression: string): string | null {
  let depth = 0;
  for (let index = expression.length - 1; index > 0; index -= 1) {
    const character = expression[index] ?? "";
    if (character === ")") depth += 1;
    else if (character === "(") depth -= 1;
    else if (depth === 0 && "+-*÷^".includes(character)) {
      // Skip a sign rather than a genuine binary operator.
      if (expectsOperand(expression.slice(0, index))) continue;
      return expression.slice(index);
    }
  }
  return null;
}

/** Space out binary operators so "12+3*4" reads as "12 + 3 * 4". */
export function formatExpression(expression: string): string {
  let out = "";
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index] ?? "";
    if ("+-*÷^".includes(character) && !expectsOperand(expression.slice(0, index))) {
      out += ` ${character} `;
    } else {
      out += character;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Format a result for display: group the integer part with thousands
 * separators while leaving the decimal part exactly as it is.
 */
export function formatOperand(operand: string): string {
  if (operand === "") return "";

  // Exponential form has no integer/decimal split to group, and grouping it
  // would render 1e-7 as "0". Show it as it is.
  if (/[eE]/.test(operand)) return operand;

  // noUncheckedIndexedAccess types both halves as `string | undefined`, which
  // is what lets the trailing-decimal case below be handled honestly.
  const [integerPart, decimalPart] = operand.split(".");
  const integerDigits = parseFloat(integerPart ?? "");
  const integerDisplay = isNaN(integerDigits)
    ? ""
    : integerDigits.toLocaleString("en", { maximumFractionDigits: 0 });

  return decimalPart === undefined
    ? integerDisplay
    : `${integerDisplay}.${decimalPart}`;
}
