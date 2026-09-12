import { describe, it, expect, beforeEach } from "vitest";
import { Calculator, formatExpression, formatOperand, trailingOperation } from "./calculator.js";
import type { Operation } from "./types/operation.js";

/** Drive the calculator one keypress at a time, as a user would. */
function type(calculator: Calculator, keys: string[]): Calculator {
  for (const key of keys) {
    switch (key) {
      case "=": calculator.compute(); break;
      case "(": calculator.openParen(); break;
      case ")": calculator.closeParen(); break;
      case "±": calculator.toggleSign(); break;
      case "%": calculator.percent(); break;
      case "AC": calculator.clear(); break;
      case "DEL": calculator.delete(); break;
      case "x²": calculator.square(); break;
      case "1/x": calculator.reciprocal(); break;
      case "√": calculator.appendFunction("sqrt"); break;
      case "π": calculator.appendConstant("π"); break;
      default:
        if ("+-*÷^".includes(key) && key.length === 1) {
          calculator.chooseOperation(key as Operation);
        } else {
          calculator.appendNumber(key);
        }
    }
  }
  return calculator;
}

describe("Calculator", () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe("entering numbers", () => {
    it("starts empty", () => {
      expect(calculator.expression).toBe("");
      expect(calculator.resultDisplay).toBe("");
    });

    it("appends digits in order", () => {
      type(calculator, ["1", "2", "3"]);
      expect(calculator.expression).toBe("123");
    });

    it("accepts a single decimal point per number", () => {
      type(calculator, ["1", ".", "5", ".", "7"]);
      expect(calculator.expression).toBe("1.57");
    });

    it("allows a decimal point in each of two numbers", () => {
      type(calculator, ["1", ".", "5", "+", "2", ".", "5"]);
      expect(calculator.expression).toBe("1.5+2.5");
    });
  });

  describe("precedence", () => {
    it.each([
      [["2", "+", "3", "*", "4", "="], "14"],
      [["2", "*", "3", "+", "4", "="], "10"],
      [["1", "+", "2", "+", "3", "="], "6"],
      [["1", "0", "-", "2", "*", "3", "="], "4"],
      [["2", "^", "3", "="], "8"],
    ])("computes %j as %s", (keys, expected) => {
      expect(type(calculator, keys).resultDisplay).toBe(expected);
    });

    it("no longer folds left to right as operators are typed", () => {
      type(calculator, ["2", "+", "3", "*", "4"]);
      expect(calculator.expression).toBe("2+3*4");
    });
  });

  describe("parentheses", () => {
    it("overrides precedence", () => {
      type(calculator, ["(", "2", "+", "3", ")", "*", "4", "="]);
      expect(calculator.resultDisplay).toBe("20");
    });

    it("counts how many are open", () => {
      type(calculator, ["(", "(", "1"]);
      expect(calculator.openParenCount).toBe(2);
      type(calculator, [")"]);
      expect(calculator.openParenCount).toBe(1);
    });

    it("ignores a close with nothing open", () => {
      type(calculator, ["5", ")"]);
      expect(calculator.expression).toBe("5");
    });

    it("auto-closes what was left open when computing", () => {
      type(calculator, ["(", "2", "+", "3", "="]);
      expect(calculator.resultDisplay).toBe("5");
    });
  });

  describe("live preview", () => {
    it("previews as the expression becomes valid", () => {
      type(calculator, ["2", "+", "3"]);
      expect(calculator.resultDisplay).toBe("5");
    });

    it("keeps the last good value while mid-operator", () => {
      type(calculator, ["2", "+", "3", "*"]);
      expect(calculator.resultDisplay).toBe("5");
    });

    it("shows the expression on its own line", () => {
      type(calculator, ["2", "+", "3", "*", "4"]);
      expect(calculator.expressionDisplay).toBe("2 + 3 * 4");
    });
  });

  describe("repeat equals", () => {
    it("repeats the last operation", () => {
      type(calculator, ["5", "+", "3", "="]);
      expect(calculator.resultDisplay).toBe("8");
      type(calculator, ["="]);
      expect(calculator.resultDisplay).toBe("11");
      type(calculator, ["="]);
      expect(calculator.resultDisplay).toBe("14");
    });

    it("repeats multiplication too", () => {
      type(calculator, ["2", "*", "3", "="]);
      type(calculator, ["="]);
      expect(calculator.resultDisplay).toBe("18");
    });

    it("does nothing when there is no expression", () => {
      calculator.compute();
      expect(calculator.resultDisplay).toBe("");
    });
  });

  describe("continuing from a result", () => {
    it("starts a new expression when a digit follows =", () => {
      type(calculator, ["2", "+", "3", "=", "7"]);
      expect(calculator.expression).toBe("7");
    });

    it("continues from the result when an operator follows =", () => {
      type(calculator, ["2", "+", "3", "=", "*", "2", "="]);
      expect(calculator.resultDisplay).toBe("10");
    });
  });

  describe("operators", () => {
    it("replaces a trailing operator rather than stacking", () => {
      type(calculator, ["5", "+"]);
      type(calculator, ["*"]);
      expect(calculator.expression).toBe("5*");
    });

    it("ignores an operator typed first", () => {
      type(calculator, ["+"]);
      expect(calculator.expression).toBe("");
    });
  });

  describe("delete and clear", () => {
    it("removes the last character", () => {
      type(calculator, ["1", "2", "3", "DEL"]);
      expect(calculator.expression).toBe("12");
    });

    it("is a no-op when empty", () => {
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe("");
    });

    it("resets everything on AC", () => {
      type(calculator, ["1", "2", "+", "3", "AC"]);
      expect(calculator.expression).toBe("");
      expect(calculator.resultDisplay).toBe("");
      expect(calculator.error).toBeNull();
    });
  });

  describe("scientific keys", () => {
    it("squares", () => {
      type(calculator, ["5", "x²", "="]);
      expect(calculator.resultDisplay).toBe("25");
    });

    it("takes a reciprocal", () => {
      type(calculator, ["4", "1/x", "="]);
      expect(calculator.resultDisplay).toBe("0.25");
    });

    it("opens a square root for its argument", () => {
      type(calculator, ["√", "9", "="]);
      expect(calculator.resultDisplay).toBe("3");
    });

    it("appends pi", () => {
      type(calculator, ["π", "="]);
      expect(calculator.resultDisplay).toBe("3.14159265359");
    });

    it("squares a parenthesised expression", () => {
      type(calculator, ["(", "2", "+", "3", ")", "x²", "="]);
      expect(calculator.resultDisplay).toBe("25");
    });

    it("ignores a square with nothing to square", () => {
      type(calculator, ["x²"]);
      expect(calculator.expression).toBe("");
    });
  });

  describe("sign toggle", () => {
    it("makes a positive negative", () => {
      type(calculator, ["5", "±"]);
      expect(calculator.expression).toBe("-5");
    });

    it("round-trips", () => {
      type(calculator, ["5", "±", "±"]);
      expect(calculator.expression).toBe("5");
    });

    it("negates only the number being typed", () => {
      type(calculator, ["1", "2", "+", "3", "±", "="]);
      expect(calculator.resultDisplay).toBe("9");
    });

    it("is a no-op with nothing typed", () => {
      type(calculator, ["±"]);
      expect(calculator.expression).toBe("");
    });
  });

  describe("percent", () => {
    it("divides a standalone number by 100", () => {
      type(calculator, ["5", "0", "%", "="]);
      expect(calculator.resultDisplay).toBe("0.5");
    });

    it("reads as 'percent of' inside an addition", () => {
      type(calculator, ["5", "0", "+", "1", "0", "%", "="]);
      expect(calculator.resultDisplay).toBe("55");
    });

    it("reads as 'percent of' inside a subtraction", () => {
      type(calculator, ["5", "0", "-", "1", "0", "%", "="]);
      expect(calculator.resultDisplay).toBe("45");
    });

    it("is a plain division by 100 inside a multiplication", () => {
      type(calculator, ["5", "0", "*", "1", "0", "%", "="]);
      expect(calculator.resultDisplay).toBe("5");
    });
  });

  describe("errors", () => {
    it("reports division by zero", () => {
      type(calculator, ["5", "÷", "0", "="]);
      expect(calculator.error).toBe("Cannot divide by zero");
    });

    it("clears the error on the next keypress", () => {
      type(calculator, ["5", "÷", "0", "="]);
      type(calculator, ["1"]);
      expect(calculator.error).toBeNull();
    });

    it("leaves the expression alone so DEL can fix it", () => {
      type(calculator, ["5", "÷", "0", "="]);
      expect(calculator.expression).toBe("5÷0");
    });

    it("does not record a failed sum in history", () => {
      type(calculator, ["5", "÷", "0", "="]);
      expect(calculator.history).toHaveLength(0);
    });
  });

  describe("rounding", () => {
    it("trims binary floating point noise", () => {
      type(calculator, ["0", ".", "1", "+", "0", ".", "2", "="]);
      expect(calculator.resultDisplay).toBe("0.3");
    });

    it("keeps a genuinely long result", () => {
      type(calculator, ["1", "÷", "3", "="]);
      expect(calculator.resultDisplay).toBe("0.333333333333");
    });
  });

  describe("memory", () => {
    it("starts empty", () => {
      expect(calculator.memory).toBe(0);
      expect(calculator.hasMemory).toBe(false);
    });

    it("adds the displayed value", () => {
      type(calculator, ["7"]);
      calculator.memoryAdd();
      expect(calculator.memory).toBe(7);
      expect(calculator.hasMemory).toBe(true);
    });

    it("adds a computed preview, not just a literal", () => {
      type(calculator, ["2", "+", "3"]);
      calculator.memoryAdd();
      expect(calculator.memory).toBe(5);
    });

    it("subtracts", () => {
      type(calculator, ["7"]);
      calculator.memoryAdd();
      type(calculator, ["AC", "2"]);
      calculator.memorySubtract();
      expect(calculator.memory).toBe(5);
    });

    it("recalls into the display", () => {
      type(calculator, ["7"]);
      calculator.memoryAdd();
      type(calculator, ["AC"]);
      calculator.memoryRecall();
      expect(calculator.expression).toBe("7");
    });

    it("clears", () => {
      type(calculator, ["7"]);
      calculator.memoryAdd();
      calculator.memoryClear();
      expect(calculator.hasMemory).toBe(false);
    });

    it("survives AC", () => {
      type(calculator, ["7"]);
      calculator.memoryAdd();
      type(calculator, ["AC"]);
      expect(calculator.memory).toBe(7);
    });
  });

  describe("history", () => {
    it("records a completed sum", () => {
      type(calculator, ["1", "2", "+", "3", "="]);
      expect(calculator.history).toEqual([{ expression: "12 + 3", result: "15" }]);
    });

    it("puts the newest first", () => {
      type(calculator, ["1", "+", "1", "=", "AC", "2", "+", "2", "="]);
      expect(calculator.history.map((e) => e.result)).toEqual(["4", "2"]);
    });

    it("survives AC", () => {
      type(calculator, ["1", "+", "1", "=", "AC"]);
      expect(calculator.history).toHaveLength(1);
    });

    it("clears on request", () => {
      type(calculator, ["1", "+", "1", "="]);
      calculator.clearHistory();
      expect(calculator.history).toHaveLength(0);
    });

    it("caps at 50 entries", () => {
      for (let i = 0; i < 55; i++) type(calculator, ["AC", "1", "+", "1", "="]);
      expect(calculator.history).toHaveLength(50);
    });
  });

  describe("restore", () => {
    it("brings back history and memory", () => {
      calculator.restore([{ expression: "1 + 1", result: "2" }], 42);
      expect(calculator.history).toHaveLength(1);
      expect(calculator.memory).toBe(42);
    });

    it("caps restored history", () => {
      const many = Array.from({ length: 80 }, () => ({ expression: "1 + 1", result: "2" }));
      calculator.restore(many, 0);
      expect(calculator.history).toHaveLength(50);
    });
  });
});

