import {
  isInteger as isExactInteger,
  toDisplay as toExactDisplay,
  toExpression as toExactExpression,
  toMixedDisplay,
} from "@/exact.ts";
import type { ExactValue } from "@/interfaces/exact-value.ts";

/**
 * Whether an exact value is worth showing.
 *
 * A form that reads the same as the decimal is skipped, which covers plain
 * integers without needing a rule of its own: 2 + 2 is "4" both ways. Where
 * they differ the exact form is shown, including the integer 0 that the float
 * missed.
 *
 * Deliberately *not* cross-checked against the float. Where the two differ it
 * is the float that has drifted -- sin(180^5 degrees) is exactly 0, while the
 * float says -2.4e-7 -- so rejecting the exact value on disagreement would
 * discard the correct answer in favour of the wrong one. A tolerance loose
 * enough to accept that drift could not catch a real bug either. The exact
 * path is guarded by its own tests instead.
 */
function displayable(value: ExactValue | null, decimal: string): string | null {
  if (value === null) return null;
  const display = toExactDisplay(value);
  return display === decimal ? null : display;
}

/**
 * The exact reading of the last answer, and which form it is being shown in.
 *
 * Holds no opinion about whether a calculation has just finished -- that is
 * the calculator's own state, and it gates this from outside. This answers the
 * narrower question: is there an exact form, and what does it read as.
 */
export class ExactResult {
  #value: ExactValue | null = null;
  #display: string | null = null;
  #showingExact = true;
  #showingMixed = false;

  /**
   * Take the exact reading of a finished calculation.
   *
   * An answer keeps the form of the question, as it does on the hardware: ask
   * in fractions and get a fraction, ask in decimals and get a decimal, and
   * ask with a mixed number and get one of those. F<->D swaps either way.
   */
  record(answer: {
    /** The exact reading, where the expression has one. */
    value: ExactValue | null;
    /** The question, which is what says which form to show. */
    expression: string;
    /** The rounded decimal, to tell an exact form worth showing from noise. */
    decimal: string;
    /** Whether the question was asked with a mixed number. */
    mixed: boolean;
  }): void {
    this.#value = answer.value;
    this.#display = displayable(answer.value, answer.decimal);
    this.#showingExact = !answer.expression.includes(".");
    this.#showingMixed = answer.mixed;
  }

  /** Whether there is an exact form to toggle to, for the F<->D key. */
  get hasForm(): boolean {
    return this.#display !== null;
  }

  /** Whether the exact form is the one being shown. */
  get showing(): boolean {
    return this.#showingExact;
  }

  toggle(): void {
    this.#showingExact = !this.#showingExact;
  }

  /**
   * What the display should read, or null to fall back to the decimal.
   *
   * Mixed number and all: the display and the history row both ask this, so
   * they cannot drift into showing different things.
   */
  get shown(): string | null {
    if (!this.#showingExact || this.#display === null) return null;
    if (!this.#showingMixed || this.#value === null) return this.#display;
    return toMixedDisplay(this.#value) ?? this.#display;
  }

  /**
   * A form the parser can read back, for continuing from what is on screen --
   * or null when the decimal will do just as well.
   *
   * Plain integers are left to the decimal path, which handles bracketing a
   * negative; anything else is already bracketed and needs no help. This is
   * what makes 1/3 x 3 exactly 1 rather than 0.999999999999.
   */
  get carry(): string | null {
    if (this.#value === null || isExactInteger(this.#value)) return null;
    return toExactExpression(this.#value);
  }

  /** The same, for any value at all: what the history recalls. */
  get asExpression(): string | null {
    return this.#value === null ? null : toExactExpression(this.#value);
  }

  /** Forget the answer. The next one is shown exactly again, as AC leaves it. */
  clear(): void {
    this.#value = null;
    this.#display = null;
    this.#showingExact = true;
    this.#showingMixed = false;
  }
}
