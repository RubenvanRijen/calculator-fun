import { describe, it, expect } from "vitest";
import {
  ONE,
  PI,
  ZERO,
  add,
  divide,
  fromInteger,
  fromNumber,
  isInteger,
  isZero,
  multiply,
  negate,
  normalise,
  power,
  reciprocal,
  squareRoot,
  subtract,
  toDecimal,
  toDisplay,
  toExpression,
} from "@/exact.ts";
import { evaluateString } from "@/expression.ts";
import type { ExactValue } from "@/interfaces/exact-value.ts";

/** Build a value the way the operations do, so tests read like the maths. */
function make(num: bigint, den = 1n, radicand = 1n, piPower = 0): ExactValue {
  const value = normalise({ num, den, radicand, piPower });
  if (value === null) throw new Error("not normalisable");
  return value;
}

/** Assert a result exists and reads as `expected`. */
function expectDisplay(value: ExactValue | null, expected: string): void {
  expect(value).not.toBeNull();
  expect(toDisplay(value as ExactValue)).toBe(expected);
}

describe("normalise", () => {
  it("moves a negative denominator into the numerator", () => {
    expect(make(1n, -2n)).toEqual({ num: -1n, den: 2n, radicand: 1n, piPower: 0 });
  });

  it("reduces by the greatest common divisor", () => {
    expect(make(6n, 8n)).toEqual({ num: 3n, den: 4n, radicand: 1n, piPower: 0 });
  });

  it("pulls square factors out of the radicand", () => {
    // √8 = 2√2
    expect(make(1n, 1n, 8n)).toEqual({ num: 2n, den: 1n, radicand: 2n, piPower: 0 });
  });

  it("collapses a perfect square entirely", () => {
    expect(make(1n, 1n, 9n)).toEqual({ num: 3n, den: 1n, radicand: 1n, piPower: 0 });
  });

  it.each([0n, 1n])("treats a zero numerator or radicand as zero (%s)", (value) => {
    expect(normalise({ num: value === 0n ? 0n : 5n, den: 1n, radicand: value === 0n ? 3n : 0n, piPower: 1 }))
      .toEqual(ZERO);
  });

  it("rejects a zero denominator", () => {
    expect(normalise({ num: 1n, den: 0n, radicand: 1n, piPower: 0 })).toBeNull();
  });

  it("rejects a negative radicand", () => {
    expect(normalise({ num: 1n, den: 1n, radicand: -4n, piPower: 0 })).toBeNull();
  });

  it("gives up on a radicand too large to factor", () => {
    expect(normalise({ num: 1n, den: 1n, radicand: 10n ** 13n, piPower: 0 })).toBeNull();
  });
});

describe("fromNumber", () => {
  it.each([
    [3, "3"],
    [-3, "-3"],
    [0, "0"],
    [0.5, "1/2"],
    [0.25, "1/4"],
    [-0.75, "-3/4"],
    [1.5, "3/2"],
  ])("reads %s exactly as %s", (input, expected) => {
    expectDisplay(fromNumber(input), expected);
  });

  it("refuses a value it cannot reconstruct exactly", () => {
    expect(fromNumber(1e-7)).toBeNull();
    expect(fromNumber(Infinity)).toBeNull();
    expect(fromNumber(NaN)).toBeNull();
  });
});

describe("addition", () => {
  // The headline case: no rounding anywhere.
  it("adds thirds and sixths exactly", () => {
    expectDisplay(add(make(1n, 3n), make(1n, 6n)), "1/2");
  });

  it("adds a value to zero", () => {
    expect(add(ZERO, make(1n, 3n))).toEqual(make(1n, 3n));
    expect(add(make(1n, 3n), ZERO)).toEqual(make(1n, 3n));
  });

  it("adds like surds", () => {
    expectDisplay(add(make(1n, 1n, 2n), make(1n, 1n, 2n)), "2√2");
  });

  it("adds like multiples of pi", () => {
    expectDisplay(add(make(1n, 3n, 1n, 1), make(1n, 6n, 1n, 1)), "π/2");
  });

  it("has no exact form for unlike surds", () => {
    expect(add(make(1n, 1n, 2n), make(1n, 1n, 3n))).toBeNull();
  });

  it("has no exact form for a number plus pi", () => {
    expect(add(ONE, PI)).toBeNull();
  });

  it("subtracts to zero", () => {
    expect(subtract(make(1n, 3n), make(1n, 3n))).toEqual(ZERO);
  });
});

