import type { ExactValue } from "@/interfaces/exact-value.ts";

/**
 * Exact arithmetic on values of the form (num · √radicand · π^piPower) / den.
 *
 * Every operation returns null rather than an approximation when the result
 * would leave that form, so callers can fall back to floating point. Nothing
 * here rounds: the whole point is that 1/3 + 1/6 is exactly 1/2.
 */

/** Beyond this, factoring the radicand is not worth the time. */
const MAX_RADICAND = 10n ** 12n;

export const ZERO: ExactValue = { num: 0n, den: 1n, radicand: 1n, piPower: 0 };
export const ONE: ExactValue = { num: 1n, den: 1n, radicand: 1n, piPower: 0 };
export const PI: ExactValue = { num: 1n, den: 1n, radicand: 1n, piPower: 1 };

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = absolute(a);
  let y = absolute(b);
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

/** √(a²·b) is a√b, so pull every square factor out of the radicand. */
function extractSquares(radicand: bigint): { factor: bigint; rest: bigint } | null {
  if (radicand > MAX_RADICAND) return null;

  let factor = 1n;
  let rest = radicand;
  for (let candidate = 2n; candidate * candidate <= rest; candidate += 1n) {
    const square = candidate * candidate;
    while (rest % square === 0n) {
      rest /= square;
      factor *= candidate;
    }
  }
  return { factor, rest };
}

/** Put a raw value into the single canonical shape the type promises. */
export function normalise(value: {
  num: bigint;
  den: bigint;
  radicand: bigint;
  piPower: number;
}): ExactValue | null {
  if (value.den === 0n) return null;
  if (value.radicand < 0n) return null;
  if (value.radicand === 0n || value.num === 0n) return ZERO;

  const squares = extractSquares(value.radicand);
  if (squares === null) return null;

  let num = value.num * squares.factor;
  let den = value.den;
  if (den < 0n) {
    num = -num;
    den = -den;
  }

  const divisor = gcd(num, den);
  if (divisor > 1n) {
    num /= divisor;
    den /= divisor;
  }

  return { num, den, radicand: squares.rest, piPower: value.piPower };
}

/** An exact integer. */
export function fromInteger(value: bigint): ExactValue {
  return value === 0n ? ZERO : { num: value, den: 1n, radicand: 1n, piPower: 0 };
}

/**
 * The exact value of a decimal literal, when it has one. "0.25" is 1/4
 * exactly; a float that did not come from a literal has no business here, so
 * anything that is not a finite short decimal returns null.
 */
export function fromNumber(value: number): ExactValue | null {
  if (!Number.isFinite(value)) return null;
  if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
    return fromInteger(BigInt(value));
  }

  const text = String(value);
  // Exponential form and long tails are not worth reconstructing exactly.
  const match = /^(-?)(\d+)\.(\d{1,15})$/.exec(text);
  if (match === null) return null;

  const [, sign, whole, fraction] = match;
  const den = 10n ** BigInt((fraction ?? "").length);
  const num = BigInt((whole ?? "0") + (fraction ?? "")) * (sign === "-" ? -1n : 1n);
  return normalise({ num, den, radicand: 1n, piPower: 0 });
}

export function isZero(value: ExactValue): boolean {
  return value.num === 0n;
}

/** Whether two values can be added without leaving the form. */
function sameKind(a: ExactValue, b: ExactValue): boolean {
  return a.radicand === b.radicand && a.piPower === b.piPower;
}

export function add(a: ExactValue, b: ExactValue): ExactValue | null {
  if (isZero(a)) return b;
  if (isZero(b)) return a;
  // √2 + √3 has no form here, and neither does 1 + π.
  if (!sameKind(a, b)) return null;

  return normalise({
    num: a.num * b.den + b.num * a.den,
    den: a.den * b.den,
    radicand: a.radicand,
    piPower: a.piPower,
  });
}

