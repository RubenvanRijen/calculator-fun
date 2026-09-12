/**
 * A number the calculator can hold exactly, of the form
 *
 *     (num · √radicand · π^piPower) / den
 *
 * That covers everything the reference hardware shows: fractions (1/2),
 * surds (2√2), surd fractions (√2/2) and multiples of π (2π/3). Anything
 * outside the form -- ln 5, sin 1, √2 + √3 -- has no exact value here, and the
 * calculator falls back to a decimal.
 */
export interface ExactValue {
  /** Signed. Zero only when the whole value is zero. */
  readonly num: bigint;
  /** Always positive. */
  readonly den: bigint;
  /** Always at least 1, and square-free. */
  readonly radicand: bigint;
  /** Integer, may be negative; π^0 means no π factor. */
  readonly piPower: number;
}
