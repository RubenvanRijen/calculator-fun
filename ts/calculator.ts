import { isOperation } from "@/expression.ts";
import {
  isInteger as isExactInteger,
  toDisplay as toExactDisplay,
  toExpression as toExactExpression,
  toMixedDisplay,
} from "@/exact.ts";
import type { ExactValue } from "@/interfaces/exact-value.ts";
import { ExpressionBuffer } from "@/expression-buffer.ts";
import { HistoryLog } from "@/history-log.ts";
import { MemoryRegister } from "@/memory-register.ts";
import { EntryRecall } from "@/entry-recall.ts";
import { Environment } from "@/environment.ts";
import {
  balanceParentheses,
  expectsOperand,
  trailingOperatorLength,
  formatExpression,
  formatExpressionWithCursor,
  formatOperand,
  roundResult,
  trailingOperation,
} from "@/format.ts";
import type { Operation } from "@/types/operation.ts";
import type { HistoryEntry } from "@/interfaces/history-entry.ts";
import type { AngleMode } from "@/types/angle-mode.ts";
import type { RegisterName } from "@/types/register-name.ts";

/**
 * The calculator, as a facade over four collaborators: the expression being
 * typed, the history, the memory register and the formatting rules. It holds
 * no reference to the DOM, so it can be driven straight from a test; index.ts
 * is what binds it to the buttons.
 *
 * The expression is kept as text and handed to the parser, which is what lets
 * precedence and parentheses work: 2 + 3 * 4 is 14, not 20.
 */
/** Entry templates, which delete as one thing until they are typed into. */
const TEMPLATES: readonly string[] = ["(/)", "(+/)"];

export class Calculator {
  readonly #buffer = new ExpressionBuffer();
  readonly #history = new HistoryLog();
  readonly #memory = new MemoryRegister();
  readonly #recall = new EntryRecall();
  /** The angle mode, Ans and the stored letters: what survives AC. */
  readonly #environment = new Environment();

  /** Set when the last action could not be completed. Cleared on next input. */
  error: string | null = null;

