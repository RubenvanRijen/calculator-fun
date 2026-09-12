import { describe, it, expect } from "vitest";
import { OPERATOR_SPELLINGS } from "@/format.ts";
import { evaluateString, tokenize, toRpn, isOperation } from "@/expression.ts";

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
    expect(evaluateString(input, { x: 3 })).toBe(expected);
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

  // The scanner used to grab every adjacent letter as one word, so two
  // constants side by side read as a single unknown name.
  describe("adjacent names", () => {
    it.each([
      ["\u03c0\u03c0", Math.PI * Math.PI],
      ["e\u03c0", Math.E * Math.PI],
      ["\u03c0e", Math.PI * Math.E],
      ["ee", Math.E * Math.E],
    ])("reads %j as two constants", (input, expected) => {
      expect(evaluateString(input)).toBeCloseTo(expected);
    });

    it("reads a constant next to the variable", () => {
      expect(evaluateString("\u03c0x", { x: 2 })).toBeCloseTo(Math.PI * 2);
    });

    it("still rejects a genuinely unknown name", () => {
      expect(() => evaluateString("wobble")).toThrow(/Unknown name "wobble"/);
    });

    // The error used to name the leftover fragment after known prefixes had
    // been eaten: "sinh" reported 'Unknown name "h"'.
    it.each([
      ["cosec(1)", "cosec"],
      ["arcsin(1)", "arcsin"],
      ["wobble", "wobble"],
      ["sinhh(1)", "sinhh"],
    ])("names the whole word %j in the error", (input, word) => {
      expect(() => evaluateString(input)).toThrow(`Unknown name "${word}"`);
    });

    // Splitting a letter run into names must not turn a typo into a silent
    // answer: "cose(x)" decomposes to cos + e, which used to evaluate as
    // cos(e)*x rather than being rejected.
    it.each(["cose(x)", "tane(2)", "sine", "abse(4)", "lnn(3)"])(
      "rejects the typo %j rather than decomposing it",
      (input) => {
        expect(() => evaluateString(input, { x: 2 })).toThrow(/Unknown name/);
      }
    );

    it("says what is missing when a function has no bracket", () => {
      expect(() => evaluateString("sqrt")).toThrow('Expected ( after "sqrt"');
      expect(() => evaluateString("2sin")).toThrow('Expected ( after "sin"');
    });

    // Requiring the bracket must not reject one that is merely a space away.
    it.each([
      ["sin (x)", Math.sin(1)],
      ["sqrt (9)", 3],
      ["ln (2)", Math.LN2],
      ["sqrt  (  9  )", 3],
    ])("accepts whitespace before the bracket in %j", (input, expected) => {
      expect(evaluateString(input, { x: 1 })).toBeCloseTo(expected);
    });

    it("still accepts every legitimate function call", () => {
      expect(evaluateString("sin(0)")).toBe(0);
      expect(evaluateString("2sqrt(9)")).toBe(6);
      expect(evaluateString("sqrt(abs(-16))")).toBe(4);
      expect(evaluateString("\u03c0sqrt(4)")).toBeCloseTo(Math.PI * 2);
    });

    // A greedy split committed to the longest prefix and could dead-end on a
    // run that does decompose.
    it.each([
      ["expi", Math.E * 2 * Math.PI],
      ["pie", Math.PI * Math.E],
      ["exe", Math.E * 2 * Math.E],
    ])("backtracks to split %j", (input, expected) => {
      expect(evaluateString(input, { x: 2 })).toBeCloseTo(expected);
    });

    it("does not let a short name shadow a longer one", () => {
      // "e" must not swallow the start of a longer name.
      expect(evaluateString("sqrt(4)")).toBe(2);
    });
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
      expect(evaluateString("sin(x)*x", { x: 3 })).toBeCloseTo(Math.sin(3) * 3);
      expect(evaluateString("sin(x*x)", { x: 3 })).toBeCloseTo(Math.sin(9));
      expect(evaluateString("sin(x)*x", { x: 3 })).not.toBeCloseTo(Math.sin(9));
    });

    it("orders postfix correctly for sqrt(9)+1", () => {
      const rpn = toRpn(tokenize("sqrt(9)+1"));
      expect(rpn.map((t) => ("value" in t ? t.value : "name" in t ? t.name : "operator" in t ? t.operator : t.kind)))
        .toEqual([9, "sqrt", 1, "+"]);
    });
  });
});

