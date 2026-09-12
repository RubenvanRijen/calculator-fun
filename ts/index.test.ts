// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupCalculator } from "./index.js";
import type { CalculatorHandle } from "./interfaces/calculator-handle.js";

// Read the real page rather than a hand-copied fixture, so these tests cannot
// silently drift away from the markup that actually ships.
// (import.meta.url is not a file: URL under the jsdom environment, so resolve
// from the Vitest root instead.)
const page = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
// Includes the header, so the theme toggle is part of what is exercised.
const MARKUP = page.slice(page.indexOf("<header"), page.indexOf("</main>") + 7);

describe("setupCalculator", () => {
  let root: HTMLElement;
  let handle: CalculatorHandle;

  function button(label: string): HTMLButtonElement {
    const found = [...root.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label
    );
    if (!found) throw new Error(`No button labelled "${label}"`);
    return found;
  }

  /** Click buttons by their label, as a user would. */
  function press(...labels: string[]): void {
    for (const label of labels) button(label).click();
  }

  /** Type on the keyboard, as a user would. */
  function type(...keys: string[]): void {
    for (const key of keys) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      );
    }
  }

  const expression = () => root.querySelector("[data-expression]")?.textContent;
  const result = () => root.querySelector("[data-result]")?.textContent;
  const errorEl = () => root.querySelector<HTMLElement>("[data-error]");
  const memoryEl = () => root.querySelector<HTMLElement>("[data-memory-indicator]");
  const parenEl = () => root.querySelector<HTMLElement>("[data-paren-indicator]");
  const entries = () => [...root.querySelectorAll<HTMLElement>(".history-entry")];

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = MARKUP;
    root = document.body;
    handle = setupCalculator(root);
  });

  afterEach(() => {
    handle.destroy();
    localStorage.clear();
  });

  describe("the shipped markup", () => {
    it("has every control the wiring looks for", () => {
      for (const selector of [
        "[data-number]", "[data-operation]", "[data-equals]", "[data-delete]",
        "[data-all-clear]", "[data-sign]", "[data-percent]", "[data-memory]",
        "[data-square]", "[data-reciprocal]", "[data-function]", "[data-constant]",
        "[data-open-paren]", "[data-close-paren]", "[data-expression]", "[data-result]",
        "[data-error]", "[data-memory-indicator]", "[data-paren-indicator]",
        "[data-history-list]", "[data-history-clear]", "[data-tab]", "[data-panel]",
        "[data-graph-input]", "[data-graph-svg]", "[data-graph-error]",
        "[data-theme-toggle]", "[data-theme-icon]",
      ]) {
        expect(root.querySelector(selector), selector).not.toBeNull();
      }
    });
  });

  describe("clicking", () => {
    it("starts blank", () => {
      expect(expression()).toBe("");
      expect(result()).toBe("");
    });

    it("respects precedence", () => {
      press("2", "+", "3", "*", "4", "=");
      expect(result()).toBe("14");
    });

    it("shows a live preview before =", () => {
      press("2", "+", "3");
      expect(expression()).toBe("2 + 3");
      expect(result()).toBe("5");
    });

    it("wires up parentheses", () => {
      press("(", "2", "+", "3", ")", "*", "4", "=");
      expect(result()).toBe("20");
    });

    it("shows how many parens are open", () => {
      expect(parenEl()?.hidden).toBe(true);
      press("(", "(");
      expect(parenEl()?.hidden).toBe(false);
      expect(parenEl()?.textContent).toBe("( 2");
    });

    it("wires up the scientific keys", () => {
      press("5", "x²", "=");
      expect(result()).toBe("25");
      press("AC", "4", "1/x", "=");
      expect(result()).toBe("0.25");
      press("AC", "√", "9", "=");
      expect(result()).toBe("3");
      press("AC", "π", "=");
      expect(result()).toBe("3.14159265359");
    });

    it("wires up xⁿ", () => {
      press("2", "xⁿ", "1", "0", "=");
      expect(result()).toBe("1,024");
    });

    it("wires up ± and %", () => {
      press("5", "±");
      expect(expression()).toBe("-5");
      press("AC", "5", "0", "+", "1", "0", "%", "=");
      expect(result()).toBe("55");
    });

    it("repeats on a second =", () => {
      press("5", "+", "3", "=", "=");
      expect(result()).toBe("11");
    });

    it("groups thousands in the result", () => {
      press("1", "0", "0", "0", "*", "1", "0", "=");
      expect(result()).toBe("10,000");
    });
  });

  describe("inline errors", () => {
    it("is hidden to begin with", () => {
      expect(errorEl()?.hidden).toBe(true);
    });

    it("shows a divide-by-zero message in the page", () => {
      press("5", "÷", "0", "=");
      expect(errorEl()?.hidden).toBe(false);
      expect(errorEl()?.textContent).toBe("Cannot divide by zero");
    });

    it("clears on the next keypress", () => {
      press("5", "÷", "0", "=", "1");
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
      expect(expression()).toBe("7");
    });

    it("subtracts and clears", () => {
      press("7", "M+", "AC", "2", "M−", "AC", "MR");
      expect(expression()).toBe("5");
      press("MC");
      expect(memoryEl()?.hidden).toBe(true);
    });
  });

  describe("history", () => {
    it("lists a completed sum", () => {
      press("1", "2", "+", "3", "=");
      expect(entries()).toHaveLength(1);
      expect(entries()[0]?.textContent).toContain("12 + 3");
    });

    it("loads a result back when clicked", () => {
      press("1", "2", "+", "3", "=", "AC");
      entries()[0]?.click();
      expect(expression()).toBe("15");
    });

    it("empties when Clear is pressed", () => {
      press("1", "+", "1", "=", "Clear");
      expect(entries()).toHaveLength(0);
    });
  });

  describe("keyboard", () => {
    it("types digits and computes with Enter", () => {
      type("1", "2", "+", "3", "Enter");
      expect(result()).toBe("15");
    });

    it("respects precedence from the keyboard", () => {
      type("2", "+", "3", "*", "4", "Enter");
      expect(result()).toBe("14");
    });

    it("maps / onto ÷", () => {
      type("8", "/", "2", "Enter");
      expect(result()).toBe("4");
    });

    it("types parentheses", () => {
      type("(", "2", "+", "3", ")", "*", "4", "Enter");
      expect(result()).toBe("20");
    });

    it("types ^", () => {
      type("2", "^", "8", "Enter");
      expect(result()).toBe("256");
    });

    it("deletes and clears", () => {
      type("1", "2", "3", "Backspace");
      expect(expression()).toBe("12");
      type("Escape");
      expect(expression()).toBe("");
    });

    it("flashes the matching button", () => {
      type("7");
      expect(button("7").classList.contains("is-pressed")).toBe(true);
    });

    it("ignores keys it does not own", () => {
      const event = new KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });

    it("ignores shortcuts such as Ctrl+1", () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "1", ctrlKey: true, bubbles: true, cancelable: true })
      );
      expect(expression()).toBe("");
    });

    it("does not hijack typing into the graph input", () => {
      const input = root.querySelector<HTMLInputElement>("[data-graph-input]");
      input?.focus();
      type("5");
      expect(expression()).toBe("");
    });

    it("stops listening once destroyed", () => {
      handle.destroy();
      type("9");
      expect(expression()).toBe("");
    });
  });

  describe("tabs", () => {
    it("starts on history", () => {
      expect(root.querySelector<HTMLElement>('[data-panel="history"]')?.hidden).toBe(false);
      expect(root.querySelector<HTMLElement>('[data-panel="graph"]')?.hidden).toBe(true);
    });

    it("switches to the graph panel", () => {
      button("ƒ(x)").click();
      expect(root.querySelector<HTMLElement>('[data-panel="graph"]')?.hidden).toBe(false);
      expect(root.querySelector<HTMLElement>('[data-panel="history"]')?.hidden).toBe(true);
    });

    it("marks the active tab for assistive technology", () => {
      button("ƒ(x)").click();
      expect(button("ƒ(x)").getAttribute("aria-selected")).toBe("true");
      expect(button("History").getAttribute("aria-selected")).toBe("false");
    });
  });

  describe("graph", () => {
    const svg = () => root.querySelector("[data-graph-svg]");
    const paths = () => [...(svg()?.querySelectorAll("path.plot-line") ?? [])];

    beforeEach(() => {
      button("ƒ(x)").click();
    });

    it("draws the default function", () => {
      expect(paths().length).toBeGreaterThan(0);
      expect(paths()[0]?.getAttribute("d")).toMatch(/^M[\d.]+ [\d.]+ L/);
    });

    it("draws axes when they fall in range", () => {
      expect(svg()?.querySelectorAll("line.plot-axis").length).toBeGreaterThan(0);
    });

    it("redraws when the expression changes", () => {
      const input = root.querySelector<HTMLInputElement>("[data-graph-input]");
      const before = paths()[0]?.getAttribute("d");
      if (input) input.value = "x^3";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      expect(paths()[0]?.getAttribute("d")).not.toBe(before);
    });

    it("shows an error for an unparseable expression", () => {
      const input = root.querySelector<HTMLInputElement>("[data-graph-input]");
      if (input) input.value = "x^^2";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      const error = root.querySelector<HTMLElement>("[data-graph-error]");
      expect(error?.hidden).toBe(false);
      expect(error?.textContent).not.toBe("");
    });

    it("breaks a discontinuous function into several paths", () => {
      const input = root.querySelector<HTMLInputElement>("[data-graph-input]");
      if (input) input.value = "1/x";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      expect(paths().length).toBeGreaterThanOrEqual(2);
    });

    it("loads an example when its chip is clicked", () => {
      button("sin x").click();
      const input = root.querySelector<HTMLInputElement>("[data-graph-input]");
      expect(input?.value).toBe("sin(x)");
      expect(paths().length).toBeGreaterThan(0);
    });

    it("respects the x range", () => {
      const min = root.querySelector<HTMLInputElement>("[data-graph-min]");
      const before = paths()[0]?.getAttribute("d");
      if (min) min.value = "-2";
      min?.dispatchEvent(new Event("input", { bubbles: true }));
      expect(paths()[0]?.getAttribute("d")).not.toBe(before);
    });
  });

  describe("theme", () => {
    it("stamps a theme on the document", () => {
      expect(["light", "dark"]).toContain(document.documentElement.dataset["theme"]);
    });

    it("toggles", () => {
      const before = document.documentElement.dataset["theme"];
      root.querySelector<HTMLElement>("[data-theme-toggle]")?.click();
      expect(document.documentElement.dataset["theme"]).not.toBe(before);
    });
  });

  describe("persistence", () => {
    it("restores history and memory on the next visit", () => {
      press("1", "2", "+", "3", "=");
      press("7", "M+");
      handle.destroy();

      document.body.innerHTML = MARKUP;
      root = document.body;
      handle = setupCalculator(root);

      expect(entries()).toHaveLength(1);
      expect(memoryEl()?.hidden).toBe(false);
    });

    it("restores the chosen theme", () => {
      root.querySelector<HTMLElement>("[data-theme-toggle]")?.click();
      const chosen = document.documentElement.dataset["theme"];
      handle.destroy();

      document.body.innerHTML = MARKUP;
      root = document.body;
      handle = setupCalculator(root);

      expect(document.documentElement.dataset["theme"]).toBe(chosen);
    });
  });

  describe("markup guards", () => {
    it("throws when the display elements are missing", () => {
      document.body.innerHTML = `<div class="calculator-grid"></div>`;
      expect(() => setupCalculator(document.body)).toThrow(/missing \[data-expression\]/);
    });
  });
});
