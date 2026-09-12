import { expectsOperand } from "./format.js";

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

  get text(): string {
    return this.#text;
  }

  get isEmpty(): boolean {
    return this.#text === "";
  }

  /** Append `text` as a single keypress, so one DEL takes all of it back. */
  push(text: string): void {
    if (text === "") return;
    this.#text += text;
    this.#atoms.push(text.length);
  }

  /** Undo the last keypress, whatever it contributed. */
  pop(): void {
    const atom = this.#atoms.pop() ?? 1;
    this.#text = this.#text.slice(0, -atom);
  }

  /** Drop the last character without disturbing the rest of the record. */
  popCharacter(): void {
    if (this.#text === "") return;
    this.#text = this.#text.slice(0, -1);
    const atom = this.#atoms.pop() ?? 1;
    if (atom > 1) this.#atoms.push(atom - 1);
  }

  /**
   * Replace the whole expression. The record cannot survive this, so every
   * character becomes its own atom -- the safe default, since DEL then behaves
   * character-wise rather than swallowing more than it should.
   */
  replace(text: string): void {
    this.#text = text;
    this.#atoms = Array.from({ length: text.length }, () => 1);
  }

  clear(): void {
    this.#text = "";
    this.#atoms = [];
  }

  /** True when the expression ends with a binary operator. */
  get endsWithOperator(): boolean {
    const last = this.#text[this.#text.length - 1] ?? "";
    return this.#text !== "" && "+-*÷^".includes(last);
  }

  /** True when the expression ends where an operand is expected. */
  get expectsOperand(): boolean {
    return expectsOperand(this.#text);
  }

  /** How many parentheses are still open. */
  get openDepth(): number {
    let depth = 0;
    for (const character of this.#text) {
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    return Math.max(depth, 0);
  }

  /** Close what the user left open, so "sqrt(9" still evaluates. */
  get balanced(): string {
    const depth = this.openDepth;
    return depth > 0 ? this.#text + ")".repeat(depth) : this.#text;
  }

  /** The number literal the expression ends with, if it ends with one. */
  get trailingLiteral(): { literal: string; before: string } | null {
    const match = /(\d*\.?\d+)$/.exec(this.#text);
    const literal = match?.[1];
    if (literal === undefined) return null;
    return {
      literal,
      before: this.#text.slice(0, this.#text.length - literal.length),
    };
  }
}
