import { evaluateString, isOperation } from "./expression.js";
import { ExpressionBuffer } from "./expression-buffer.js";
import { HistoryLog } from "./history-log.js";
import { MemoryRegister } from "./memory-register.js";
import {
  expectsOperand,
  formatExpression,
  formatOperand,
  roundResult,
  trailingOperation,
} from "./format.js";
import type { Operation } from "./types/operation.js";
import type { HistoryEntry } from "./interfaces/history-entry.js";
import type { AngleMode } from "./types/angle-mode.js";

/**
 * The calculator, as a facade over four collaborators: the expression being
 * typed, the history, the memory register and the formatting rules. It holds
 * no reference to the DOM, so it can be driven straight from a test; index.ts
 * is what binds it to the buttons.
 *
 * The expression is kept as text and handed to the parser, which is what lets
 * precedence and parentheses work: 2 + 3 * 4 is 14, not 20.
 */
export class Calculator {
  readonly #buffer = new ExpressionBuffer();
  readonly #history = new HistoryLog();
  readonly #memory = new MemoryRegister();

  /** Set when the last action could not be completed. Cleared on next input. */
  error: string | null = null;

  #angleMode: AngleMode = "rad";
  #result: string | null = null;
  #preview = "";
  #justComputed = false;
  /** The trailing "+3" of the last sum, so "=" can be pressed again. */
  #repeatTail: string | null = null;

  /** The expression as typed, e.g. "12+3*4". */
  get expression(): string {
    return this.#buffer.text;
  }

  /** Past calculations, most recent first. */
  get history(): readonly HistoryEntry[] {
    return this.#history.entries;
  }

  /** The memory register, as used by the MC/MR/M+/M- keys. */
  get memory(): number {
    return this.#memory.value;
  }

  set memory(value: number) {
    this.#memory.value = value;
  }

  /** Whether the display should show its "M" indicator. */
  get hasMemory(): boolean {
    return !this.#memory.isEmpty;
  }

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

  /** How many parentheses are still open, for the display indicator. */
  get openParenCount(): number {
    return this.#buffer.openDepth;
  }

  /** Restore history and memory from a previous visit. */
  restore(history: readonly HistoryEntry[], memory: number): void {
    this.#history.restore(history);
    this.#memory.value = memory;
  }

  /** Reset the current entry. Memory and history deliberately survive. */
  clear(): void {
    this.#buffer.clear();
    this.error = null;
    this.#result = null;
    this.#preview = "";
    this.#justComputed = false;
    this.#repeatTail = null;
  }

  /** Undo the last keypress. */
  delete(): void {
    this.error = null;
    if (this.#justComputed) {
      this.clear();
      return;
    }
    this.#buffer.pop();
    this.#refreshPreview();
  }

