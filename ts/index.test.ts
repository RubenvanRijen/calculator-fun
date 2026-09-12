// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupCalculator } from "./index.js";
import type { CalculatorHandle } from "./interfaces/calculator-handle.js";

// Read the real page rather than a hand-copied fixture, so these tests cannot
// silently drift away from the markup that actually ships.
// (import.meta.url is not a file: URL under the jsdom environment, so resolve
// from the Vitest root instead.)
const page = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const MARKUP = page.slice(page.indexOf("<main"), page.indexOf("</main>") + 7);

describe("setupCalculator", () => {
  let root: HTMLElement;
  let handle: CalculatorHandle;

  /** Click the button whose label is `label`, as a user would. */
  function press(...labels: string[]): void {
    for (const label of labels) {
      const button = [...root.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === label
      );
      if (!button) throw new Error(`No button labelled "${label}"`);
      button.click();
    }
  }

  /** Type on the keyboard, as a user would. */
  function type(...keys: string[]): void {
    for (const key of keys) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      );
    }
  }

  const current = () => root.querySelector("[data-current-operand]")?.textContent;
  const previous = () => root.querySelector("[data-previous-operand]")?.textContent;
  const errorEl = () => root.querySelector<HTMLElement>("[data-error]");
  const memoryEl = () => root.querySelector<HTMLElement>("[data-memory-indicator]");
  const historyEntries = () =>
    [...root.querySelectorAll<HTMLElement>(".history-entry")].map((el) => ({
      expression: el.querySelector(".history-expression")?.textContent,
      result: el.querySelector(".history-result")?.textContent,
    }));

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
    root = document.body;
    handle = setupCalculator(root);
  });

  afterEach(() => {
    handle.destroy();
  });

  describe("the shipped markup", () => {
    it("has every control the wiring looks for", () => {
      for (const selector of [
        "[data-number]",
        "[data-operation]",
        "[data-equals]",
        "[data-delete]",
        "[data-all-clear]",
        "[data-sign]",
        "[data-percent]",
        "[data-memory]",
        "[data-error]",
        "[data-memory-indicator]",
        "[data-history-list]",
        "[data-history-clear]",
      ]) {
        expect(root.querySelector(selector), selector).not.toBeNull();
      }
    });
  });

  describe("clicking", () => {
    it("starts blank", () => {
      expect(current()).toBe("");
      expect(previous()).toBe("");
    });

    it("computes a sum", () => {
      press("1", "2", "+", "3", "=");
      expect(current()).toBe("15");
      expect(previous()).toBe("");
    });

    it("groups thousands", () => {
      press("1", "0", "0", "0");
      expect(current()).toBe("1,000");
    });

    it("wires up every operator", () => {
      press("8", "÷", "2", "=");
      expect(current()).toBe("4");
      press("*", "3", "=");
      expect(current()).toBe("12");
      press("-", "2", "=");
      expect(current()).toBe("10");
      press("+", "5", "=");
      expect(current()).toBe("15");
    });

    it("wires up DEL and AC", () => {
      press("1", "2", "3", "DEL");
      expect(current()).toBe("12");
      press("AC");
      expect(current()).toBe("");
    });

    it("wires up the sign toggle", () => {
      press("5", "±");
      expect(current()).toBe("-5");
    });

    it("wires up percent", () => {
      press("5", "0", "+", "1", "0", "%", "=");
      expect(current()).toBe("55");
    });
  });

  describe("inline errors", () => {
    it("is hidden to begin with", () => {
      expect(errorEl()?.hidden).toBe(true);
      expect(errorEl()?.textContent).toBe("");
    });

    it("shows a divide-by-zero message in the page, not an alert", () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      press("5", "÷", "0", "=");
      expect(errorEl()?.hidden).toBe(false);
      expect(errorEl()?.textContent).toBe("Cannot divide by zero");
      expect(alertSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("clears on the next keypress", () => {
      press("5", "÷", "0", "=");
      press("1");
      expect(errorEl()?.hidden).toBe(true);
    });
  });

  describe("memory keys", () => {
    it("hides the indicator until memory holds something", () => {
      expect(memoryEl()?.hidden).toBe(true);
      press("7", "M+");
      expect(memoryEl()?.hidden).toBe(false);
    });

    it("recalls a stored value", () => {
      press("7", "M+", "AC", "MR");
      expect(current()).toBe("7");
    });

    it("subtracts from memory", () => {
      press("7", "M+", "AC", "2", "M−", "AC", "MR");
      expect(current()).toBe("5");
    });

    it("clears memory and hides the indicator", () => {
      press("7", "M+", "MC");
      expect(memoryEl()?.hidden).toBe(true);
    });
  });

  describe("history", () => {
    it("shows the empty note before anything is computed", () => {
      expect(
        root.querySelector<HTMLElement>("[data-history-empty]")?.hidden
      ).toBe(false);
      expect(historyEntries()).toHaveLength(0);
    });

    it("lists a completed sum", () => {
      press("1", "2", "+", "3", "=");
      expect(historyEntries()).toEqual([{ expression: "12 + 3", result: "15" }]);
    });

    it("hides the empty note once there is an entry", () => {
      press("1", "+", "1", "=");
      expect(root.querySelector<HTMLElement>("[data-history-empty]")?.hidden).toBe(true);
    });

    it("puts the newest first", () => {
      press("1", "+", "1", "=", "AC", "2", "+", "2", "=");
      expect(historyEntries().map((e) => e.result)).toEqual(["4", "2"]);
    });

    it("loads a result back into the display when clicked", () => {
      press("1", "2", "+", "3", "=", "AC");
      expect(current()).toBe("");
      root.querySelector<HTMLElement>(".history-entry")?.click();
      expect(current()).toBe("15");
    });

    it("empties when Clear is pressed", () => {
      press("1", "+", "1", "=");
      press("Clear");
      expect(historyEntries()).toHaveLength(0);
    });
  });

  describe("keyboard", () => {
    it("types digits", () => {
      type("1", "2", "3");
      expect(current()).toBe("123");
    });

    it("computes with Enter", () => {
      type("1", "2", "+", "3", "Enter");
      expect(current()).toBe("15");
    });

    it("computes with =", () => {
      type("4", "*", "2", "=");
      expect(current()).toBe("8");
    });

    it("maps / onto ÷", () => {
      type("8", "/", "2", "Enter");
      expect(current()).toBe("4");
      expect(errorEl()?.hidden).toBe(true);
    });

    it("deletes with Backspace", () => {
      type("1", "2", "3", "Backspace");
      expect(current()).toBe("12");
    });

    it("clears with Escape", () => {
      type("1", "2", "+", "3", "Escape");
      expect(current()).toBe("");
      expect(previous()).toBe("");
    });

    it("applies percent", () => {
      type("5", "0", "+", "1", "0", "%", "Enter");
      expect(current()).toBe("55");
    });

    it("types decimals", () => {
      type("1", ".", "5", "+", "2", ".", "5", "Enter");
      expect(current()).toBe("4");
    });

    it("flashes the matching button", () => {
      type("7");
      const seven = [...root.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "7"
      );
      expect(seven?.classList.contains("is-pressed")).toBe(true);
    });

    it("prevents the browser default for keys it handles", () => {
      const event = new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it("ignores keys it does not own", () => {
      const event = new KeyboardEvent("keydown", {
        key: "q",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(current()).toBe("");
    });

    it("ignores shortcuts such as Ctrl+R", () => {
      const event = new KeyboardEvent("keydown", {
        key: "1",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(current()).toBe("");
    });

    it("lets a focused button handle its own Enter, rather than firing twice", () => {
      const equals = root.querySelector<HTMLButtonElement>("[data-equals]");
      equals?.focus();
      type("1", "+", "2");
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it("stops listening once destroyed", () => {
      handle.destroy();
      type("9");
      expect(current()).toBe("");
    });
  });

  describe("markup guards", () => {
    it("throws when the display elements are missing", () => {
      document.body.innerHTML = `<div class="calculator-grid"></div>`;
      expect(() => setupCalculator(document.body)).toThrow(
        /missing \[data-previous-operand\]/
      );
    });
  });
});