describe("multiplication", () => {
  it("multiplies surds into one", () => {
    expectDisplay(multiply(make(1n, 1n, 2n), make(1n, 1n, 3n)), "√6");
  });

  it("squares a surd back to an integer", () => {
    expectDisplay(multiply(make(1n, 1n, 2n), make(1n, 1n, 2n)), "2");
  });

  it("accumulates powers of pi", () => {
    expectDisplay(multiply(PI, PI), "π²");
  });

  it("is zero when either side is", () => {
    expect(multiply(ZERO, PI)).toEqual(ZERO);
    expect(multiply(PI, ZERO)).toEqual(ZERO);
  });
});

describe("reciprocal and division", () => {
  // 1/√2 is √2/2, not √2.
  it("rationalises a surd denominator", () => {
    expectDisplay(reciprocal(make(1n, 1n, 2n)), "√2/2");
  });

  it("rationalises a surd with a coefficient", () => {
    expectDisplay(reciprocal(make(2n, 1n, 2n)), "√2/4");
  });

  it("inverts a plain fraction", () => {
    expectDisplay(reciprocal(make(3n, 4n)), "4/3");
  });

  it("inverts a power of pi", () => {
    expectDisplay(reciprocal(PI), "1/π");
  });

  it("round-trips", () => {
    for (const value of [make(3n, 4n), make(1n, 1n, 2n), make(2n, 3n, 5n)]) {
      const back = reciprocal(reciprocal(value) as ExactValue);
      expect(back).toEqual(value);
    }
  });

  it("has no reciprocal of zero", () => {
    expect(reciprocal(ZERO)).toBeNull();
  });

  it("divides", () => {
    expectDisplay(divide(ONE, make(2n)), "1/2");
    expectDisplay(divide(make(1n, 1n, 2n), make(1n, 1n, 2n)), "1");
  });

  it("refuses division by zero", () => {
    expect(divide(ONE, ZERO)).toBeNull();
  });
});

describe("powers", () => {
  it.each([
    [make(2n), 3n, "8"],
    [make(1n, 2n), 2n, "1/4"],
    [make(1n, 1n, 2n), 2n, "2"],
    [make(2n), -1n, "1/2"],
    [make(2n), -2n, "1/4"],
  ])("raises to an integer power", (base, exponent, expected) => {
    expectDisplay(power(base, fromInteger(exponent)), expected);
  });

  it("is one for a zero exponent", () => {
    expectDisplay(power(make(5n), ZERO), "1");
  });

  it("has no exact form for zero to the zero", () => {
    expect(power(ZERO, ZERO)).toBeNull();
  });

  it.each([make(1n, 2n), make(1n, 1n, 2n), PI])(
    "has no exact form for a non-integer exponent",
    (exponent) => {
      expect(power(make(2n), exponent)).toBeNull();
    }
  );

  it("gives up rather than compute an enormous power", () => {
    expect(power(make(2n), fromInteger(500n))).toBeNull();
  });
});

describe("square roots", () => {
  it.each([
    [make(4n), "2"],
    [make(9n), "3"],
    [make(2n), "√2"],
    [make(8n), "2√2"],
    [make(1n, 2n), "√2/2"],
    [make(1n, 4n), "1/2"],
    [ZERO, "0"],
  ])("takes the root exactly", (value, expected) => {
    expectDisplay(squareRoot(value), expected);
  });

  it("has no exact form for a negative", () => {
    expect(squareRoot(make(-4n))).toBeNull();
  });

  it("has no exact form when a surd or pi is already present", () => {
    expect(squareRoot(make(1n, 1n, 2n))).toBeNull();
    expect(squareRoot(PI)).toBeNull();
  });
});