  /** Append a digit or the decimal point. */
  appendNumber(digit: string): void {
    this.#beginFreshEntry();
    // Only one decimal point per number.
    if (digit === "." && /[0-9.]*\.[0-9]*$/.test(this.#buffer.text)) return;
    this.#buffer.push(digit);
    this.#refreshPreview();
  }

  /**
   * Append raw text that one keypress produced, e.g. "π" or "10^(". Supplies a
   * multiplication when the text would otherwise glue onto the number being
   * typed: 2 then the 10^ key means 2 x 10^n, not 210^n. Symbols such as "π"
   * and "(e)" need no help -- the tokenizer implies that multiplication itself.
   */
  insert(text: string): void {
    this.#beginFreshEntry();
    const needsProduct = /^[0-9]/.test(text) && /[0-9.)π]$/.test(this.#buffer.text);
    this.#buffer.push(needsProduct ? `*${text}` : text);
    this.#refreshPreview();
  }

  /** Append a constant such as π. */
  appendConstant(symbol: string): void {
    this.insert(symbol);
  }

  /** Append a named function, ready for its argument, e.g. "sqrt(". */
  appendFunction(name: string): void {
    this.#beginFreshEntry();
    this.#buffer.push(`${name}(`);
    this.#refreshPreview();
  }

  /**
   * Append an operator, continuing from the last result where there is one, so
   * that 5 + 3 = then * 2 works on the 8.
   */
  chooseOperation(operation: Operation): void {
    this.error = null;
    if (!isOperation(operation)) return;
    this.#continueFromResult();

    // A trailing "(" has nothing to operate on, so "(" then "+" would leave
    // "(+", which can never evaluate.
    if (this.#buffer.isEmpty || this.#buffer.text.endsWith("(")) return;

    // Replace a trailing operator rather than stacking two.
    if (this.#buffer.endsWithOperator) this.#buffer.pop();
    this.#buffer.push(operation);
    this.#refreshPreview();
  }

  /** Open a parenthesis. */
  openParen(): void {
    this.#beginFreshEntry();
    this.#buffer.push("(");
    this.#refreshPreview();
  }

  /** Close a parenthesis, if there is one open to close. */
  closeParen(): void {
    this.error = null;
    if (this.#buffer.openDepth === 0 || this.#buffer.expectsOperand) return;
    this.#buffer.push(")");
    this.#refreshPreview();
  }

  /** Square the expression so far: appends "^2". */
  square(): void {
    this.#appendPower("2");
  }

  /** Reciprocal: appends "^-1", which is 1/x. */
  reciprocal(): void {
    this.#appendPower("-1");
  }

  /** Load a value straight into the display, as MR and history clicks do. */
  recall(value: string): void {
    this.error = null;
    this.#buffer.replace(value);
    this.#justComputed = false;
    this.#refreshPreview();
  }

  /** Flip the sign of the number currently being typed. */
  toggleSign(): void {
    this.error = null;
    this.#continueFromResult();

    const trailing = this.#buffer.trailingLiteral;
    if (trailing === null) return;

    const { literal, before } = trailing;
    const isAlreadyNegated =
      before.endsWith("-") && expectsOperand(before.slice(0, -1));

    this.#buffer.replace(
      isAlreadyNegated ? before.slice(0, -1) + literal : `${before}-${literal}`
    );
    this.#refreshPreview();
  }

  /**
   * Convert the number being typed to a percentage. Inside a pending + or -,
   * it is read as "percent of what came before", so 50 + 10 % is 55 rather
   * than 50.1 -- which is how a physical calculator behaves.
   */
  percent(): void {
    this.error = null;
    this.#continueFromResult();

    const trailing = this.#buffer.trailingLiteral;
    if (trailing === null) return;

    const { literal, before } = trailing;
    const operator = before[before.length - 1] ?? "";

    if ((operator === "+" || operator === "-") && before.length > 1) {
      const base = this.#tryEvaluate(before.slice(0, -1));
      if (base !== null) {
        this.#buffer.replace(`${before}(${base}*${literal}/100)`);
        this.#refreshPreview();
        return;
      }
    }

    this.#buffer.replace(`${before}(${literal}/100)`);
    this.#refreshPreview();
  }

  /** Add the displayed value to memory. */
  memoryAdd(): void {
    const value = this.#displayedValue();
    if (value === null) return;
    this.error = null;
    this.#memory.add(value);
  }

  /** Subtract the displayed value from memory. */
  memorySubtract(): void {
    const value = this.#displayedValue();
    if (value === null) return;
    this.error = null;
    this.#memory.subtract(value);
  }

  /** Copy memory into the display. */
  memoryRecall(): void {
    this.recall(this.#memory.value.toString());
  }

  /** Empty the memory register. */
  memoryClear(): void {
    this.#memory.clear();
  }

  /** Empty the history panel. */
  clearHistory(): void {
    this.#history.clear();
  }

  /**
   * Evaluate the expression. Pressing "=" again repeats the last operation,
   * so 5 + 3 = gives 8, and = again gives 11.
   */
  compute(): void {
    this.error = null;

    if (this.#justComputed) {
      if (this.#repeatTail === null || this.#result === null) return;
      this.#buffer.replace(this.#result + this.#repeatTail);
    }

    const expression = this.#buffer.balanced;
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
    this.#history.add(formatExpression(expression), result);

    this.#buffer.replace(expression);
    this.#result = result;
    this.#preview = result;
    this.#justComputed = true;
  }

  /** The expression as it should appear on the small upper line. */
  get expressionDisplay(): string {
    const formatted = formatExpression(this.#buffer.text);
    return this.#justComputed ? `${formatted} =` : formatted;
  }

  /** The large lower line: the result, or a live preview while typing. */
  get resultDisplay(): string {
    if (this.#buffer.isEmpty && this.#result === null) return "";
    return formatOperand(this.#preview);
  }

  /** Clear the error and start a new expression when one has just finished. */
  #beginFreshEntry(): void {
    this.error = null;
    if (this.#justComputed) {
      this.#buffer.clear();
      this.#justComputed = false;
    }
  }

  /** Carry the last result into the expression, for keys that build on it. */
  #continueFromResult(): void {
    if (this.#justComputed && this.#result !== null) {
      this.#buffer.replace(this.#result);
      this.#justComputed = false;
    }
  }

  #appendPower(exponent: string): void {
    this.error = null;
    this.#continueFromResult();
    if (this.#buffer.isEmpty || this.#buffer.endsWithOperator) return;
    this.#buffer.push(`^${exponent}`);
    this.#refreshPreview();
  }

  /**
   * Re-evaluate for the live preview. A half-typed tail such as "9+" is
   * previewed as "9" rather than left showing the previous expression's
   * value, which would otherwise go stale after DEL.
   */
  #refreshPreview(): void {
    this.#justComputed = false;
    if (this.#buffer.isEmpty) {
      this.#preview = "";
      return;
    }
    const whole = this.#buffer.balanced;
    const withoutTail = whole.replace(/[+\-*÷^]+$/, "");
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

/** Re-exported so existing importers keep working. */
export { formatExpression, formatOperand, trailingOperation } from "./format.js";