export function negate(value: ExactValue): ExactValue {
  return isZero(value) ? ZERO : { ...value, num: -value.num };
}

export function subtract(a: ExactValue, b: ExactValue): ExactValue | null {
  return add(a, negate(b));
}

export function multiply(a: ExactValue, b: ExactValue): ExactValue | null {
  if (isZero(a) || isZero(b)) return ZERO;
  return normalise({
    num: a.num * b.num,
    den: a.den * b.den,
    // √2·√3 is √6; the square extraction in normalise turns √2·√2 back into 2.
    radicand: a.radicand * b.radicand,
    piPower: a.piPower + b.piPower,
  });
}

/** 1/x, rationalising the surd: 1/√2 is √2/2. */
export function reciprocal(value: ExactValue): ExactValue | null {
  if (isZero(value)) return null;
  return normalise({
    num: value.den * value.radicand,
    den: value.num * value.radicand,
    radicand: value.radicand,
    piPower: -value.piPower,
  });
}

export function divide(a: ExactValue, b: ExactValue): ExactValue | null {
  const inverse = reciprocal(b);
  return inverse === null ? null : multiply(a, inverse);
}

/** Integer powers only; anything else leaves the form. */
export function power(base: ExactValue, exponent: ExactValue): ExactValue | null {
  if (exponent.den !== 1n || exponent.radicand !== 1n || exponent.piPower !== 0) {
    return null;
  }

  const times = exponent.num;
  if (times > 64n || times < -64n) return null;
  if (times === 0n) return isZero(base) ? null : ONE;

  const repeats = absolute(times);
  let result: ExactValue | null = ONE;
  for (let i = 0n; i < repeats; i += 1n) {
    result = result === null ? null : multiply(result, base);
    if (result === null) return null;
  }

  return times < 0n ? reciprocal(result) : result;
}

/** √(n/d) is √(n·d)/d, exact whenever there is no surd or π already present. */
export function squareRoot(value: ExactValue): ExactValue | null {
  if (isZero(value)) return ZERO;
  if (value.radicand !== 1n || value.piPower !== 0) return null;
  if (value.num < 0n) return null;

  return normalise({
    num: 1n,
    den: value.den,
    radicand: value.num * value.den,
    piPower: 0,
  });
}

/** The ordinary floating-point value, for comparison and fallback. */
export function toDecimal(value: ExactValue): number {
  const ratio = Number(value.num) / Number(value.den);
  return ratio * Math.sqrt(Number(value.radicand)) * Math.PI ** value.piPower;
}

/** Whether this is a plain integer, which needs no special display. */
export function isInteger(value: ExactValue): boolean {
  return value.den === 1n && value.radicand === 1n && value.piPower === 0;
}

function superscript(power: number): string {
  const digits: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };
  return [...String(power)].map((digit) => digits[digit] ?? digit).join("");
}

/** One side of the fraction, e.g. "2√3π" or "√2". */
function partsFor(coefficient: bigint, radicand: bigint, piPower: number): string {
  const symbols =
    (radicand === 1n ? "" : `√${radicand}`) +
    (piPower === 0 ? "" : piPower === 1 ? "π" : `π${superscript(piPower)}`);

  if (symbols === "") return String(coefficient);
  return coefficient === 1n ? symbols : `${coefficient}${symbols}`;
}

/** How the value should read on screen: "√2/2", "2π/3", "1/2", "-3". */
export function toDisplay(value: ExactValue): string {
  if (isZero(value)) return "0";

  const sign = value.num < 0n ? "-" : "";
  const magnitude = absolute(value.num);

  // A negative power of π belongs under the line.
  const numerator = partsFor(magnitude, value.radicand, Math.max(value.piPower, 0));
  const denominator =
    value.piPower < 0
      ? partsFor(value.den, 1n, -value.piPower)
      : value.den === 1n
        ? ""
        : String(value.den);

  return denominator === "" ? `${sign}${numerator}` : `${sign}${numerator}/${denominator}`;
}