describe("toDecimal", () => {
  it.each([
    [make(1n, 2n), 0.5],
    [make(1n, 1n, 2n), Math.SQRT2],
    [make(1n, 2n, 2n), Math.SQRT1_2],
    [make(1n, 4n, 1n, 1), Math.PI / 4],
    [make(-3n), -3],
    [ZERO, 0],
  ])("matches the floating point value", (value, expected) => {
    expect(toDecimal(value)).toBeCloseTo(expected, 12);
  });
});

describe("toDisplay", () => {
  it.each([
    [ZERO, "0"],
    [ONE, "1"],
    [make(3n), "3"],
    [make(-3n), "-3"],
    [make(1n, 2n), "1/2"],
    [make(-1n, 2n), "-1/2"],
    [make(1n, 1n, 2n), "√2"],
    [make(2n, 1n, 2n), "2√2"],
    [make(1n, 2n, 2n), "√2/2"],
    [make(1n, 2n, 3n), "√3/2"],
    [PI, "π"],
    [make(1n, 4n, 1n, 1), "π/4"],
    [make(2n, 3n, 1n, 1), "2π/3"],
    [make(1n, 1n, 1n, 2), "π²"],
    [make(1n, 1n, 2n, 1), "√2π"],
    // "1/2π" would read as (1/2)·π rather than 1/(2π).
    [make(1n, 1n, 1n, -1), "1/π"],
    [make(1n, 2n, 1n, -1), "1/(2π)"],
  ])("reads as %s", (value, expected) => {
    expect(toDisplay(value)).toBe(expected);
  });
});

describe("toExpression", () => {
  // Distinct from toDisplay: the parser cannot read √ or π.
  it.each([
    [make(3n), "3"],
    [make(-3n), "-3"],
    [ZERO, "0"],
    [make(1n, 2n), "(1/2)"],
    [make(1n, 1n, 2n), "(sqrt(2))"],
    [make(1n, 2n, 2n), "(sqrt(2)/2)"],
    [PI, "(pi)"],
    [make(2n, 3n, 1n, 1), "(2*pi/3)"],
    // A denominator with more than one factor has to be bracketed, or
    // "1/1*pi" reparses as (1/1)*pi = pi.
    [make(1n, 1n, 1n, -1), "(1/pi)"],
    [make(1n, 2n, 1n, -1), "(1/(2*pi))"],
    [make(1n, 1n, 1n, -2), "(1/(pi*pi))"],
  ])("writes %s as %s", (value, expected) => {
    expect(toExpression(value)).toBe(expected);
  });

  // The whole point of this serialisation: it has to survive a round trip.
  it.each([
    make(1n, 2n),
    make(1n, 1n, 2n),
    make(1n, 2n, 2n),
    PI,
    make(2n, 3n, 1n, 1),
    make(1n, 1n, 1n, -1),
    make(1n, 2n, 1n, -1),
    make(-3n, 4n, 5n),
  ])("round-trips %s through the parser", (value) => {
    expect(evaluateString(toExpression(value))).toBeCloseTo(toDecimal(value), 10);
  });
});

describe("predicates", () => {
  it("recognises zero", () => {
    expect(isZero(ZERO)).toBe(true);
    expect(isZero(ONE)).toBe(false);
  });

  it("recognises a plain integer", () => {
    expect(isInteger(make(3n))).toBe(true);
    expect(isInteger(make(1n, 2n))).toBe(false);
    expect(isInteger(make(1n, 1n, 2n))).toBe(false);
    expect(isInteger(PI)).toBe(false);
  });

  it("negates", () => {
    expect(negate(make(1n, 2n))).toEqual(make(-1n, 2n));
    expect(negate(ZERO)).toEqual(ZERO);
  });
});