describe("angle modes", () => {
  it.each([
    ["deg", 60, 0.5],
    ["grad", 200 / 3, 0.5],
  ] as const)("reads cos in %s", (angleMode, input, expected) => {
    expect(evaluateString(`cos(${input})`, { angleMode })).toBeCloseTo(expected);
  });

  it("defaults to radians", () => {
    expect(evaluateString("cos(0)")).toBe(1);
    expect(evaluateString("sin(pi/2)")).toBeCloseTo(1);
  });

  it.each(["deg", "rad", "grad"] as const)("a full turn of sin is 0 in %s", (angleMode) => {
    const turn = { deg: 360, rad: 2 * Math.PI, grad: 400 }[angleMode];
    expect(evaluateString(`sin(${turn})`, { angleMode })).toBeCloseTo(0);
  });

  it("reports inverse trig in the active mode", () => {
    expect(evaluateString("asin(1)", { angleMode: "deg" })).toBeCloseTo(90);
    expect(evaluateString("asin(1)", { angleMode: "grad" })).toBeCloseTo(100);
    expect(evaluateString("asin(1)", { angleMode: "rad" })).toBeCloseTo(Math.PI / 2);
  });

  // asin only returns its principal value, so the angle has to sit inside
  // [-90deg, 90deg] for the round trip to mean anything.
  it.each([
    ["deg", 30],
    ["rad", 0.5],
    ["grad", 30],
  ] as const)("round-trips sin then asin in %s", (angleMode, angle) => {
    expect(evaluateString(`asin(sin(${angle}))`, { angleMode })).toBeCloseTo(angle);
  });

  it("leaves non-circular functions alone", () => {
    for (const angleMode of ["deg", "rad", "grad"] as const) {
      expect(evaluateString("ln(e)", { angleMode })).toBeCloseTo(1);
      expect(evaluateString("sqrt(9)", { angleMode })).toBe(3);
      expect(evaluateString("sinh(0)", { angleMode })).toBe(0);
    }
  });
});

describe("the new functions", () => {
  it.each([
    ["asin(0)", 0],
    ["acos(1)", 0],
    ["atan(0)", 0],
    ["sinh(0)", 0],
    ["cosh(0)", 1],
    ["tanh(0)", 0],
    ["exp(0)", 1],
    ["exp(1)", Math.E],
    ["log(1000)", 3],
    ["ln(1)", 0],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBeCloseTo(expected);
  });

  it("pairs exp with ln", () => {
    expect(evaluateString("ln(exp(5))")).toBeCloseTo(5);
  });

  it("satisfies the hyperbolic identity", () => {
    expect(evaluateString("cosh(2)^2-sinh(2)^2")).toBeCloseTo(1);
  });
});

