import { describe, it, expect, beforeEach } from "vitest";
import { Calculator, formatOperand, isOperation } from "./calculator.js";
import type { Operation } from "./calculator.js";

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
      expect(calculator.error).toBe("Cannot divide by zero.");
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
      expect(calculator.error).toBe("Cannot divide by zero.");
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
