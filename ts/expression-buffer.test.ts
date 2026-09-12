import { describe, it, expect, beforeEach } from "vitest";
import { ExpressionBuffer } from "./expression-buffer.js";

describe("ExpressionBuffer", () => {
  let buffer: ExpressionBuffer;

  beforeEach(() => {
    buffer = new ExpressionBuffer();
  });

  describe("appending at the end", () => {
    it("starts empty with the cursor at 0", () => {
      expect(buffer.text).toBe("");
      expect(buffer.cursor).toBe(0);
      expect(buffer.atEnd).toBe(true);
    });

    it("keeps the cursor at the end as text is pushed", () => {
      buffer.push("12");
      buffer.push("+");
      expect(buffer.text).toBe("12+");
      expect(buffer.cursor).toBe(3);
    });

    it("ignores an empty push", () => {
      buffer.push("");
      expect(buffer.text).toBe("");
    });

    it("undoes a multi-character keypress in one pop", () => {
      buffer.push("2");
      buffer.push("sqrt(");
      buffer.pop();
      expect(buffer.text).toBe("2");
    });
  });

  describe("moving the cursor", () => {
    beforeEach(() => {
      buffer.push("123");
    });

    it("moves left and right", () => {
      expect(buffer.moveLeft()).toBe(true);
      expect(buffer.cursor).toBe(2);
      expect(buffer.moveRight()).toBe(true);
      expect(buffer.cursor).toBe(3);
    });

    it("stops at the start", () => {
      buffer.moveToStart();
      expect(buffer.moveLeft()).toBe(false);
      expect(buffer.cursor).toBe(0);
    });

    it("stops at the end", () => {
      expect(buffer.moveRight()).toBe(false);
      expect(buffer.cursor).toBe(3);
    });

    it("reports atEnd honestly", () => {
      expect(buffer.atEnd).toBe(true);
      buffer.moveLeft();
      expect(buffer.atEnd).toBe(false);
    });
  });

  describe("editing in the middle", () => {
    it("inserts at the cursor", () => {
      buffer.push("13");
      buffer.moveLeft();
      buffer.push("2");
      expect(buffer.text).toBe("123");
      expect(buffer.cursor).toBe(2);
    });

    it("deletes the character before the cursor", () => {
      buffer.push("123");
      buffer.moveLeft();
      buffer.pop();
      expect(buffer.text).toBe("13");
      expect(buffer.cursor).toBe(1);
    });

    it("does nothing when deleting at the start", () => {
      buffer.push("12");
      buffer.moveToStart();
      buffer.pop();
      expect(buffer.text).toBe("12");
    });

    // Once the text no longer lines up with the presses that built it, the
    // keypress record cannot be trusted, so editing turns character-wise.
    it("falls back to character-wise deletion after a mid-edit", () => {
      buffer.push("sqrt(");
      buffer.push("9");
      buffer.moveLeft();
      buffer.push("1");
      buffer.moveToEnd();
      buffer.pop();
      expect(buffer.text).toBe("sqrt(1");
    });
  });

  describe("reading the text around the cursor", () => {
    it("reports the text before the cursor", () => {
      buffer.push("12+34");
      buffer.moveLeft();
      expect(buffer.textBeforeCursor).toBe("12+3");
    });

    // Spanning both sides of the caret matters: with "12+3|4" the user is
    // editing 34, not the 3 that happens to precede the caret.
    it("finds the whole number the cursor sits inside", () => {
      buffer.push("12+34");
      buffer.moveLeft();
      expect(buffer.numberAtCursor).toEqual({ literal: "34", start: 3, end: 5 });
    });

    it("finds the number the cursor sits at the end of", () => {
      buffer.push("12+34");
      expect(buffer.numberAtCursor).toEqual({ literal: "34", start: 3, end: 5 });
    });

    it("finds the number the cursor sits at the start of", () => {
      buffer.push("12+34");
      buffer.moveLeft();
      buffer.moveLeft();
      expect(buffer.numberAtCursor).toEqual({ literal: "34", start: 3, end: 5 });
    });

    it.each([1, 2, 3])("includes the decimal part from %s steps back", (steps) => {
      buffer.push("1+2.5");
      for (let i = 0; i < steps; i += 1) buffer.moveLeft();
      expect(buffer.numberAtCursor?.literal).toBe("2.5");
    });

    // Results round-trip through text as "1e-7", so the exponent is part of
    // the number -- treating its "-" as a subtraction changes the value.
    describe("exponent notation", () => {
      it.each([0, 1, 2, 3, 4])("spans the whole literal from %s steps back", (steps) => {
        buffer.push("1e-7");
        for (let i = 0; i < steps; i += 1) buffer.moveLeft();
        expect(buffer.numberAtCursor?.literal).toBe("1e-7");
      });

      it("spans a positive exponent", () => {
        buffer.push("9.99e+21");
        expect(buffer.numberAtCursor?.literal).toBe("9.99e+21");
      });

      it("does not swallow a genuine subtraction", () => {
        buffer.push("5-7");
        expect(buffer.numberAtCursor?.literal).toBe("7");
      });

      // "2e" is 2 x Euler's constant; the caret sits after the "e", which is
      // not part of a number, so there is nothing for the sign key to act on.
      it("does not treat a bare e as an exponent marker", () => {
        buffer.push("2e");
        expect(buffer.numberAtCursor).toBeNull();
        buffer.moveLeft();
        expect(buffer.numberAtCursor?.literal).toBe("2");
      });
    });

    // The raw run exists for the decimal-point rule, which has to see "5."
    // even though that is not yet a number.
    describe("the raw run", () => {
      it("includes a trailing point", () => {
        buffer.push("5.");
        expect(buffer.numberRunAtCursor?.literal).toBe("5.");
        expect(buffer.numberAtCursor).toBeNull();
      });

      it("is null where there is no number", () => {
        buffer.push("1+");
        expect(buffer.numberRunAtCursor).toBeNull();
      });
    });

    it("has no number after an operator", () => {
      buffer.push("12+");
      expect(buffer.numberAtCursor).toBeNull();
    });

    it("has no number next to a bracket", () => {
      buffer.push("(1+2)");
      expect(buffer.numberAtCursor).toBeNull();
    });

    it("judges endsWithOperator at the cursor", () => {
      buffer.push("1+2");
      expect(buffer.endsWithOperator).toBe(false);
      buffer.moveLeft();
      expect(buffer.endsWithOperator).toBe(true);
    });
  });

  describe("parentheses", () => {
    it("counts what is open", () => {
      buffer.push("((1");
      expect(buffer.openDepth).toBe(2);
    });

    it("never reports a negative depth", () => {
      buffer.push("1))");
      expect(buffer.openDepth).toBe(0);
    });

    it("balances for evaluation", () => {
      buffer.push("sqrt(9");
      expect(buffer.balanced).toBe("sqrt(9)");
    });

    it("leaves a balanced expression alone", () => {
      buffer.push("(1+2)");
      expect(buffer.balanced).toBe("(1+2)");
    });
  });

  describe("replaceRange and replaceBeforeCursor", () => {
    it("replaces a span and leaves the caret after it", () => {
      buffer.push("12+34");
      buffer.replaceRange(3, 5, "99");
      expect(buffer.text).toBe("12+99");
      expect(buffer.cursor).toBe(5);
    });

    it("keeps what follows the caret", () => {
      buffer.push("12+34");
      buffer.moveLeft();
      buffer.moveLeft();
      buffer.replaceBeforeCursor("9+");
      expect(buffer.text).toBe("9+34");
      expect(buffer.cursor).toBe(2);
    });

    it("clamps moveTo", () => {
      buffer.push("12");
      buffer.moveTo(99);
      expect(buffer.cursor).toBe(2);
      buffer.moveTo(-5);
      expect(buffer.cursor).toBe(0);
    });
  });

  describe("replace and clear", () => {
    it("replace puts the cursor at the end", () => {
      buffer.push("1");
      buffer.replace("999");
      expect(buffer.cursor).toBe(3);
    });

    it("clear resets everything", () => {
      buffer.push("123");
      buffer.clear();
      expect(buffer.text).toBe("");
      expect(buffer.cursor).toBe(0);
    });
  });
});