  #result: string | null = null;
  #preview = "";
  #justComputed = false;
  /** The trailing "+3" of the last sum, so "=" can be pressed again. */
  #repeatTail: string | null = null;
  /** How the last result reads exactly, when it has an exact form. */
  #exact: string | null = null;
  /** The same value, kept so it can be carried forward without rounding. */
  #exactValue: ExactValue | null = null;
  /** Whether the display is showing the exact form rather than the decimal. */
  #showingExact = true;
  /** Whether the entry being typed used the mixed-number key. */
  #usedMixed = false;
  /** Whether the answer on screen should be written as a mixed number. */
  #showingMixed = false;

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
    return this.#environment.angleMode;
  }

  /**
   * Setting it re-evaluates the preview: otherwise the display would keep
   * showing a value worked out in the previous mode, and M+ would bank it.
   */
  set angleMode(mode: AngleMode) {
    this.#environment.angleMode = mode;
    // The mode first, then the preview, which reads it.
    this.#refreshPreview();
  }

  /** What is stored under each letter. */
  get registers(): Readonly<Partial<Record<RegisterName, number>>> {
    return this.#environment.registers;
  }

  /** Store the value currently on the display under `name`. */
  store(name: RegisterName): void {
    const value = this.#displayedValue();
    if (value === null) {
      this.error = "Nothing to store";
      return;
    }
    this.error = null;
    this.#environment.store(name, value);
    // What is on screen may depend on this register.
    this.#refreshPreview();
  }

  /** Forget what is stored under `name`. */
  clearRegister(name: RegisterName): void {
    this.#environment.clearRegister(name);
    this.#refreshPreview();
  }

  /** Insert a reference to a stored value. */
  appendRegister(name: RegisterName): void {
    this.#beginFreshEntry();
    this.#buffer.push(name);
    this.#refreshPreview();
  }

  /**
   * Insert a random number. The value is fixed at the moment the key is
   * pressed rather than re-rolled on every evaluation, so the live preview
   * does not flicker and the answer matches what was on screen.
   */
  appendRandom(): void {
    this.insert(Math.random().toFixed(6));
  }

  /** How many parentheses are still open, for the display indicator. */
  get openParenCount(): number {
    return this.#buffer.openDepth;
  }

  /** Where the caret sits within `expression`. */
  get cursor(): number {
    return this.#buffer.cursor;
  }

  /** Move the caret one character left. Returns false when it could not. */
  moveLeft(): boolean {
    this.error = null;
    this.#settleAfterCompute();
    return this.#buffer.moveLeft();
  }

  /** Move the caret one character right. Returns false when it could not. */
  moveRight(): boolean {
    this.error = null;
    this.#settleAfterCompute();
    return this.#buffer.moveRight();
  }

  /** Step back through previously computed expressions. */
  recallPrevious(): boolean {
    if (this.#recall.isEmpty) return false;
    this.error = null;
    this.#loadEntry(this.#recall.previous());
    return true;
  }

  /** Step forward again; past the newest entry the expression is cleared. */
  recallNext(): boolean {
    if (this.#recall.isEmpty) return false;
    this.error = null;
    this.#loadEntry(this.#recall.next());
    return true;
  }

  /**
   * Start a fraction: inserts "(/)" with the caret between the brackets, so
   * the numerator is typed, then the caret moved right past the slash for the
   * denominator. Wrapping it keeps the fraction whole inside a larger sum.
   */
  appendFraction(): void {
    this.#beginFreshEntry();
    this.#buffer.push("(/)");
    this.#buffer.moveLeft();
    this.#buffer.moveLeft();
    this.#refreshPreview();
  }

  /**
   * Start the exponent of a number written in scientific notation.
   *
   * With a number to attach to, "e" is the exponent marker the parser already
   * reads. With nothing to attach to it would be Euler's constant instead --
   * so the key would quietly become a second pi/e key -- and "1e" is what was
   * meant: ten to the power of whatever comes next.
   */
  appendExponent(): void {
    this.#beginFreshEntry();
    const before = this.#buffer.textBeforeCursor;
    // One exponent per number. A second would read as Euler's constant --
    // "1e1e3" is 81.5, not an error -- so there is nothing to warn about
    // afterwards and the key simply does not take.
    if (/[0-9.]e[+-]?[0-9]*$/i.test(before)) return;

    this.#buffer.push(/[0-9.]$/.test(before) ? "e" : "1e");
    this.#refreshPreview();
  }

  /**
   * Start a mixed number: a whole part, then a fraction.
   *
   * Written out as the sum it is -- "(2+1/3)" -- because the expression line
   * is plain text and this calculator multiplies by juxtaposition, so a
   * space-separated "2 1/3" would read as 2 x 1/3. The arrows walk between the
   * three places to type, and the answer comes back as a mixed number.
   */
  appendMixedFraction(): void {
    this.#beginFreshEntry();
    this.#buffer.push("(+/)");
    this.#buffer.moveLeft();
    this.#buffer.moveLeft();
    this.#buffer.moveLeft();
    this.#usedMixed = true;
    this.#refreshPreview();
  }

  /** Append a factorial, which applies to the value already there. */
  appendFactorial(): void {
    this.error = null;
    this.#continueFromResult();
    if (this.#buffer.isEmptyBeforeCursor || this.#buffer.endsWithOperator) return;
    this.#buffer.push("!");
    this.#refreshPreview();
  }

  /** Insert a reference to the previous result. */
  appendAns(): void {
    this.#beginFreshEntry();
    this.#buffer.push("ans");
    this.#refreshPreview();
  }

  /**
   * Bring back what a previous visit left. Taken as one object rather than a
   * growing list of positional arguments, and so that a caller cannot restore
   * the history while silently dropping the answer it refers to.
   */
  restore(state: {
    history?: readonly HistoryEntry[] | undefined;
    memory?: number | undefined;
    lastAnswer?: number | null | undefined;
    entries?: readonly string[] | undefined;
    registers?: Readonly<Partial<Record<RegisterName, number>>> | undefined;
  }): void {
    this.#history.restore(state.history ?? []);
    this.#memory.value = state.memory ?? 0;

    this.#recall.restore(state.entries ?? []);
    this.#environment.restore(state);
  }

  /** The value Ans refers to, for persistence. */
  get lastAnswer(): number | null {
    return this.#environment.lastAnswer;
  }

  /** The expressions the arrows walk through, for persistence. */
  get entries(): readonly string[] {
    return this.#recall.entries;
  }

  /** Reset the current entry. Memory, history and recall deliberately survive. */
  clear(): void {
    this.#buffer.clear();
    this.#recall.stopBrowsing();
    this.error = null;
    this.#result = null;
    this.#preview = "";
    this.#exact = null;
    this.#exactValue = null;
    this.#showingExact = true;
    this.#usedMixed = false;
    this.#showingMixed = false;
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

    // A template nobody has typed into yet goes as a whole. Its own keypress
    // put the caret inside it, which is what makes DELETE character-wise from
    // then on -- and taking one bracket off "(+/)" leaves "+/)" behind to
    // wreck whatever is typed next.
    if (TEMPLATES.includes(this.#buffer.text)) {
      this.#buffer.clear();
      this.#refreshPreview();
      return;
    }

    this.#buffer.pop();
    this.#refreshPreview();
  }

  /** Append a digit or the decimal point. */
  appendNumber(digit: string): void {
    this.#beginFreshEntry();
    // Only one decimal point per number.
    // The rule is one point per *number*, so it has to see the digits on both
    // sides of the caret: with "1|.5" there is already a point in this number.
    // The raw run, because "5." is exactly the case this has to catch and it
    // is not yet a number.
    const run = this.#buffer.numberRunAtCursor?.literal ?? "";
    if (digit === "." && run.includes(".")) return;
    // An exponent is a whole number of tens, so a point after one would make
    // "2e.5" -- which the parser reads as 2 x e x 0.5, a different sum
    // entirely, and reports no error about.
    if (digit === "." && /e/i.test(this.#buffer.textBeforeCursor.slice(run.length ? -run.length : 0))) {
      return;
    }
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
    const needsProduct =
      /^[0-9]/.test(text) && /[0-9.)π]$/.test(this.#buffer.textBeforeCursor);
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

    const before = this.#buffer.textBeforeCursor;
    const atStart = this.#buffer.isEmptyBeforeCursor || before.endsWith("(");

    // A minus where an operand is expected is a sign, not a subtraction, so
    // "-2^2" can be typed and reads as -(2^2). Every other operator has
    // nothing to act on there.
    if (atStart) {
      if (operation === "-") {
        this.#buffer.push("-");
        this.#refreshPreview();
      }
      return;
    }

    // A lone sign is not something to build on either: "-" then "+" must not
    // leave a leading "+".
    if (before === "-") return;

    // Replace a trailing operator rather than stacking two -- popOperator,
    // because nCr is three characters, not one.
    if (this.#buffer.endsWithOperator) this.#buffer.popOperator();
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
    // Both counts matter: there has to be a "(" before the caret to close, and
    // the expression as a whole has to have one still unclosed -- otherwise a
    // ")" typed mid-expression closes a bracket that is already matched.
    if (
      this.#buffer.openDepthBeforeCursor === 0 ||
      this.#buffer.openDepth === 0 ||
      this.#buffer.expectsOperand
    ) {
      return;
    }
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

    // An exponent with nothing in it yet is what the sign key is reaching
    // for: the number run stops at the "e", so without this the key does
    // nothing at all at "2e", which is exactly where it is wanted.
    if (this.#toggleExponentSign()) return;

    const number = this.#buffer.numberAtCursor ?? this.#buffer.wholeGroup;
    if (number === null) return;

    const { literal, start, end } = number;
    const before = this.#buffer.text.slice(0, start);
    const isAlreadyNegated =
      before.endsWith("-") && expectsOperand(before.slice(0, -1));

    if (isAlreadyNegated) {
      this.#buffer.replaceRange(start - 1, end, literal);
    } else {
      this.#buffer.replaceRange(start, end, `-${literal}`);
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
    this.#continueFromResult();

    const number = this.#buffer.numberAtCursor ?? this.#buffer.wholeGroup;
    if (number === null) return;

    const { literal, start, end } = number;
    const before = this.#buffer.text.slice(0, start);
    const operator = before[before.length - 1] ?? "";

    if ((operator === "+" || operator === "-") && before.length > 1) {
      const base = this.#environment.tryEvaluate(before.slice(0, -1));
      if (base !== null) {
        this.#buffer.replaceRange(start, end, `(${base}*${literal}/100)`);
        this.#refreshPreview();
        return;
      }
    }

    this.#buffer.replaceRange(start, end, `(${literal}/100)`);
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

  /** Empty the history panel, and the entries the arrows walk through. */
  clearHistory(): void {
    this.#history.clear();
    this.#recall.clear();
  }

  /**
   * Evaluate the expression. Pressing "=" again repeats the last operation,
   * so 5 + 3 = gives 8, and = again gives 11.
   */
  compute(): void {
    this.error = null;

    if (this.#justComputed) {
      if (this.#repeatTail === null || this.#result === null) return;
      // The same exact carry the operator keys get, so "1÷3= =" gives 1/9
      // rather than 0.111111111111.
      const carried =
        this.#exactValue !== null && !isExactInteger(this.#exactValue)
          ? toExactExpression(this.#exactValue)
          : this.#repeatTail.startsWith("^") && this.#result.startsWith("-")
            ? `(${this.#result})`
            : this.#result;
      this.#buffer.replace(carried + this.#repeatTail);
    }

    const expression = this.#buffer.balanced;
    if (expression === "") return;

    let value: number;
    try {
      value = this.#environment.evaluate(expression);
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Invalid expression";
      return;
    }

    if (!Number.isFinite(value)) {
      this.error = "Result is not a number";
      return;
    }

    const result = roundResult(value).toString();
    this.#exactValue = this.#environment.exactValueOf(expression);
    this.#exact = this.#displayableExact(this.#exactValue, result);
    // An answer keeps the form of the question, as it does on the hardware:
    // ask in fractions and get a fraction, ask in decimals and get a decimal.
    // F<->D swaps either way.
    this.#showingExact = !expression.includes(".");
    // Same rule for the shape of the fraction: ask with a mixed number and
    // the answer comes back as one.
    this.#showingMixed = this.#usedMixed;
    this.#repeatTail = trailingOperation(expression);
    // The history shows what the display showed, and recalls a form the
    // parser can read back.
    this.#history.add(
      formatExpression(expression),
      // What the display showed, mixed number and all. The recall value is
      // separate and stays something the parser can read back.
      this.#showingExact && this.#exact !== null
        ? this.#mixedResult() ?? this.#exact
        : result,
      this.#exactValue !== null ? toExactExpression(this.#exactValue) : result
    );

    this.#recall.add(expression);

    this.#buffer.replace(expression);
    this.#result = result;
    this.#environment.remember(value);
    this.#preview = result;
    this.#justComputed = true;
  }

  /** The expression as it should appear on the small upper line. */
  get expressionDisplay(): string {
    const { text } = formatExpressionWithCursor(this.#buffer.text, this.#buffer.cursor);
    return this.#justComputed ? `${text} =` : text;
  }

  /**
   * Where the caret goes within `expressionDisplay`, or null when there should
   * not be one -- a finished calculation is a result, not something being
   * edited.
   */
  get displayCursor(): number | null {
    if (this.#justComputed) return null;
    return formatExpressionWithCursor(this.#buffer.text, this.#buffer.cursor).cursor;
  }

  /** The large lower line: the result, or a live preview while typing. */
  get resultDisplay(): string {
    if (this.#buffer.isEmpty && this.#result === null) return "";
    if (this.#justComputed && this.#showingExact && this.#exact !== null) {
      return this.#mixedResult() ?? this.#exact;
    }
    return formatOperand(this.#preview);
  }

  /**
   * Set the sign of an exponent that has not been typed yet.
   *
   * Only while it is still empty. Once there are digits in it the number is a
   * number again, and the sign key means what it always means: negating
   * "1e-7" gives "-1e-7", not "1e7".
   *
   * Returns whether it did anything, so the caller can fall through.
   */
  #toggleExponentSign(): boolean {
    const before = this.#buffer.textBeforeCursor;
    const match = /[0-9.]e([+-]?)$/i.exec(before);
    if (match === null) return false;

    const sign = match[1] ?? "";
    const from = before.length - sign.length;
    this.#buffer.replaceRange(from, from + sign.length, sign === "-" ? "" : "-");
    this.#refreshPreview();
    return true;
  }

  /** The answer as a mixed number, when one was asked for and one exists. */
  #mixedResult(): string | null {
    if (!this.#showingMixed || this.#exactValue === null) return null;
    return toMixedDisplay(this.#exactValue);
  }

  /** Whether there is an exact form to toggle to, for the F<->D key. */
  get hasExactForm(): boolean {
    return this.#justComputed && this.#exact !== null;
  }

  /** Whether the exact form is the one currently on screen. */
  get isShowingExact(): boolean {
    return this.hasExactForm && this.#showingExact;
  }

  /** Swap between the exact form and the decimal. */
  toggleExact(): void {
    if (!this.hasExactForm) return;
    this.#showingExact = !this.#showingExact;
  }

  /**
   * Whether an exact value is worth showing.
   *
   * A form that reads the same as the decimal is skipped, which covers plain
   * integers without needing a rule of its own: 2 + 2 is "4" both ways. Where
   * they differ the exact form is shown, including the integer 0 that the
   * float missed.
   *
   * Deliberately *not* cross-checked against the float. Where the two differ
   * it is the float that has drifted -- sin(180^5 degrees) is exactly 0, while
   * the float says -2.4e-7 -- so rejecting the exact value on disagreement
   * would discard the correct answer in favour of the wrong one. A tolerance
   * loose enough to accept that drift could not catch a real bug either. The
   * exact path is guarded by its own tests instead.
   */
  #displayableExact(value: ExactValue | null, decimal: string): string | null {
    if (value === null) return null;
    const display = toExactDisplay(value);
    return display === decimal ? null : display;
  }

  /** Clear the error and start a new expression when one has just finished. */
  #beginFreshEntry(): void {
    this.error = null;
    if (this.#justComputed) {
      this.#buffer.clear();
      this.#justComputed = false;
      // The shape of the last question says nothing about the next one.
      this.#usedMixed = false;
    }
  }

  /**
   * Carry the last result into the expression, for keys that build on it.
   * `bracketNegative` is for keys that append something binding tighter than
   * unary minus: -7 then x^2 must be (-7)^2 = 49, not -(7^2) = -49.
   */
  #continueFromResult(bracketNegative = false): void {
    if (!this.#justComputed || this.#result === null) return;

    // A non-integer exact value is carried in a form the parser can read back,
    // so continuing from a displayed 1/3 and multiplying by 3 gives exactly 1.
    // It is already bracketed, so it needs no help with a negative. A plain
    // integer is left to the decimal path below, which does handle that.
    if (this.#exactValue !== null && !isExactInteger(this.#exactValue)) {
      this.#buffer.replace(toExactExpression(this.#exactValue));
      this.#justComputed = false;
      return;
    }

    const carried =
      bracketNegative && this.#result.startsWith("-")
        ? `(${this.#result})`
        : this.#result;
    this.#buffer.replace(carried);
    this.#justComputed = false;
  }

  #appendPower(exponent: string): void {
    this.error = null;
    this.#continueFromResult(true);
    // A power applies to the whole number the caret is in, not to the digits
    // that happen to precede it: "1|2+3" then x^2 is 12^2, not 1^22.
    const number = this.#buffer.numberAtCursor;
    if (number !== null) this.#buffer.moveTo(number.end);

    if (this.#buffer.isEmptyBeforeCursor || this.#buffer.endsWithOperator) return;
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
    let stripped = this.#buffer.text;
    for (let length = trailingOperatorLength(stripped); length > 0; ) {
      stripped = stripped.slice(0, -length);
      length = trailingOperatorLength(stripped);
    }
    const withoutTail = balanceParentheses(stripped);
    for (const candidate of [whole, withoutTail]) {
      const value = this.#environment.tryEvaluate(candidate);
      if (value !== null) {
        this.#preview = value;
        return;
      }
    }
    this.#preview = "";
  }

  /** Put an entry in the buffer; nothing to put there means clear it. */
  #loadEntry(entry: string | undefined): void {
    if (entry === undefined) {
      this.#buffer.clear();
    } else {
      this.#buffer.replace(entry);
    }
    this.#justComputed = false;
    this.#refreshPreview();
  }

  /** After "=", the next edit continues from the balanced expression. */
  #settleAfterCompute(): void {
    if (this.#justComputed) this.#justComputed = false;
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
export {
  formatExpression,
  formatExpressionWithCursor,
  formatOperand,
  trailingOperation,
} from "@/format.ts";
