import { describe, it, expect, beforeEach } from "vitest";
import { Calculator, formatOperand, isOperation } from "./calculator.js";
import type { Operation } from "./types/operation.js";

/** Type a whole expression into a calculator, one keypress at a time. */
function type(calculator: Calculator, keys: string[]): Calculator {
  for (const key of keys) {
    if (isOperation(key)) calculator.chooseOperation(key);
    else if (key === "=") calculator.compute();
    else calculator.appendNumber(key);
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
      expect(calculator.currentOperand).toBe("");
      expect(calculator.previousOperand).toBe("");
      expect(calculator.operation).toBeUndefined();
    });

    it("appends digits in order", () => {
      type(calculator, ["1", "2", "3"]);
      expect(calculator.currentOperand).toBe("123");
    });

    it("accepts a single decimal point", () => {
      type(calculator, ["1", ".", "5"]);
      expect(calculator.currentOperand).toBe("1.5");
    });

    it("ignores a second decimal point", () => {
      type(calculator, ["1", ".", "5", ".", "7"]);
      expect(calculator.currentOperand).toBe("1.57");
    });

    it("allows a leading decimal point", () => {
      type(calculator, [".", "5"]);
      expect(calculator.currentOperand).toBe(".5");
    });
  });

  describe("delete", () => {
    it("removes the last character", () => {
      type(calculator, ["1", "2", "3"]);
      calculator.delete();
      expect(calculator.currentOperand).toBe("12");
    });

    it("is a no-op on an empty operand", () => {
      calculator.delete();
      expect(calculator.currentOperand).toBe("");
    });

    it("frees up the decimal point again", () => {
      type(calculator, ["1", "."]);
      calculator.delete();
      type(calculator, [".", "5"]);
      expect(calculator.currentOperand).toBe("1.5");
    });
  });

  describe("arithmetic", () => {
    it.each([
      [["1", "+", "2", "="], "3"],
      [["5", "-", "8", "="], "-3"],
      [["6", "*", "7", "="], "42"],
      [["8", "÷", "2", "="], "4"],
      [["1", ".", "5", "+", "2", ".", "5", "="], "4"],
      [["0", "-", "0", "="], "0"],
    ])("computes %j as %s", (keys, expected) => {
      expect(type(calculator, keys).currentOperand).toBe(expected);
    });

    it("clears the pending operation after computing", () => {
      type(calculator, ["1", "+", "2", "="]);
      expect(calculator.operation).toBeUndefined();
      expect(calculator.previousOperand).toBe("");
    });

    it("folds a chain as each operator is pressed", () => {
      type(calculator, ["1", "+", "2", "+", "3"]);
      expect(calculator.previousOperand).toBe("3");
      type(calculator, ["="]);
      expect(calculator.currentOperand).toBe("6");
    });

    it("does nothing when an operand is missing", () => {
      type(calculator, ["5", "+"]);
      calculator.compute();
      expect(calculator.currentOperand).toBe("");
      expect(calculator.previousOperand).toBe("5");
    });

    it("does nothing when no operation was chosen", () => {
      type(calculator, ["5"]);
      calculator.compute();
      expect(calculator.currentOperand).toBe("5");
    });

    it("ignores an operator pressed before any number", () => {
      calculator.chooseOperation("+" as Operation);
      expect(calculator.operation).toBeUndefined();
      expect(calculator.previousOperand).toBe("");
    });

    // Documenting existing behaviour: with no current operand there is
    // nothing to fold, so a second operator press is ignored and the first
    // operator stands. Pressing "+" then "*" leaves "+" selected.
    it("ignores a second operator press and keeps the first", () => {
      type(calculator, ["5", "+"]);
      calculator.chooseOperation("*");
      expect(calculator.operation).toBe("+");
      expect(calculator.previousOperand).toBe("5");
    });
  });

  describe("dividing by zero", () => {
    it("reports an error instead of producing Infinity", () => {
      type(calculator, ["5", "÷", "0", "="]);
      expect(calculator.error).toBe("Cannot divide by zero");
      expect(calculator.currentOperand).toBe("0");
      expect(calculator.currentOperand).not.toBe("Infinity");
    });

    it("does not swallow the operands, so DEL can fix the entry", () => {
      type(calculator, ["5", "÷", "0"]);
      calculator.compute();
      calculator.delete();
      type(calculator, ["2", "="]);
      expect(calculator.currentOperand).toBe("2.5");
      expect(calculator.error).toBeNull();
    });

    it("clears the error on the next keypress", () => {
      type(calculator, ["5", "÷", "0", "="]);
      calculator.appendNumber("1");
      expect(calculator.error).toBeNull();
    });

    it("does not fold a chain through a division by zero", () => {
      type(calculator, ["5", "÷", "0"]);
      calculator.chooseOperation("+" as Operation);
      expect(calculator.error).toBe("Cannot divide by zero");
      expect(calculator.operation).toBe("÷");
    });
  });

  describe("clear", () => {
    it("resets everything", () => {
      type(calculator, ["1", "2", "+", "3"]);
      calculator.clear();
      expect(calculator.currentOperand).toBe("");
      expect(calculator.previousOperand).toBe("");
      expect(calculator.operation).toBeUndefined();
      expect(calculator.error).toBeNull();
    });
  });

  describe("display", () => {
    it("shows nothing when empty", () => {
      expect(calculator.currentDisplay).toBe("");
      expect(calculator.previousDisplay).toBe("");
    });

    it("shows the pending operation above the current operand", () => {
      type(calculator, ["1", "2", "+", "3"]);
      expect(calculator.previousDisplay).toBe("12 +");
      expect(calculator.currentDisplay).toBe("3");
    });

    it("hides the previous line once the sum is computed", () => {
      type(calculator, ["1", "+", "2", "="]);
      expect(calculator.previousDisplay).toBe("");
    });
  });
});

