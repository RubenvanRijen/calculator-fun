import { describe, it, expect } from "vitest";
import { tokenize, toRpn } from "@/expression.ts";
import { evaluateExactRpn } from "@/exact-evaluator.ts";
import { toDecimal, toDisplay } from "@/exact.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";

/** Evaluate text exactly, returning how it should read, or null. */
function exact(input: string, context: EvalContext = {}): string | null {
  const value = evaluateExactRpn(toRpn(tokenize(input)), context);
  return value === null ? null : toDisplay(value);
}

describe("exact arithmetic through the parser", () => {
  it.each([
    ["1/3+1/6", "1/2"],
    ["1/2+1/2", "1"],
    ["2/4", "1/2"],
    ["1-1/3", "2/3"],
    ["2*3", "6"],
    ["10/4", "5/2"],
    ["0.25+0.25", "1/2"],
    ["1/3*3", "1"],
    ["(1/2)^2", "1/4"],
    ["2^10", "1024"],
    ["2^-2", "1/4"],
  ])("%s is exactly %s", (input, expected) => {
    expect(exact(input)).toBe(expected);
  });
});

describe("surds", () => {
  it.each([
    ["sqrt(8)", "2√2"],
    ["sqrt(2)", "√2"],
    ["sqrt(9)", "3"],
    ["sqrt(1/2)", "√2/2"],
    ["1/sqrt(2)", "√2/2"],
    ["sqrt(2)*sqrt(3)", "√6"],
    ["sqrt(2)*sqrt(2)", "2"],
    ["sqrt(2)/2", "√2/2"],
    ["sqrt(12)", "2√3"],
  ])("%s is exactly %s", (input, expected) => {
    expect(exact(input)).toBe(expected);
  });

  it("has no exact form for a sum of unlike surds", () => {
    expect(exact("sqrt(2)+sqrt(3)")).toBeNull();
  });

  it("has no exact form for the root of a negative", () => {
    expect(exact("sqrt(-4)")).toBeNull();
  });
});

describe("pi", () => {
  it.each([
    ["pi", "π"],
    ["pi/4", "π/4"],
    ["2pi/3", "2π/3"],
    ["pi*pi", "π²"],
    ["2*pi", "2π"],
    ["pi-pi", "0"],
  ])("%s is exactly %s", (input, expected) => {
    expect(exact(input)).toBe(expected);
  });

  it("has no exact form for a number plus pi", () => {
    expect(exact("1+pi")).toBeNull();
  });
});

// The feature the reference hardware is named for.
describe("exact trigonometry", () => {
  it.each([
    ["sin(pi/4)", "√2/2"],
    ["sin(pi/6)", "1/2"],
    ["sin(pi/3)", "√3/2"],
    ["sin(pi/2)", "1"],
    ["sin(0)", "0"],
    ["cos(pi/3)", "1/2"],
    ["cos(pi/4)", "√2/2"],
    ["cos(0)", "1"],
    ["cos(pi)", "-1"],
    ["tan(pi/4)", "1"],
    ["tan(0)", "0"],
  ])("%s is exactly %s in radians", (input, expected) => {
    expect(exact(input)).toBe(expected);
  });

  it.each([
    ["sin(30)", "1/2"],
    ["sin(45)", "√2/2"],
    ["cos(60)", "1/2"],
    ["cos(90)", "0"],
    ["tan(45)", "1"],
    ["sin(180)", "0"],
  ])("%s is exactly %s in degrees", (input, expected) => {
    expect(exact(input, { angleMode: "deg" })).toBe(expected);
  });

  it("works in gradians too", () => {
    // A full turn is 400 grad, so 50 grad is π/4 and 100 grad is π/2.
    expect(exact("sin(50)", { angleMode: "grad" })).toBe("√2/2");
    expect(exact("sin(100)", { angleMode: "grad" })).toBe("1");
    expect(exact("cos(100)", { angleMode: "grad" })).toBe("0");
  });

  it("wraps past a full turn", () => {
    expect(exact("sin(390)", { angleMode: "deg" })).toBe("1/2");
    expect(exact("sin(-30)", { angleMode: "deg" })).toBe("-1/2");
  });

  it("has no exact form at an arbitrary angle", () => {
    expect(exact("sin(1)")).toBeNull();
    expect(exact("sin(7pi/13)")).toBeNull();
    expect(exact("tan(pi/2)")).toBeNull();
  });
});

describe("falling back", () => {
  it.each(["ln(5)", "log(3)", "exp(1)", "asin(0.3)", "sinh(2)", "2^0.5"])(
    "has no exact form for %s",
    (input) => {
      expect(exact(input)).toBeNull();
    }
  );

  it("has no exact form for division by zero", () => {
    expect(exact("1/0")).toBeNull();
  });

  it("has no exact form for a value that is not a short decimal", () => {
    expect(exact("1e-7")).toBeNull();
  });
});

describe("the variable and Ans", () => {
  it("uses a supplied x", () => {
    expect(exact("x/2", { x: 3 })).toBe("3/2");
  });

  it("uses a supplied answer", () => {
    expect(exact("ans/4", { ans: 2 })).toBe("1/2");
  });

  it("has no exact form without them", () => {
    expect(exact("x/2")).toBeNull();
    expect(exact("ans/2")).toBeNull();
  });
});

describe("agreement with floating point", () => {
  // The exact value has to be the same number, not merely a tidier-looking
  // one -- otherwise the F<->D toggle would show two different answers.
  it.each([
    ["1/3+1/6", 0.5],
    ["sqrt(8)", Math.sqrt(8)],
    ["sin(pi/4)", Math.sin(Math.PI / 4)],
    ["2pi/3", (2 * Math.PI) / 3],
    ["(1/2)^3", 0.125],
    ["sqrt(2)/2", Math.SQRT1_2],
    ["pi*pi", Math.PI * Math.PI],
  ])("%s equals %s", (input, expected) => {
    const value = evaluateExactRpn(toRpn(tokenize(input)), { angleMode: "rad" });
    expect(value).not.toBeNull();
    expect(toDecimal(value as NonNullable<typeof value>)).toBeCloseTo(expected, 10);
  });

  it("matches the float evaluator on a degree angle", () => {
    const value = evaluateExactRpn(toRpn(tokenize("cos(60)")), { angleMode: "deg" });
    expect(value).not.toBeNull();
    expect(toDecimal(value as NonNullable<typeof value>)).toBeCloseTo(0.5, 12);
  });
});
