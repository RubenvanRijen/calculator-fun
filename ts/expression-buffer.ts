import { balanceParentheses, expectsOperand } from "@/format.ts";

function depthOf(text: string): number {
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
  }
  return Math.max(depth, 0);
}

/**
 * The expression being typed, together with a record of how it was typed.
 *
 * Keeping that record is the point: several keys insert more than one
 * character ("sqrt(", "10^("), and DEL has to undo one *keypress*. Deciding
 * that from the text alone is wrong, because the same characters can be
 * reached one key at a time.
 *
 * This is also where a cursor will live, so the editing rules stay in one
 * place rather than spreading across the calculator.
 */
export class ExpressionBuffer {
  #text = "";
  /** How many characters each keypress added, newest last. */
  #atoms: number[] = [];
  /** Where the next insertion goes, 0..text.length. */
  #cursor = 0;

  get text(): string {
    return this.#text;
  }

  get isEmpty(): boolean {
    return this.#text === "";
  }

  get cursor(): number {
    return this.#cursor;
  }

  /** True while the cursor sits after the last character. */
  get atEnd(): boolean {
    return this.#cursor === this.#text.length;
  }

  /** Move the cursor one character left. Returns false when already there. */
  moveLeft(): boolean {
    if (this.#cursor === 0) return false;
    this.#cursor -= 1;
    return true;
  }

  /** Move the cursor one character right. Returns false when already there. */
  moveRight(): boolean {
    if (this.atEnd) return false;
    this.#cursor += 1;
    return true;
  }

  moveToStart(): void {
    this.#cursor = 0;
  }

  moveToEnd(): void {
    this.#cursor = this.#text.length;
  }

  /**
   * Insert `text` at the cursor as a single keypress, so one DEL takes all of
   * it back. Inserting anywhere but the end abandons the keypress record --
   * the text no longer lines up with the presses that built it -- and editing
   * becomes character-wise from then on, which is how a text field behaves.
   */
  push(text: string): void {
    if (text === "") return;

    if (this.atEnd) {
      this.#text += text;
      this.#atoms.push(text.length);
      this.#cursor = this.#text.length;
      return;
    }

    const at = this.#cursor;
    this.replace(this.#text.slice(0, at) + text + this.#text.slice(at));
    this.#cursor = at + text.length;
  }

  /**
   * Undo the last keypress when the cursor is at the end, or delete the single
   * character before the cursor when it is not.
   */
  pop(): void {
    if (this.#cursor === 0) return;

    if (!this.atEnd) {
      const at = this.#cursor;
      this.replace(this.#text.slice(0, at - 1) + this.#text.slice(at));
      this.#cursor = at - 1;
      return;
    }

    const atom = this.#atoms.pop() ?? 1;
    this.#text = this.#text.slice(0, -atom);
    this.#cursor = this.#text.length;
  }

  /**
   * Replace the whole expression. The record cannot survive this, so every
   * character becomes its own atom -- the safe default, since DEL then behaves
   * character-wise rather than swallowing more than it should.
   */
  replace(text: string): void {
    this.#text = text;
    this.#atoms = Array.from({ length: text.length }, () => 1);
    this.#cursor = text.length;
  }

  clear(): void {
    this.#text = "";
    this.#atoms = [];
    this.#cursor = 0;
  }

  /** The text up to the cursor -- what a trailing-literal rule should see. */
  get textBeforeCursor(): string {
    return this.#text.slice(0, this.#cursor);
  }

  /** True when there is nothing before the caret to act on. */
  get isEmptyBeforeCursor(): boolean {
    return this.#cursor === 0;
  }

  /**
   * Replace everything before the caret, keeping what follows it and leaving
   * the caret at the end of the new text. This is what the keys that rewrite
   * a literal in place -- sign and percent -- need: they must not disturb the
   * rest of the expression or throw the caret to the end of the line.
   */
  replaceBeforeCursor(text: string): void {
    const after = this.#text.slice(this.#cursor);
    this.replace(text + after);
    this.#cursor = text.length;
  }

  /** True when the text before the cursor ends with a binary operator. */
  get endsWithOperator(): boolean {
    const before = this.textBeforeCursor;
    const last = before[before.length - 1] ?? "";
    return before !== "" && "+-*÷^".includes(last);
  }

  /** True when the expression ends where an operand is expected. */
  get expectsOperand(): boolean {
    return expectsOperand(this.textBeforeCursor);
  }

  /** How many parentheses are still open across the whole expression. */
  get openDepth(): number {
    return depthOf(this.#text);
  }

  /**
   * How many are open at the caret. A ")" is inserted there, so it is this
   * count that decides whether there is anything for it to close.
   */
  get openDepthBeforeCursor(): number {
    return depthOf(this.textBeforeCursor);
  }

  /** Close what the user left open, so "sqrt(9" still evaluates. */
  get balanced(): string {
    return balanceParentheses(this.#text);
  }

  /**
   * The number literal the caret sits inside or at the end of.
   *
   * Spanning both sides of the caret is the point: with "5+1|0" the user is
   * editing the number 10, so the sign and percent keys must act on 10 rather
   * than on the "1" that happens to precede the caret.
   */
  get numberAtCursor(): { literal: string; start: number; end: number } | null {
    const run = this.numberRunAtCursor;
    if (run === null) return null;

    // A run is only a number if it reads as one. "5." and "1.2." do not, which
    // is why the decimal-point rule uses the raw run instead.
    if (!/^\d*\.?\d+([eE][+-]?\d+)?$/.test(run.literal)) return null;
    return run;
  }

  /**
   * The raw run of number characters the caret is in, whether or not it reads
   * as a finished number.
   *
   * Found by locating every literal and picking the one the caret falls in,
   * rather than scanning outwards: the caret can sit in the middle of an
   * exponent marker ("1e|-7"), where there is nothing adjacent to scan from.
   * Exponent notation counts as part of the run because results round-trip
   * through text -- "1e-7" is one number, and reading its "-" as a subtraction
   * would silently change the value.
   */
  get numberRunAtCursor(): { literal: string; start: number; end: number } | null {
    const pattern = /[\d.]+(?:[eE][+-]?\d+)?/g;

    for (
      let match = pattern.exec(this.#text);
      match !== null;
      match = pattern.exec(this.#text)
    ) {
      const start = match.index;
      const end = start + match[0].length;
      if (this.#cursor >= start && this.#cursor <= end) {
        return { literal: match[0], start, end };
      }
    }

    return null;
  }

  /** Replace a span of the text, leaving the caret after what was written. */
  replaceRange(start: number, end: number, text: string): void {
    this.replace(this.#text.slice(0, start) + text + this.#text.slice(end));
    this.#cursor = start + text.length;
  }

  /** Put the caret at `index`, clamped to the text. */
  moveTo(index: number): void {
    this.#cursor = Math.max(0, Math.min(index, this.#text.length));
  }
}