describe("formatOperand", () => {
  it.each([
    ["", ""],
    ["0", "0"],
    ["5", "5"],
    ["1000", "1,000"],
    ["1234567", "1,234,567"],
    ["-1000", "-1,000"],
    ["1000.5", "1,000.5"],
    ["1.50", "1.50"],
    ["0.5", "0.5"],
  ])("formats %j as %j", (input: string, expected: string) => {
    expect(formatOperand(input)).toBe(expected);
  });

  it("keeps a trailing decimal point while it is being typed", () => {
    expect(formatOperand("12.")).toBe("12.");
  });

  it("keeps trailing zeros in the decimal part while they are being typed", () => {
    expect(formatOperand("1.500")).toBe("1.500");
  });

  it("handles a lone decimal point", () => {
    expect(formatOperand(".")).toBe(".");
  });
});

describe("isOperation", () => {
  it.each(["+", "-", "*", "÷"])("accepts %s", (value) => {
    expect(isOperation(value)).toBe(true);
  });

  it.each(["/", "x", "=", "1", ""])("rejects %j", (value) => {
    expect(isOperation(value)).toBe(false);
  });
});

describe("rounding", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("trims binary floating point noise", () => {
    type(calculator, ["0", ".", "1", "+", "0", ".", "2", "="]);
    expect(calculator.currentOperand).toBe("0.3");
  });

  it("keeps a genuinely long result", () => {
    type(calculator, ["1", "÷", "3", "="]);
    expect(calculator.currentOperand).toBe("0.333333333333");
  });

  it("does not round an exact integer result", () => {
    type(calculator, ["1", "0", "0", "0", "*", "1", "0", "0", "0", "="]);
    expect(calculator.currentOperand).toBe("1000000");
  });
});

describe("toggleSign", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("makes a positive negative", () => {
    type(calculator, ["5"]);
    calculator.toggleSign();
    expect(calculator.currentOperand).toBe("-5");
  });

  it("makes a negative positive again", () => {
    type(calculator, ["5"]);
    calculator.toggleSign();
    calculator.toggleSign();
    expect(calculator.currentOperand).toBe("5");
  });

  it("is a no-op on an empty operand", () => {
    calculator.toggleSign();
    expect(calculator.currentOperand).toBe("");
  });

  it("feeds a negative operand into a sum", () => {
    type(calculator, ["5"]);
    calculator.toggleSign();
    type(calculator, ["+", "8", "="]);
    expect(calculator.currentOperand).toBe("3");
  });

  it("keeps digits appendable after flipping", () => {
    type(calculator, ["1"]);
    calculator.toggleSign();
    type(calculator, ["2"]);
    expect(calculator.currentOperand).toBe("-12");
  });
});

