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

  /** Find a button by the label it currently shows. */
  function button(label: string): HTMLButtonElement {
    const found = [...root.querySelectorAll("button")].find(
      (candidate) =>
        (candidate.querySelector(".legend") ?? candidate).textContent?.trim() === label
    );
    if (!found) throw new Error(`No button labelled "${label}"`);
    return found;
  }

  /** Find a key by the action it runs, regardless of its label. */
  function keyFor(action: string): HTMLButtonElement {
    const found = root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
    if (!found) throw new Error(`No key with action "${action}"`);
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
    it("only references actions the registry implements", () => {
      const keys = [...root.querySelectorAll<HTMLElement>("[data-keypad] button")];
      expect(keys.length).toBeGreaterThan(0);

      for (const key of keys) {
        const primary = key.dataset["action"];
        expect(handle.actionNames, `primary of ${key.textContent}`).toContain(primary);

        const alt = key.dataset["actionAlt"];
        if (alt !== undefined) {
          expect(handle.actionNames, `2nd of ${key.textContent}`).toContain(alt);
        }
      }
    });

    it("gives every key a primary legend", () => {
      for (const key of root.querySelectorAll<HTMLElement>("[data-keypad] button")) {
        expect(key.querySelector(".legend")?.textContent?.trim()).toBeTruthy();
      }
    });

    it("gives every 2nd action its own legend", () => {
      for (const key of root.querySelectorAll<HTMLElement>("[data-keypad] button[data-action-alt]")) {
        expect(key.querySelector(".legend-alt")?.textContent?.trim()).toBeTruthy();
      }
    });

    it("has every panel control the wiring looks for", () => {
      for (const selector of [
        "[data-expression]", "[data-result]", "[data-error]",
        "[data-memory-indicator]", "[data-paren-indicator]",
        "[data-history-list]", "[data-history-clear]", "[data-tab]", "[data-panel]",
        "[data-graph-input]", "[data-graph-svg]", "[data-graph-error]",
        "[data-theme-toggle]", "[data-theme-icon]", "[data-keypad]",
      ]) {
        expect(root.querySelector(selector), selector).not.toBeNull();
      }
    });
  });

  describe("the 2nd shift layer", () => {
    const keypad = () => root.querySelector<HTMLElement>("[data-keypad]");

    it("starts unshifted", () => {
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("turns on when 2nd is pressed", () => {
      press("2nd");
      expect(keypad()?.dataset["shift"]).toBe("on");
    });

    it("turns off when 2nd is pressed again", () => {
      press("2nd", "2nd");
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("runs the alternate action of the next key", () => {
      press("2nd");
      keyFor("constant").click();
      // \u03c0 primary, e alternate -- both already known to the tokenizer.
      expect(expression()).toBe("(e)");
    });

    it("clears after a single key, as the hardware does", () => {
      press("2nd");
      keyFor("constant").click();
      expect(keypad()?.dataset["shift"]).not.toBe("on");
      keyFor("constant").click();
      expect(expression()).toBe("(e)\u03c0");
    });

    it("falls back to the primary action on a key with no alternate", () => {
      press("2nd");
      press("7");
      expect(expression()).toBe("7");
    });

    it("still clears the shift after a key with no alternate", () => {
      press("2nd", "7");
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("reaches clear-history through 2nd on MC", () => {
      press("1", "+", "1", "=");
      expect(entries()).toHaveLength(1);
      press("2nd");
      keyFor("memory").click();
      expect(entries()).toHaveLength(0);
    });

    it("gives a usable value from the 2nd e key next to a digit", () => {
      press("2");
      press("2nd");
      keyFor("constant").click();
      press("5", "=");
      expect(result()).toBe("27.1828182846");
    });

    it("does not latch when the keyboard is used mid-shift", () => {
      press("2nd");
      expect(keypad()?.dataset["shift"]).toBe("on");
      type("5");
      // A keypress consumes the shift just as a click would.
      expect(keypad()?.dataset["shift"]).not.toBe("on");
      keyFor("function").click();
      expect(expression()).toBe("5sqrt(");
    });

    it("does not latch when a key names an action that does not exist", () => {
      const stray = keyFor("percent");
      stray.dataset["actionAlt"] = "no-such-action";
      press("2nd");
      stray.click();
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    // The shift used to survive any click outside the keypad, so a detour to
    // the history or a tab left the next key running its alternate -- with MC
    // that silently wiped the history instead of the memory.
    it("is spent by clicking a history entry", () => {
      press("1", "+", "1", "=");
      press("2nd");
      root.querySelector<HTMLElement>(".history-entry")?.click();
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("is spent by switching tabs", () => {
      press("2nd");
      button("\u0192(x)").click();
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("is spent by the theme toggle", () => {
      press("2nd");
      root.querySelector<HTMLElement>("[data-theme-toggle]")?.click();
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("does not wipe history when MC follows a detour", () => {
      press("1", "+", "1", "=");
      press("7");
      keyFor("memory").click(); // M... actually MC is the first memory key
      press("2nd");
      button("\u0192(x)").click();
      button("History").click();
      keyFor("memory").click();
      expect(entries()).toHaveLength(1);
    });

    it("reaches abs through 2nd on the root key", () => {
      press("2nd");
      keyFor("function").click();
      expect(expression()).toBe("abs(");
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

    it("falls back to the default range when a bound is cleared", () => {
      const min = root.querySelector<HTMLInputElement>("[data-graph-min]");
      const max = root.querySelector<HTMLInputElement>("[data-graph-max]");
      const error = root.querySelector<HTMLElement>("[data-graph-error]");

      // An emptied number input reads as "", which Number() turns into 0 --
      // clearing both used to collapse the range and report a bogus error.
      if (min) min.value = "";
      min?.dispatchEvent(new Event("input", { bubbles: true }));
      if (max) max.value = "";
      max?.dispatchEvent(new Event("input", { bubbles: true }));

      expect(error?.hidden).toBe(true);
      expect(paths().length).toBeGreaterThan(0);
    });

    it("ignores a non-numeric bound", () => {
      const min = root.querySelector<HTMLInputElement>("[data-graph-min]");
      if (min) min.value = "abc";
      min?.dispatchEvent(new Event("input", { bubbles: true }));
      expect(root.querySelector<HTMLElement>("[data-graph-error]")?.hidden).toBe(true);
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

    // Without this the keypad wrapper could be renamed and every key would go
    // quietly dead, with nothing to say why.
    it("throws when the keypad wrapper is missing", () => {
      document.body.innerHTML = MARKUP.replace(" data-keypad", "");
      expect(() => setupCalculator(document.body)).toThrow(/missing \[data-keypad\]/);
    });

    it("gives every arg-taking key an argument", () => {
      const needsArg = ["number", "operation", "function", "constant", "memory"];
      for (const key of root.querySelectorAll<HTMLElement>("[data-keypad] button")) {
        const action = key.dataset["action"];
        if (action !== undefined && needsArg.includes(action)) {
          expect(key.dataset["arg"], `${action} key`).toBeTruthy();
        }
        const alt = key.dataset["actionAlt"];
        if (alt !== undefined && needsArg.includes(alt)) {
          expect(key.dataset["argAlt"], `2nd ${alt} key`).toBeTruthy();
        }
      }
    });

    it("does nothing for an arg-taking key whose argument is missing", () => {
      const key = keyFor("function");
      delete key.dataset["arg"];
      key.click();
      // Previously appended a bare "(".
      expect(expression()).toBe("");
    });
  });

  describe("destroy", () => {
    // The root click listener outlives the markup, so a stale instance could
    // otherwise keep writing its own state back to localStorage.
    it("stops the outside-click listener too", () => {
      press("1", "+", "1", "=");
      press("2nd");
      handle.destroy();

      localStorage.clear();
      document.body.innerHTML = MARKUP;
      root = document.body;
      handle = setupCalculator(root);
      expect(entries()).toHaveLength(0);

      root.querySelector<HTMLElement>("[data-theme-toggle]")?.click();
      expect(entries()).toHaveLength(0);

      const saved = localStorage.getItem("calculator-fun.state") ?? "{}";
      expect(JSON.parse(saved).history ?? []).toHaveLength(0);
    });
  });
});