// Each of these was a real defect found in review.
describe("regressions", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("carries a very large result into the next sum intact", () => {
    type(calculator, [..."99999999999", "*", ..."99999999999", "="]);
    const big = calculator.resultDisplay;
    type(calculator, ["+", "1", "="]);
    // Was 49.182818284, because "e+21" parsed as Euler's constant.
    expect(calculator.resultDisplay).toBe(big);
  });

  it("displays a very small result rather than rounding it to 0", () => {
    type(calculator, ["1", "÷", ..."10000000", "="]);
    expect(calculator.resultDisplay).toBe("1e-7");
  });

  it("recalls an exponential history result without corrupting it", () => {
    type(calculator, ["1", "÷", ..."10000000", "="]);
    const stored = calculator.history[0]?.result ?? "";
    calculator.recall(stored);
    type(calculator, ["*", "1", "0", "="]);
    expect(calculator.resultDisplay).toBe("0.000001");
  });

  it("starts afresh when % follows =, rather than rewriting the result", () => {
    type(calculator, ["5", "+", "3", "="]);
    type(calculator, ["%"]);
    // Was 5.15: percent reached back into the completed expression.
    expect(calculator.resultDisplay).toBe("0.08");
  });

  it("never shows a preview belonging to an expression that no longer exists", () => {
    type(calculator, ["9", "+", "5"]);
    expect(calculator.resultDisplay).toBe("14");
    type(calculator, ["DEL"]);
    // Was still 14 while the expression line read "9 +".
    expect(calculator.expressionDisplay).toBe("9 +");
    expect(calculator.resultDisplay).toBe("9");
  });

  it("banks the live value, not a stale one, into memory", () => {
    type(calculator, ["9", "+", "5", "DEL"]);
    calculator.memoryAdd();
    expect(calculator.memory).toBe(9);
  });

  it("blanks the preview when nothing valid has been typed", () => {
    type(calculator, ["("]);
    expect(calculator.resultDisplay).toBe("");
  });

  it("ignores an operator straight after an opening bracket", () => {
    type(calculator, ["(", "+", "3", ")", "="]);
    // Was "(+3)", which could never evaluate.
    expect(calculator.error).toBeNull();
    expect(calculator.resultDisplay).toBe("3");
  });
});

describe("formatExpression", () => {
  it.each([
    ["12+3*4", "12 + 3 * 4"],
    ["-5+3", "-5 + 3"],
    ["2^3", "2 ^ 3"],
    ["(2+3)*4", "(2 + 3) * 4"],
    ["", ""],
  ])("formats %j as %j", (input, expected) => {
    expect(formatExpression(input)).toBe(expected);
  });
});

describe("trailingOperation", () => {
  it.each([
    ["5+3", "+3"],
    ["2*3", "*3"],
    ["1+2*3", "*3"],
    ["-5", null],
    ["5", null],
  ])("of %j is %j", (input, expected) => {
    expect(trailingOperation(input)).toBe(expected);
  });
});

describe("formatOperand", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["1000", "1,000"],
    ["1234567", "1,234,567"],
    ["-1000", "-1,000"],
    ["1000.5", "1,000.5"],
    ["1.50", "1.50"],
    ["1e-7", "1e-7"],
    ["9.9999999998e+21", "9.9999999998e+21"],
  ])("formats %j as %j", (input, expected) => {
    expect(formatOperand(input)).toBe(expected);
  });
});
