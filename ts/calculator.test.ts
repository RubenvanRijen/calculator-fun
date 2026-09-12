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

  describe("angle mode", () => {
    it("starts in radians", () => {
      expect(calculator.angleMode).toBe("rad");
    });

    it("changes what trigonometry means", () => {
      calculator.appendFunction("cos");
      type(calculator, ["6", "0", ")", "="]);
      expect(calculator.resultDisplay).toBe("-0.952412980415");

      calculator.clear();
      calculator.angleMode = "deg";
      calculator.appendFunction("cos");
      type(calculator, ["6", "0", ")", "="]);
      expect(calculator.resultDisplay).toBe("0.5");
    });

    it("applies to the live preview as well as the result", () => {
      calculator.angleMode = "deg";
      calculator.appendFunction("sin");
      type(calculator, ["9", "0"]);
      expect(calculator.resultDisplay).toBe("1");
    });

    it("survives AC, like memory", () => {
      calculator.angleMode = "grad";
      type(calculator, ["AC"]);
      expect(calculator.angleMode).toBe("grad");
    });
  });

  describe("angle mode refresh", () => {
    // The preview used to keep the value worked out in the previous mode, and
    // M+ banked that stale number.
    it("re-evaluates the preview when the mode changes", () => {
      calculator.appendFunction("cos");
      type(calculator, ["6", "0"]);
      expect(calculator.resultDisplay).toBe("-0.952412980415");

      calculator.angleMode = "deg";
      expect(calculator.resultDisplay).toBe("0.5");
    });

    it("banks the value for the mode actually showing", () => {
      calculator.appendFunction("cos");
      type(calculator, ["6", "0"]);
      calculator.angleMode = "deg";
      calculator.memoryAdd();
      expect(calculator.memory).toBe(0.5);
    });

    it("still reads back through the getter", () => {
      calculator.angleMode = "grad";
      expect(calculator.angleMode).toBe("grad");
    });
  });

  describe("DEL undoes presses, not characters", () => {
    // The old check matched on how the text looked, so an expression typed
    // character by character could be wiped by a single DEL.
    it("removes one character when the text was typed one key at a time", () => {
      type(calculator, ["1", "0", "^"]);
      calculator.openParen();
      expect(calculator.expression).toBe("10^(");
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe("10^");
    });

    it("removes the whole thing when one key produced it", () => {
      calculator.insert("10^(");
      expect(calculator.expression).toBe("10^(");
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe("");
    });

    it("tracks a replaced trailing operator", () => {
      type(calculator, ["5", "+"]);
      type(calculator, ["*"]);
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe("5");
    });

    it("falls back to characters after a rewrite", () => {
      type(calculator, ["5", "0", "%"]);
      const before = calculator.expression;
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe(before.slice(0, -1));
    });

    it("undoes a function key in one press", () => {
      type(calculator, ["√"]);
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe("");
    });
  });

  describe("insert", () => {
    it("appends raw keypress text", () => {
      type(calculator, ["2"]);
      calculator.insert("10^(");
      type(calculator, ["3", ")", "="]);
      expect(calculator.resultDisplay).toBe("2,000");
    });

    it("is undone by a single DEL", () => {
      calculator.insert("10^(");
      type(calculator, ["DEL"]);
      expect(calculator.expression).toBe("");
    });

    it("starts fresh after =", () => {
      type(calculator, ["2", "+", "2", "="]);
      calculator.insert("10^(");
      expect(calculator.expression).toBe("10^(");
    });

    // The guard only looked for a digit, so "2." got no multiplication sign
    // and 2.10^3 came out as 9.261 instead of 2000.
    it("multiplies after a trailing decimal point", () => {
      type(calculator, ["2", "."]);
      calculator.insert("10^(");
      type(calculator, ["3", ")", "="]);
      expect(calculator.resultDisplay).toBe("2,000");
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
      // Distinct sums, because identical consecutive ones are now collapsed.
      for (let i = 0; i < 55; i++) {
        type(calculator, ["AC", ...String(i), "+", "1", "="]);
      }
      expect(calculator.history).toHaveLength(50);
    });

    it("does not stack an identical repeat", () => {
      type(calculator, ["2", "+", "3", "="]);
      calculator.moveLeft();
      type(calculator, ["="]);
      expect(calculator.history).toHaveLength(1);
    });
  });

  describe("restore", () => {
    it("brings back history and memory", () => {
      calculator.restore({
        history: [{ expression: "1 + 1", result: "2" }],
        memory: 42,
      });
      expect(calculator.history).toHaveLength(1);
      expect(calculator.memory).toBe(42);
    });

    it("caps restored history", () => {
      const many = Array.from({ length: 80 }, () => ({ expression: "1 + 1", result: "2" }));
      calculator.restore({ history: many });
      expect(calculator.history).toHaveLength(50);
    });

    it("defaults every field", () => {
      calculator.restore({});
      expect(calculator.history).toHaveLength(0);
      expect(calculator.memory).toBe(0);
      expect(calculator.lastAnswer).toBeNull();
      expect(calculator.entries).toHaveLength(0);
    });

    // The history panel showed a result that Ans then claimed not to have.
    it("brings back the answer Ans refers to", () => {
      calculator.restore({ lastAnswer: 35 });
      calculator.appendAns();
      type(calculator, ["+", "1", "="]);
      expect(calculator.resultDisplay).toBe("36");
    });

    it("brings back the entries the arrows walk through", () => {
      calculator.restore({ entries: ["1+1", "2*3"] });
      calculator.recallPrevious();
      expect(calculator.expression).toBe("2*3");
      calculator.recallPrevious();
      expect(calculator.expression).toBe("1+1");
    });

    it("caps restored entries", () => {
      const many = Array.from({ length: 80 }, (_, i) => `${i}+1`);
      calculator.restore({ entries: many });
      expect(calculator.entries).toHaveLength(50);
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

  it("starts afresh when ± follows =, rather than rewriting the result", () => {
    type(calculator, ["5", "+", "3", "="]);
    type(calculator, ["±"]);
    // Without the guard this negates the 3 inside the finished "5+3".
    expect(calculator.expression).toBe("-8");
    expect(calculator.resultDisplay).toBe("-8");
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

  // A key that inserts several characters must take one DEL to undo, not one
  // DEL per character -- otherwise the paren badge and the preview disagree.
  it("undoes the (e) key with a single DEL", () => {
    type(calculator, ["2"]);
    calculator.appendConstant("(e)");
    expect(calculator.expression).toBe("2(e)");
    type(calculator, ["DEL"]);
    expect(calculator.expression).toBe("2");
    expect(calculator.openParenCount).toBe(0);
  });

  it("undoes a function key with a single DEL", () => {
    type(calculator, ["\u221a"]);
    expect(calculator.expression).toBe("sqrt(");
    type(calculator, ["DEL"]);
    expect(calculator.expression).toBe("");
    expect(calculator.openParenCount).toBe(0);
  });

  it("still deletes one character of an ordinary number", () => {
    type(calculator, ["1", "2", "3", "DEL"]);
    expect(calculator.expression).toBe("12");
  });

  it("ignores an operator straight after an opening bracket", () => {
    type(calculator, ["(", "+", "3", ")", "="]);
    // Was "(+3)", which could never evaluate.
    expect(calculator.error).toBeNull();
    expect(calculator.resultDisplay).toBe("3");
  });
});

describe("cursor editing", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("inserts where the caret is", () => {
    type(calculator, ["1", "3"]);
    calculator.moveLeft();
    type(calculator, ["2"]);
    expect(calculator.expression).toBe("123");
  });

  it("deletes the character before the caret", () => {
    type(calculator, ["1", "2", "3"]);
    calculator.moveLeft();
    type(calculator, ["DEL"]);
    expect(calculator.expression).toBe("13");
  });

  it("fixes a typo mid-expression and evaluates the correction", () => {
    type(calculator, ["1", "+", "9", "9"]);
    calculator.moveLeft();
    type(calculator, ["DEL"]);
    type(calculator, ["1"]);
    expect(calculator.expression).toBe("1+19");
    type(calculator, ["="]);
    expect(calculator.resultDisplay).toBe("20");
  });

  it("previews as the middle is edited", () => {
    type(calculator, ["1", "0", "+", "5", "5"]);
    expect(calculator.resultDisplay).toBe("65");
    // Caret between the two 5s, so DEL takes the first of them.
    calculator.moveLeft();
    type(calculator, ["DEL"]);
    expect(calculator.expression).toBe("10+5");
    expect(calculator.resultDisplay).toBe("15");
  });

  it("deletes the operator when the caret sits just after it", () => {
    type(calculator, ["1", "0", "+", "5"]);
    calculator.moveLeft();
    type(calculator, ["DEL"]);
    expect(calculator.expression).toBe("105");
  });

  it("clamps at both ends", () => {
    type(calculator, ["1"]);
    calculator.moveLeft();
    calculator.moveLeft();
    expect(calculator.cursor).toBe(0);
    calculator.moveRight();
    calculator.moveRight();
    expect(calculator.cursor).toBe(1);
  });

  it("negates the literal at the caret, not the last one", () => {
    type(calculator, ["1", "2", "+", "3"]);
    calculator.moveLeft();
    calculator.moveLeft();
    calculator.toggleSign();
    expect(calculator.expression).toBe("-12+3");
  });

  // Every one of these acted on the whole buffer while writing at the caret.
  describe("keys act at the caret, not on the whole expression", () => {
    it("percent takes the number the caret is inside", () => {
      type(calculator, ["5", "+", "1", "0"]);
      calculator.moveLeft();
      calculator.percent();
      type(calculator, ["="]);
      expect(calculator.expression).toBe("5+(5*10/100)");
      expect(calculator.resultDisplay).toBe("5.5");
    });

    it("a power takes the number the caret is inside", () => {
      type(calculator, ["1", "2", "+", "3"]);
      calculator.moveLeft();
      calculator.moveLeft();
      calculator.moveLeft();
      calculator.square();
      expect(calculator.expression).toBe("12^2+3");
    });

    it("sign takes the number the caret is inside", () => {
      type(calculator, ["5", "+", "1", "0"]);
      calculator.moveLeft();
      calculator.toggleSign();
      expect(calculator.expression).toBe("5+-10");
    });

    it("insert multiplies against what precedes the caret", () => {
      type(calculator, ["2", "+", "5"]);
      calculator.moveLeft();
      calculator.insert("10^(");
      // Was "2+*10^(5", which can never evaluate.
      expect(calculator.expression).toBe("2+10^(5");
    });

    it("refuses an operator straight after a bracket, wherever the caret is", () => {
      calculator.openParen();
      type(calculator, ["5"]);
      calculator.moveLeft();
      type(calculator, ["+"]);
      expect(calculator.expression).toBe("(5");
    });

    // numberAtCursor rejects "5." as not-yet-a-number, so the guard has to use
    // the raw run or the second point slips through.
    it.each([
      [["5", ".", "."], "5."],
      [[".", "."], "."],
      [["5", ".", "5", "."], "5.5"],
      [["1", "+", "2", ".", "."], "1+2."],
    ])("refuses the second point in %j", (keys, expected) => {
      type(calculator, keys);
      expect(calculator.expression).toBe(expected);
    });

    it("refuses a second point in the number the caret is in", () => {
      type(calculator, ["1", ".", "5"]);
      calculator.moveLeft();
      calculator.moveLeft();
      type(calculator, ["."]);
      // Was "1..5", which cannot be read at all.
      expect(calculator.expression).toBe("1.5");
    });

    // ± and % rewrite the number at the caret, and an exponential result is
    // one number: "1e-7" negated is "-1e-7", not "1e--7".
    describe("an exponential result", () => {
      it("negates as one number", () => {
        type(calculator, ["1", "÷", ..."10000000", "="]);
        expect(calculator.resultDisplay).toBe("1e-7");
        calculator.toggleSign();
        expect(calculator.expression).toBe("-1e-7");
        type(calculator, ["="]);
        expect(calculator.resultDisplay).toBe("-1e-7");
      });

      it("takes a percentage as one number", () => {
        type(calculator, ["1", "÷", ..."10000000", "="]);
        calculator.percent();
        type(calculator, ["="]);
        expect(calculator.resultDisplay).toBe("1e-9");
      });
    });

    it("closes only a bracket that is already unclosed", () => {
      type(calculator, ["(", "2", "3", ")"]);
      calculator.moveLeft();
      calculator.moveLeft();
      calculator.closeParen();
      // Was "(2)3)", which can never evaluate.
      expect(calculator.expression).toBe("(23)");
    });

    it("still closes one that is genuinely open", () => {
      type(calculator, ["(", "2", "3"]);
      calculator.moveLeft();
      calculator.closeParen();
      expect(calculator.expression).toBe("(2)3");
    });

    it("closes only a bracket that is open at the caret", () => {
      type(calculator, ["5", "+"]);
      calculator.appendFunction("sin");
      type(calculator, ["3"]);
      for (let i = 0; i < 6; i += 1) calculator.moveLeft();
      calculator.closeParen();
      // Was "5)+sin(3", which cannot be read at all.
      expect(calculator.expression).toBe("5+sin(3");
    });

    it("allows a decimal point in a different number", () => {
      type(calculator, ["1", "+", "2", ".", "5"]);
      for (let i = 0; i < 4; i += 1) calculator.moveLeft();
      type(calculator, ["."]);
      expect(calculator.expression).toBe("1.+2.5");
    });

    it("keeps the caret where the edit happened", () => {
      type(calculator, ["5", "+", "1", "0", "*", "2"]);
      calculator.moveLeft();
      calculator.moveLeft();
      calculator.toggleSign();
      expect(calculator.expression).toBe("5+-10*2");
      // The caret follows the number it just changed, not the end of the line.
      expect(calculator.cursor).toBe(5);
    });
  });

  it("previews a half-typed tail inside brackets", () => {
    calculator.appendFunction("sqrt");
    type(calculator, ["9"]);
    expect(calculator.resultDisplay).toBe("3");
    type(calculator, ["+"]);
    // The fallback candidate was balanced before its tail was stripped, so the
    // anchored regex never matched and the preview went blank.
    expect(calculator.resultDisplay).toBe("3");
  });

  it("banks the previewed value even with a bracket open", () => {
    calculator.appendFunction("sqrt");
    type(calculator, ["9", "+"]);
    calculator.memoryAdd();
    expect(calculator.memory).toBe(3);
  });

  describe("the caret position on screen", () => {
    it("maps through the operator spacing", () => {
      type(calculator, ["1", "2", "+", "3"]);
      expect(calculator.expressionDisplay).toBe("12 + 3");
      expect(calculator.displayCursor).toBe(6);
      calculator.moveLeft();
      calculator.moveLeft();
      // raw "12|+3" -> shown "12| + 3"
      expect(calculator.displayCursor).toBe(2);
    });

    it("has no caret on a finished calculation", () => {
      type(calculator, ["1", "+", "1", "="]);
      expect(calculator.displayCursor).toBeNull();
    });

    it("sits at 0 on an empty expression", () => {
      expect(calculator.displayCursor).toBe(0);
    });
  });
});

// Unary minus binds looser than "^", so a negative result carried into a
// power has to be bracketed: -7 squared is 49, not -49.
describe("powers of a negative result", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("squares a negative result correctly", () => {
    type(calculator, ["2", "-", "9", "="]);
    expect(calculator.resultDisplay).toBe("-7");
    calculator.square();
    type(calculator, ["="]);
    expect(calculator.resultDisplay).toBe("49");
  });

  it("repeats a power on a negative result correctly", () => {
    type(calculator, ["2", "-", "3", "^", "2", "="]);
    expect(calculator.resultDisplay).toBe("-7");
    type(calculator, ["="]);
    expect(calculator.resultDisplay).toBe("49");
  });

  it("leaves a positive result unbracketed", () => {
    type(calculator, ["2", "+", "5", "="]);
    calculator.square();
    expect(calculator.expression).toBe("7^2");
  });

  it("does not change what a reciprocal means", () => {
    type(calculator, ["2", "-", "9", "="]);
    calculator.reciprocal();
    type(calculator, ["="]);
    expect(calculator.resultDisplay).toBe("-0.142857142857");
  });
});

describe("entry recall", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("does nothing before anything has been computed", () => {
    expect(calculator.recallPrevious()).toBe(false);
    expect(calculator.expression).toBe("");
  });

  // The keypad leaves the key to the browser when these report false, so the
  // page can still be scrolled with the arrows.
  it("reports whether a move or recall actually happened", () => {
    expect(calculator.moveLeft()).toBe(false);
    expect(calculator.recallNext()).toBe(false);
    type(calculator, ["1", "2"]);
    expect(calculator.moveLeft()).toBe(true);
    expect(calculator.moveRight()).toBe(true);
    expect(calculator.moveRight()).toBe(false);
  });

  it("brings back the previous expression", () => {
    type(calculator, ["1", "+", "1", "=", "AC"]);
    calculator.recallPrevious();
    expect(calculator.expression).toBe("1+1");
  });

  it("walks back through several", () => {
    type(calculator, ["1", "+", "1", "=", "AC"]);
    type(calculator, ["2", "*", "3", "=", "AC"]);
    calculator.recallPrevious();
    expect(calculator.expression).toBe("2*3");
    calculator.recallPrevious();
    expect(calculator.expression).toBe("1+1");
  });

  it("stops at the oldest", () => {
    type(calculator, ["1", "+", "1", "=", "AC"]);
    calculator.recallPrevious();
    calculator.recallPrevious();
    calculator.recallPrevious();
    expect(calculator.expression).toBe("1+1");
  });

  it("walks forward again and clears past the newest", () => {
    type(calculator, ["1", "+", "1", "=", "AC"]);
    type(calculator, ["2", "*", "3", "=", "AC"]);
    calculator.recallPrevious();
    calculator.recallPrevious();
    calculator.recallNext();
    expect(calculator.expression).toBe("2*3");
    calculator.recallNext();
    expect(calculator.expression).toBe("");
  });

  it("is cleared by the clear-history key", () => {
    type(calculator, ["1", "+", "1", "=", "AC"]);
    calculator.clearHistory();
    calculator.recallPrevious();
    expect(calculator.expression).toBe("");
  });

  it("caps the recall list", () => {
    for (let i = 0; i < 60; i += 1) {
      type(calculator, ["AC"]);
      type(calculator, [...String(i), "+", "1", "="]);
    }
    type(calculator, ["AC"]);
    for (let i = 0; i < 80; i += 1) calculator.recallPrevious();
    // The oldest survivor is entry 10 of 0..59, so 50 are kept.
    expect(calculator.expression).toBe("10+1");
  });

  it("lets a recalled entry be edited and recomputed", () => {
    type(calculator, ["1", "0", "+", "5", "=", "AC"]);
    calculator.recallPrevious();
    type(calculator, ["DEL", "7", "="]);
    expect(calculator.resultDisplay).toBe("17");
  });

  it("does not record the same expression twice in a row", () => {
    type(calculator, ["1", "+", "1", "=", "AC"]);
    type(calculator, ["2", "+", "2", "=", "AC"]);
    type(calculator, ["2", "+", "2", "=", "AC"]);

    calculator.recallPrevious();
    expect(calculator.expression).toBe("2+2");
    // With the duplicate recorded this would still be "2+2".
    calculator.recallPrevious();
    expect(calculator.expression).toBe("1+1");
  });
});

describe("Ans", () => {
  let calculator: Calculator;
  beforeEach(() => { calculator = new Calculator(); });

  it("refers to the previous result", () => {
    type(calculator, ["5", "*", "7", "="]);
    calculator.appendAns();
    type(calculator, ["+", "1", "="]);
    expect(calculator.resultDisplay).toBe("36");
  });

  it("chains", () => {
    type(calculator, ["2", "="]);
    for (let i = 0; i < 3; i++) {
      calculator.appendAns();
      type(calculator, ["*", "2", "="]);
    }
    expect(calculator.resultDisplay).toBe("16");
  });

  it("survives AC, as memory does", () => {
    type(calculator, ["5", "*", "7", "=", "AC"]);
    calculator.appendAns();
    type(calculator, ["+", "1", "="]);
    expect(calculator.resultDisplay).toBe("36");
  });

  it("errors before there is an answer", () => {
    calculator.appendAns();
    type(calculator, ["="]);
    expect(calculator.error).toBe("No previous answer");
  });

  it("previews live", () => {
    type(calculator, ["9", "="]);
    calculator.appendAns();
    type(calculator, ["+", "1"]);
    expect(calculator.resultDisplay).toBe("10");
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
