import { describe, it, expect } from "vitest";
import { evaluateString, tokenize, toRpn, isOperation } from "./expression.js";

describe("precedence", () => {
  it.each([
    ["2+3*4", 14],
    ["2*3+4", 10],
    ["2+3-4", 1],
    ["2-3+4", 3],
    ["12÷4÷3", 1],
    ["2*3÷6", 1],
    ["1+2*3+4", 11],
    ["10-2*3", 4],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });
});

describe("parentheses", () => {
  it.each([
    ["(2+3)*4", 20],
    ["2*(3+4)", 14],
    ["((2))", 2],
    ["(1+2)*(3+4)", 21],
    ["2*(3+(4-1))", 12],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });

  it("rejects an unmatched (", () => {
    expect(() => evaluateString("(1+2")).toThrow(/Unmatched \(/);
  });

  it("rejects an unmatched )", () => {
    expect(() => evaluateString("1+2)")).toThrow(/Unmatched \)/);
  });
});

describe("exponentiation", () => {
  it.each([
    ["2^3", 8],
    ["2^3^2", 512],   // right-associative: 2^(3^2)
    ["-2^2", -4],     // unary minus binds looser than ^
    ["(-2)^2", 4],
    ["2^-2", 0.25],
    ["4^0.5", 2],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });
});

describe("unary minus", () => {
  it.each([
    ["-5", -5],
    ["-5+3", -2],
    ["3*-2", -6],
    ["--5", 5],
    ["-(2+3)", -5],
    ["10--5", 15],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });
});

describe("implied multiplication", () => {
  it.each([
    ["2x", 6],
    ["2(3)", 6],
    ["(1+1)(2+1)", 6],
    ["2sqrt(9)", 6],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input, 3)).toBe(expected);
  });
});

describe("functions and constants", () => {
  it("evaluates sqrt", () => {
    expect(evaluateString("sqrt(16)")).toBe(4);
  });

  it("evaluates nested functions", () => {
    expect(evaluateString("sqrt(abs(-16))")).toBe(4);
  });

  it("evaluates sin at 0", () => {
    expect(evaluateString("sin(0)")).toBe(0);
  });

  it("evaluates log base 10", () => {
    expect(evaluateString("log(1000)")).toBeCloseTo(3);
  });

  it("evaluates ln of e", () => {
    expect(evaluateString("ln(e)")).toBeCloseTo(1);
  });

  it("knows pi", () => {
    expect(evaluateString("pi")).toBeCloseTo(Math.PI);
  });

  it("knows the π symbol", () => {
    expect(evaluateString("π")).toBeCloseTo(Math.PI);
  });

  it("rejects an unknown name", () => {
    expect(() => evaluateString("foo(2)")).toThrow(/Unknown name/);
  });

  // A function used to stay on the operator stack past its own closing
  // bracket and swallow whatever came next, so sqrt(9)+1 evaluated as
  // sqrt(9+1). These all pin the bracket closing where it belongs.
  describe("a function ends at its closing bracket", () => {
    it.each([
      ["sqrt(9)+1", 4],
      ["sqrt(9)*2", 6],
      ["sqrt(9)-1", 2],
      ["sqrt(16)^2", 16],
      ["abs(-4)+abs(-6)", 10],
      ["sqrt(4)+sqrt(9)", 5],
      ["2+sqrt(9)*2", 8],
    ])("%s = %s", (input, expected) => {
      expect(evaluateString(input)).toBeCloseTo(expected);
    });

    it("keeps sin(x)*x distinct from sin(x*x)", () => {
      expect(evaluateString("sin(x)*x", 3)).toBeCloseTo(Math.sin(3) * 3);
      expect(evaluateString("sin(x*x)", 3)).toBeCloseTo(Math.sin(9));
      expect(evaluateString("sin(x)*x", 3)).not.toBeCloseTo(Math.sin(9));
    });

    it("orders postfix correctly for sqrt(9)+1", () => {
      const rpn = toRpn(tokenize("sqrt(9)+1"));
      expect(rpn.map((t) => ("value" in t ? t.value : "name" in t ? t.name : "operator" in t ? t.operator : t.kind)))
        .toEqual([9, "sqrt", 1, "+"]);
    });
  });
});

describe("the variable x", () => {
  it("substitutes a value", () => {
    expect(evaluateString("x^2+1", 3)).toBe(10);
  });

  it("is an error with no value supplied", () => {
    expect(() => evaluateString("x+1")).toThrow(/Unknown name "x"/);
  });
});

describe("division by zero", () => {
  it("is rejected", () => {
    expect(() => evaluateString("5÷0")).toThrow(/Cannot divide by zero/);
  });

  it("accepts / as well as ÷", () => {
    expect(evaluateString("8/2")).toBe(4);
  });
});

describe("malformed input", () => {
  it.each(["1+", "*2", "1 2 +", "(", ""])("rejects %j", (input) => {
    expect(() => evaluateString(input)).toThrow();
  });

  it("rejects an unexpected character", () => {
    expect(() => evaluateString("1 # 2")).toThrow(/Unexpected character/);
  });
});

describe("tokenize", () => {
  it("ignores whitespace", () => {
    expect(evaluateString("  2  +  3  ")).toBe(5);
  });

  it("produces postfix in the expected order", () => {
    const rpn = toRpn(tokenize("2+3*4"));
    expect(rpn.map((t) => ("value" in t ? t.value : "operator" in t ? t.operator : t.kind)))
      .toEqual([2, 3, 4, "*", "+"]);
  });
});

// Results round-trip through text, so an exponential result must read back
// as one number rather than a mantissa times Euler's constant.
describe("scientific notation", () => {
  it.each([
    ["1e3", 1000],
    ["1e-7", 1e-7],
    ["9.9999999998e+21", 9.9999999998e21],
    ["1e-7*10", 1e-6],
    ["2e3+1", 2001],
    [".5e3", 500],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBeCloseTo(expected, 12);
  });

  it("still reads a bare e as Euler's constant", () => {
    expect(evaluateString("2e")).toBeCloseTo(2 * Math.E);
  });

  it("still multiplies by a bare e after a bracket", () => {
    expect(evaluateString("(1+1)e")).toBeCloseTo(2 * Math.E);
  });
});

describe("two numbers in a row", () => {
  it.each(["1.2.3", "1 2", "3.4 5"])("rejects %j", (input) => {
    expect(() => evaluateString(input)).toThrow(/Unexpected number/);
  });
});

describe("isOperation", () => {
  it.each(["+", "-", "*", "÷", "^"])("accepts %s", (value) => {
    expect(isOperation(value)).toBe(true);
  });

  it.each(["/", "x", "=", "1", ""])("rejects %j", (value) => {
    expect(isOperation(value)).toBe(false);
  });
});