describe("percent", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("divides a standalone number by 100", () => {
    type(calculator, ["5", "0"]);
    calculator.percent();
    expect(calculator.currentOperand).toBe("0.5");
  });

  it("reads as 'percent of' inside an addition", () => {
    type(calculator, ["5", "0", "+", "1", "0"]);
    calculator.percent();
    expect(calculator.currentOperand).toBe("5");
    type(calculator, ["="]);
    expect(calculator.currentOperand).toBe("55");
  });

  it("reads as 'percent of' inside a subtraction", () => {
    type(calculator, ["5", "0", "-", "1", "0"]);
    calculator.percent();
    type(calculator, ["="]);
    expect(calculator.currentOperand).toBe("45");
  });

  it("is a plain division by 100 inside a multiplication", () => {
    type(calculator, ["5", "0", "*", "1", "0"]);
    calculator.percent();
    expect(calculator.currentOperand).toBe("0.1");
  });

  it("is a no-op on an empty operand", () => {
    calculator.percent();
    expect(calculator.currentOperand).toBe("");
  });
});

describe("memory", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

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

  it("subtracts the displayed value", () => {
    type(calculator, ["7"]);
    calculator.memoryAdd();
    calculator.clear();
    type(calculator, ["2"]);
    calculator.memorySubtract();
    expect(calculator.memory).toBe(5);
  });

  it("recalls into the display", () => {
    type(calculator, ["7"]);
    calculator.memoryAdd();
    calculator.clear();
    calculator.memoryRecall();
    expect(calculator.currentOperand).toBe("7");
  });

  it("clears", () => {
    type(calculator, ["7"]);
    calculator.memoryAdd();
    calculator.memoryClear();
    expect(calculator.memory).toBe(0);
    expect(calculator.hasMemory).toBe(false);
  });

  it("reports no memory once it nets back to zero", () => {
    type(calculator, ["7"]);
    calculator.memoryAdd();
    calculator.memorySubtract();
    expect(calculator.hasMemory).toBe(false);
  });

  it("ignores M+ with nothing displayed", () => {
    calculator.memoryAdd();
    expect(calculator.memory).toBe(0);
  });

  it("survives AC", () => {
    type(calculator, ["7"]);
    calculator.memoryAdd();
    calculator.clear();
    expect(calculator.memory).toBe(7);
  });
});

describe("history", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("starts empty", () => {
    expect(calculator.history).toHaveLength(0);
  });

  it("records a completed sum", () => {
    type(calculator, ["1", "2", "+", "3", "="]);
    expect(calculator.history).toEqual([{ expression: "12 + 3", result: "15" }]);
  });

  it("formats the expression with thousands separators", () => {
    type(calculator, ["1", "2", "0", "0", "+", "3", "="]);
    expect(calculator.history[0]?.expression).toBe("1,200 + 3");
  });

  it("puts the newest entry first", () => {
    type(calculator, ["1", "+", "1", "="]);
    calculator.clear();
    type(calculator, ["2", "+", "2", "="]);
    expect(calculator.history.map((e) => e.result)).toEqual(["4", "2"]);
  });

  it("records each fold of a chain", () => {
    type(calculator, ["1", "+", "2", "+", "3", "="]);
    expect(calculator.history.map((e) => e.result)).toEqual(["6", "3"]);
  });

  it("does not record a failed division", () => {
    type(calculator, ["5", "÷", "0", "="]);
    expect(calculator.history).toHaveLength(0);
  });

  it("does not record an incomplete sum", () => {
    type(calculator, ["5", "+"]);
    calculator.compute();
    expect(calculator.history).toHaveLength(0);
  });

  it("clears on request", () => {
    type(calculator, ["1", "+", "1", "="]);
    calculator.clearHistory();
    expect(calculator.history).toHaveLength(0);
  });

  it("survives AC", () => {
    type(calculator, ["1", "+", "1", "="]);
    calculator.clear();
    expect(calculator.history).toHaveLength(1);
  });

  it("caps at 50 entries", () => {
    for (let i = 0; i < 55; i++) {
      calculator.clear();
      type(calculator, ["1", "+", "1", "="]);
    }
    expect(calculator.history).toHaveLength(50);
  });
});

describe("recall", () => {
  it("loads a value and clears any error", () => {
    const calculator = new Calculator();
    type(calculator, ["5", "÷", "0", "="]);
    calculator.recall("42");
    expect(calculator.currentOperand).toBe("42");
    expect(calculator.error).toBeNull();
  });
});