describe("the variable x", () => {
  it("substitutes a value", () => {
    expect(evaluateString("x^2+1", { x: 3 })).toBe(10);
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
// The e key inserts "(e)" precisely so a constant next to digits cannot be
// mistaken for an exponent.
describe("Euler's constant beside digits", () => {
  it.each([
    ["2(e)5", 2 * Math.E * 5],
    ["(e)5", Math.E * 5],
    ["2(e)", 2 * Math.E],
    ["(e)", Math.E],
    ["(e)(e)", Math.E * Math.E],
  ])("%s is a constant, not an exponent", (input, expected) => {
    expect(evaluateString(input)).toBeCloseTo(expected);
  });

  it("leaves genuine scientific notation alone", () => {
    expect(evaluateString("2e5")).toBe(200000);
  });
});

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
  it.each(["1.2.3", "1 2", "3.4 5"])("rejects the malformed literal %j", (input) => {
    expect(() => evaluateString(input)).toThrow(/Unexpected number/);
  });

  // A constant is a number token too, but "π5" is a product, not a malformed
  // literal -- it used to be rejected with no way forward but DEL.
  it.each([
    ["\u03c05", Math.PI * 5],
    ["5\u03c0", 5 * Math.PI],
    ["\u03c05+1", Math.PI * 5 + 1],
    ["(e)5", Math.E * 5],
  ])("reads %j as a product", (input, expected) => {
    expect(evaluateString(input)).toBeCloseTo(expected);
  });
});

describe("factorial", () => {
  it.each([
    ["0!", 1],
    ["1!", 1],
    ["5!", 120],
    ["10!", 3628800],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });

  // Postfix: it binds to the value immediately before it.
  it.each([
    ["3!+1", 7],
    ["2*3!", 12],
    ["3!^2", 36],
    ["-3!", -6],
    ["2!*3!", 12],
  ])("binds correctly in %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });

  it.each(["2.5!", "(-1)!"])("rejects %j", (input) => {
    expect(() => evaluateString(input)).toThrow(/whole number/);
  });

  it("refuses a result too large to mean anything", () => {
    expect(() => evaluateString("200!")).toThrow(/too large/);
  });
});

describe("combinations and permutations", () => {
  it.each([
    ["5nCr2", 10],
    ["5nPr2", 20],
    ["10nCr5", 252],
    ["52nCr5", 2598960],
    ["5nCr0", 1],
    ["5nCr5", 1],
    ["5nPr0", 1],
    ["5nPr5", 120],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });

  it("is zero when more are taken than there are", () => {
    expect(evaluateString("5nCr7")).toBe(0);
    expect(evaluateString("5nPr7")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(evaluateString("5NCR2")).toBe(10);
  });

  // Between multiplication and a power.
  it.each([
    ["2*5nCr2", 20],
    ["2+3nCr2", 5],
    ["5nCr2^2", 5],
  ])("binds correctly in %s", (input, expected) => {
    expect(evaluateString(input)).toBe(expected);
  });

  it.each(["5nCr2.5", "(-1)nCr2"])("rejects %j", (input) => {
    expect(() => evaluateString(input)).toThrow(/whole numbers/);
  });

  it.each(["2000nPr1000", "1000nCr500"])("refuses %j as too large", (input) => {
    expect(() => evaluateString(input)).toThrow(/too large/);
  });

  it("stays exact for a large count", () => {
    // 50C25 is well past 2^53 if computed as three factorials.
    expect(evaluateString("50nCr25")).toBe(126410606437752);
  });
});

describe("registers", () => {
  const registers = { A: 7, B: 3 };

  it.each([
    ["A", 7],
    ["A+1", 8],
    ["A*B", 21],
    ["A nCr B", 35],
    ["2A", 14],
    ["A^2", 49],
  ])("%s = %s", (input, expected) => {
    expect(evaluateString(input, { registers })).toBe(expected);
  });

  it("says which register is empty", () => {
    expect(() => evaluateString("C+1", { registers })).toThrow("Nothing stored in C");
  });

  it("says nothing is stored when none are", () => {
    expect(() => evaluateString("A")).toThrow("Nothing stored in A");
  });

  // E and X already mean Euler's constant and the graph variable.
  it("does not treat E or X as a register", () => {
    expect(evaluateString("E", { registers })).toBeCloseTo(Math.E);
    expect(evaluateString("X", { registers, x: 5 })).toBe(5);
  });

  // "asin" would swallow the A, so an uppercase register letter is tried
  // first -- the same collision E and X were excluded for.
  it.each([
    ["Asin(30)", 7 * Math.sin(30)],
    ["Acos(0)", 7 * Math.cos(0)],
    ["Atan(0)", 0],
    ["Bln(1)", 0],
  ])("reads %j as a register times a function", (input, expected) => {
    expect(evaluateString(input, { registers })).toBeCloseTo(expected);
  });

  it("still reads a lowercase function name as the function", () => {
    expect(evaluateString("asin(0)", { registers })).toBe(0);
    expect(evaluateString("acos(1)", { registers })).toBe(0);
  });

  // Uppercase only, so a lowercase function name is never swallowed.
  it("does not read a lowercase letter as a register", () => {
    expect(() => evaluateString("a+1", { registers })).toThrow(/Unknown name/);
  });

  it("rejects a letter that is not a register", () => {
    expect(() => evaluateString("Z+1", { registers })).toThrow(/Unknown name "Z"/);
  });

  it("still reads a word made of register letters as unknown", () => {
    expect(() => evaluateString("ABBA", { registers })).not.toThrow();
    expect(evaluateString("ABBA", { registers })).toBe(7 * 3 * 3 * 7);
  });
});

describe("isOperation", () => {
  it.each(["+", "-", "*", "÷", "^", "nCr", "nPr"])("accepts %s", (value) => {
    expect(isOperation(value)).toBe(true);
  });

  it.each(["/", "x", "=", "1", ""])("rejects %j", (value) => {
    expect(isOperation(value)).toBe(false);
  });
});

describe("a leading plus", () => {
  const value = (text: string) =>
    evaluateString(text, { angleMode: "rad", x: undefined });

  it("says nothing about the value", () => {
    expect(value("+5")).toBe(5);
    expect(value("(+1/2)")).toBe(0.5);
  });

  it("is allowed after an operator, as a sign is", () => {
    expect(value("2++3")).toBe(5);
    expect(value("2*+3")).toBe(6);
  });

  it("does not make an operator optional", () => {
    // Dropping the sign must not turn "2 3" into anything.
    expect(() => value("2 3")).toThrow();
  });
});

describe("operator spellings", () => {
  it("lists every operator", () => {
    // Missing one would make trailingOperatorLength blind to it, so pressing
    // it twice would stack two rather than replacing the first.
    for (const operation of ["+", "-", "*", "÷", "^", "nCr", "nPr"]) {
      expect(OPERATOR_SPELLINGS).toContain(operation);
    }
    expect(OPERATOR_SPELLINGS).toHaveLength(7);
  });

  it("lists longer spellings first, however they are declared", () => {
    // operatorAt takes the first match it finds, so a spelling has to come
    // before anything it starts with. No operator is a prefix of another
    // today, which is exactly why this asserts the ordering itself rather
    // than the prefix rule: the prefix rule holds either way just now, and
    // would go on holding right up until an operator spelled "**" was added
    // after "*" and "2**3" started reading as "2 * *3".
    const lengths = OPERATOR_SPELLINGS.map((spelling) => spelling.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });
});
