// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupCalculator } from "@/index.ts";
import type { CalculatorHandle } from "@/interfaces/calculator-handle.ts";

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

    // A panel with no tab is unreachable, which is exactly what happened to
    // the Vars panel: its section shipped, its tab did not.
    it("gives every panel a tab to reach it by", () => {
      const panels = [...root.querySelectorAll<HTMLElement>("[data-panel]")]
        .map((panel) => panel.dataset["panel"]);
      expect(panels.length).toBeGreaterThan(1);

      for (const name of panels) {
        expect(root.querySelector(`[data-tab="${name}"]`), name).not.toBeNull();
      }
    });

    it("gives every tab a panel to show", () => {
      for (const tab of root.querySelectorAll<HTMLElement>("[data-tab]")) {
        const name = tab.dataset["tab"];
        expect(root.querySelector(`[data-panel="${name}"]`), name).not.toBeNull();
      }
    });

    it("has every panel control the wiring looks for", () => {
      for (const selector of [
        "[data-expression]", "[data-result]", "[data-error]",
        "[data-memory-indicator]", "[data-paren-indicator]",
        "[data-history-list]", "[data-history-clear]", "[data-tab]", "[data-panel]",
        '[data-graph-input="0"]', "[data-graph-svg]", "[data-graph-error]",
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
      const stray = keyFor("square");
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

    // The display sits inside the keypad grid, so the root listener never
    // sees a click on it -- the keypad listener has to spend the shift.
    it("is spent by a click inside the keypad that misses a key", () => {
      press("2nd");
      root.querySelector<HTMLElement>("[data-result]")?.click();
      expect(keypad()?.dataset["shift"]).not.toBe("on");
    });

    it("does not wipe history when MC follows a click on the display", () => {
      press("1", "+", "1", "=");
      press("2nd");
      root.querySelector<HTMLElement>("[data-result]")?.click();
      keyFor("memory").click();
      expect(entries()).toHaveLength(1);
    });

    it("announces its state to assistive technology", () => {
      const second = keyFor("second");
      expect(second.getAttribute("aria-pressed")).toBe("false");
      press("2nd");
      expect(second.getAttribute("aria-pressed")).toBe("true");
      press("7");
      expect(second.getAttribute("aria-pressed")).toBe("false");
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
      expect(result()).toBe("1/4");
      press("AC", "√", "9", "=");
      expect(result()).toBe("3");
      press("AC", "π", "=");
      expect(result()).toBe("π");
    });

    it("wires up xⁿ through 2nd", () => {
      press("2", "2nd");
      keyFor("square").click();
      press("1", "0", "=");
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

    // "^" corresponds to a key whose label moved to the 2nd layer, so the
    // lookup has to know both legends.
    it("flashes a key whose label is on the 2nd layer", () => {
      type("2", "^");
      expect(keyFor("square").classList.contains("is-pressed")).toBe(true);
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
      const input = root.querySelector<HTMLInputElement>('[data-graph-input="0"]');
      input?.focus();
      type("5");
      expect(expression()).toBe("");
    });

    // Clicking a key left focus on it, so the next Enter re-activated that key
    // instead of computing: click cos, type 60, press Enter -> "cos(60cos(".
    it("does not let Enter re-activate the key that was just clicked", () => {
      const cos = root.querySelector<HTMLButtonElement>('[data-arg="cos"]');
      // A real browser focuses the button it was clicked on; jsdom does not,
      // so focus it explicitly to reproduce the state the bug needed.
      cos?.focus();
      cos?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      expect(document.activeElement).not.toBe(cos);

      type("6", "0", "Enter");
      expect(expression()).not.toContain("cos(60cos(");
      expect(result()).toBe("-0.952412980415");
    });

    // Focus stuck on any button made the keyboard guard swallow every Enter,
    // so the calculator quietly stopped computing.
    it.each([
      [".history-entry", "a history entry"],
      ["[data-theme-toggle]", "the theme toggle"],
      ['[data-tab="graph"]', "a tab"],
    ])("keeps Enter working after clicking %s", (selector) => {
      press("1", "+", "1", "=");

      const target = root.querySelector<HTMLElement>(selector);
      target?.focus();
      target?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      expect(document.activeElement).not.toBe(target);

      press("AC");
      type("2", "+", "3", "Enter");
      expect(result()).toBe("5");
    });

    it("leaves focus alone for keyboard activation", () => {
      const seven = button("7");
      seven.focus();
      // detail 0 is what a keyboard-generated click reports.
      seven.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
      expect(document.activeElement).toBe(seven);
    });

    it("stops listening once destroyed", () => {
      handle.destroy();
      type("9");
      expect(expression()).toBe("");
    });
  });

  describe("exact answers", () => {
    const exactBadge = () => root.querySelector<HTMLElement>("[data-exact-indicator]");

    it("shows a fraction and flags it", () => {
      press("1", "÷", "3", "=");
      expect(result()).toBe("1/3");
      expect(exactBadge()?.hidden).toBe(false);
    });

    it("swaps to the decimal through 2nd on n/d", () => {
      press("1", "÷", "3", "=", "2nd");
      keyFor("fraction").click();
      expect(result()).toBe("0.333333333333");
      expect(exactBadge()?.hidden).toBe(true);
    });

    it("shows a surd", () => {
      press("2nd");
      keyFor("square").click();
      press("AC", "√", "8", ")", "=");
      expect(result()).toBe("2√2");
    });

    it("hides the badge when there is nothing exact to show", () => {
      press("2", "+", "2", "=");
      expect(exactBadge()?.hidden).toBe(true);
    });

    it("wires up n/d", () => {
      keyFor("fraction").click();
      press("1");
      keyFor("cursor-right").click();
      press("2", "=");
      expect(result()).toBe("1/2");
    });
  });

  describe("cursor, recall and Ans", () => {
    const caret = () => root.querySelector("[data-caret]");

    it("shows a caret in the expression line", () => {
      press("1", "2");
      expect(caret()).not.toBeNull();
    });

    it("keeps the expression readable around the caret", () => {
      press("1", "2", "+", "3");
      // The caret is an empty element, so textContent is unaffected.
      expect(expression()).toBe("12 + 3");
    });

    it("drops the caret once a calculation is finished", () => {
      press("1", "+", "1", "=");
      expect(caret()).toBeNull();
    });

    it("moves the caret with the arrow keys", () => {
      press("1", "3");
      type("ArrowLeft");
      type("2");
      expect(expression()).toBe("123");
    });

    it("moves the caret with the on-screen arrows", () => {
      press("1", "3");
      keyFor("cursor-left").click();
      press("2");
      expect(expression()).toBe("123");
    });

    it("recalls a previous entry with ArrowUp", () => {
      press("1", "+", "1", "=", "AC");
      type("ArrowUp");
      expect(expression()).toBe("1 + 1");
    });

    it("recalls with the on-screen arrows too", () => {
      press("1", "+", "1", "=", "AC");
      keyFor("recall-previous").click();
      expect(expression()).toBe("1 + 1");
      keyFor("recall-next").click();
      expect(expression()).toBe("");
    });

    it("wires up the Ans key", () => {
      press("5", "*", "7", "=");
      keyFor("ans").click();
      press("+", "1", "=");
      expect(result()).toBe("36");
    });

    it("reports a missing answer rather than failing silently", () => {
      keyFor("ans").click();
      press("=");
      expect(errorEl()?.textContent).toBe("No previous answer");
    });

    it("claims an arrow key only when it does something", () => {
      press("1", "2");
      const left = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
      document.dispatchEvent(left);
      expect(left.defaultPrevented).toBe(true);
    });

    // Otherwise Up/Down stop scrolling the page on a narrow screen.
    it("leaves an arrow key to the browser when it would do nothing", () => {
      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft"]) {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        expect(event.defaultPrevented, key).toBe(false);
      }
    });

    it("leaves the arrow keys alone while the graph field has focus", () => {
      press("1", "2");
      root.querySelector<HTMLInputElement>('[data-graph-input="0"]')?.focus();
      type("ArrowLeft");
      type("9");
      expect(expression()).toBe("12");
    });
  });

  describe("stored values", () => {
    const row = (name: string) =>
      root.querySelector<HTMLElement>(`[data-register="${name}"]`);
    const buttonIn = (name: string, label: string) =>
      [...(row(name)?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === label
      );

    it("lists a row for each letter", () => {
      for (const name of ["A", "B", "C", "D"]) {
        expect(row(name), name).not.toBeNull();
      }
      expect(row("E")).toBeNull();
    });

    it("starts empty", () => {
      expect(row("A")?.querySelector(".register-value")?.textContent).toBe("empty");
    });

    it("stores the displayed value", () => {
      press("4", "2");
      buttonIn("A", "Set")?.click();
      expect(row("A")?.querySelector(".register-value")?.textContent).toBe("42");
    });

    it("uses a stored value in an expression", () => {
      press("7");
      buttonIn("A", "Set")?.click();
      press("AC");
      buttonIn("A", "Use")?.click();
      press("+", "1", "=");
      expect(result()).toBe("8");
    });

    it("clears one", () => {
      press("5");
      buttonIn("A", "Set")?.click();
      buttonIn("A", "Clear")?.click();
      expect(row("A")?.querySelector(".register-value")?.textContent).toBe("empty");
    });

    it("reports using an empty one rather than guessing", () => {
      buttonIn("B", "Use")?.click();
      press("+", "1", "=");
      expect(errorEl()?.textContent).toBe("Nothing stored in B");
    });

    it("survives a reload", () => {
      press("9");
      buttonIn("A", "Set")?.click();
      handle.destroy();

      document.body.innerHTML = MARKUP;
      root = document.body;
      handle = setupCalculator(root);

      expect(row("A")?.querySelector(".register-value")?.textContent).toBe("9");
    });
  });

  describe("probability keys", () => {
    it("reaches nCr through 2nd on the divide key", () => {
      press("5", "2", "2nd");
      root.querySelector<HTMLElement>('[data-arg-alt="nCr"]')?.click();
      press("5", "=");
      expect(result()).toBe("2,598,960");
    });

    it("reaches nPr through 2nd on the multiply key", () => {
      press("5", "2nd");
      root.querySelector<HTMLElement>('[data-arg-alt="nPr"]')?.click();
      press("2", "=");
      expect(result()).toBe("20");
    });

    it("reaches factorial through 2nd on the percent key", () => {
      press("5", "2nd");
      keyFor("percent").click();
      press("=");
      expect(result()).toBe("120");
    });

    it("types factorial from the keyboard", () => {
      type("5", "!", "Enter");
      expect(result()).toBe("120");
    });

    // The key used to route through insert(), which clears the buffer after
    // "=" -- so pressing it on an answer threw the answer away.
    it("applies the factorial key to the answer on screen", () => {
      press("5", "+", "3", "=");
      expect(result()).toBe("8");
      press("2nd");
      keyFor("percent").click();
      expect(expression()).toBe("8!");
      press("=");
      expect(result()).toBe("40,320");
    });

    it("applies a typed factorial to the answer too", () => {
      press("5", "+", "3", "=");
      type("!", "Enter");
      expect(result()).toBe("40,320");
    });

    it("reaches rand through 2nd on Ans", () => {
      press("2nd");
      keyFor("ans").click();
      const value = Number(expression());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });

    it("keeps a random value steady rather than re-rolling it", () => {
      press("2nd");
      keyFor("ans").click();
      const inserted = expression();
      press("+", "0", "=");
      expect(Number(result())).toBeCloseTo(Number(inserted), 6);
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
      const input = root.querySelector<HTMLInputElement>('[data-graph-input="0"]');
      const before = paths()[0]?.getAttribute("d");
      if (input) input.value = "x^3";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      expect(paths()[0]?.getAttribute("d")).not.toBe(before);
    });

    it("shows an error for an unparseable expression", () => {
      const input = root.querySelector<HTMLInputElement>('[data-graph-input="0"]');
      if (input) input.value = "x^^2";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      const error = root.querySelector<HTMLElement>("[data-graph-error]");
      expect(error?.hidden).toBe(false);
      expect(error?.textContent).not.toBe("");
    });

    it("breaks a discontinuous function into several paths", () => {
      const input = root.querySelector<HTMLInputElement>('[data-graph-input="0"]');
      if (input) input.value = "1/x";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      expect(paths().length).toBeGreaterThanOrEqual(2);
    });

    it("draws a second series in its own colour", () => {
      const second = root.querySelector<HTMLInputElement>('[data-graph-input="1"]');
      if (second) second.value = "x";
      second?.dispatchEvent(new Event("input", { bubbles: true }));

      expect(paths().length).toBeGreaterThan(1);
      expect(
        [...(svg()?.querySelectorAll('path[data-series="1"]') ?? [])].length
      ).toBeGreaterThan(0);
    });

    it("names the field an error came from", () => {
      const second = root.querySelector<HTMLInputElement>('[data-graph-input="1"]');
      if (second) second.value = "wobble(x)";
      second?.dispatchEvent(new Event("input", { bubbles: true }));

      const error = root.querySelector<HTMLElement>("[data-graph-error]");
      expect(error?.hidden).toBe(false);
      expect(error?.textContent).toContain("Y2:");
    });

    it("zooms in and out around the centre", () => {
      const min = root.querySelector<HTMLInputElement>("[data-graph-min]");
      const max = root.querySelector<HTMLInputElement>("[data-graph-max]");

      root.querySelector<HTMLElement>('[data-graph-zoom="in"]')?.click();
      expect(Number(min?.value)).toBeCloseTo(-5);
      expect(Number(max?.value)).toBeCloseTo(5);

      root.querySelector<HTMLElement>('[data-graph-zoom="out"]')?.click();
      expect(Number(min?.value)).toBeCloseTo(-10);

      root.querySelector<HTMLElement>('[data-graph-zoom="in"]')?.click();
      root.querySelector<HTMLElement>('[data-graph-zoom="reset"]')?.click();
      expect(Number(min?.value)).toBe(-10);
      expect(Number(max?.value)).toBe(10);
    });

    it("traces along the curve with the arrows", () => {
      const readout = () => root.querySelector("[data-graph-readout]")?.textContent ?? "";
      root.querySelector<HTMLElement>('[data-graph-step="1"]')?.click();
      expect(readout()).toContain("Y1");
      expect(readout()).toContain("x =");

      const first = readout();
      root.querySelector<HTMLElement>('[data-graph-step="1"]')?.click();
      expect(readout()).not.toBe(first);
    });

    it("finds a root", () => {
      // Y1 defaults to x^2-2, whose positive root is sqrt(2).
      root.querySelector<HTMLElement>('[data-graph-find="root"]')?.click();
      const readout = root.querySelector("[data-graph-readout]")?.textContent ?? "";
      expect(readout).toMatch(/x = -?1\.414/);
    });

    it("finds a turning point", () => {
      root.querySelector<HTMLElement>('[data-graph-find="min"]')?.click();
      const readout = root.querySelector("[data-graph-readout]")?.textContent ?? "";
      expect(readout).toContain("x = 0");
      expect(readout).toContain("y = -2");
    });

    it("finds where two curves cross", () => {
      const second = root.querySelector<HTMLInputElement>('[data-graph-input="1"]');
      if (second) second.value = "x";
      second?.dispatchEvent(new Event("input", { bubbles: true }));

      root.querySelector<HTMLElement>('[data-graph-find="intersect"]')?.click();
      const readout = root.querySelector("[data-graph-readout]")?.textContent ?? "";
      // x^2-2 meets x at -1 and at 2; the search reports the first in range.
      expect(readout).toMatch(/x = -1\b/);
      expect(readout).toMatch(/y = -1\b/);
    });

    it("keeps a root's y at zero across a redraw", () => {
      const readout = () => root.querySelector("[data-graph-readout]")?.textContent ?? "";
      root.querySelector<HTMLElement>('[data-graph-find="root"]')?.click();
      expect(readout()).toContain("y = 0");

      // Zooming redraws, and a redraw that re-evaluated the curve would put
      // the float residual (-4.4e-16) back where the answer was.
      root.querySelector<HTMLElement>('[data-graph-zoom="in"]')?.click();
      expect(readout()).toContain("y = 0");
    });

    it("drops a trace that the new range no longer shows", () => {
      const marker = () => root.querySelector("[data-graph-marker]");
      const readout = () => root.querySelector("[data-graph-readout]")?.textContent ?? "";

      // Step out to roughly x = 8.3, then halve the range to [-5, 5].
      for (let press = 0; press < 25; press += 1) {
        root.querySelector<HTMLElement>('[data-graph-step="1"]')?.click();
      }
      expect(readout()).toMatch(/x = [5-9]/);

      root.querySelector<HTMLElement>('[data-graph-zoom="in"]')?.click();
      expect(readout()).toBe("");
      expect(marker()?.getAttribute("visibility")).toBe("hidden");
    });

    it("blames the range, not a field, when the range is backwards", () => {
      const min = root.querySelector<HTMLInputElement>("[data-graph-min]");
      const max = root.querySelector<HTMLInputElement>("[data-graph-max]");
      if (min) min.value = "5";
      if (max) max.value = "1";
      max?.dispatchEvent(new Event("input", { bubbles: true }));

      const error = root.querySelector<HTMLElement>("[data-graph-error]");
      expect(error?.hidden).toBe(false);
      // Every series reports this one and none of them caused it, so naming
      // Y1 would point at the wrong field.
      expect(error?.textContent).not.toContain("Y1");
      expect(error?.textContent).toContain("x-max must be greater than x-min");
    });

    it("marks the traced series on the marker", () => {
      const second = root.querySelector<HTMLInputElement>('[data-graph-input="1"]');
      if (second) second.value = "x";
      second?.dispatchEvent(new Event("input", { bubbles: true }));

      root.querySelector<HTMLElement>('[data-graph-find="intersect"]')?.click();
      const marker = root.querySelector("[data-graph-marker]");
      expect(marker?.getAttribute("data-series")).toBe("0");
    });

    it("says so when there is nothing to search", () => {
      const first = root.querySelector<HTMLInputElement>('[data-graph-input="0"]');
      if (first) first.value = "";
      first?.dispatchEvent(new Event("input", { bubbles: true }));

      root.querySelector<HTMLElement>('[data-graph-find="root"]')?.click();
      expect(root.querySelector("[data-graph-readout]")?.textContent)
        .toBe("Nothing to search");
    });

    it("says so when there is only one curve to intersect", () => {
      root.querySelector<HTMLElement>('[data-graph-find="intersect"]')?.click();
      expect(root.querySelector("[data-graph-readout]")?.textContent)
        .toBe("Intersect needs two curves");
    });

    it("says so when there is no root in range", () => {
      const first = root.querySelector<HTMLInputElement>('[data-graph-input="0"]');
      if (first) first.value = "x^2+1";
      first?.dispatchEvent(new Event("input", { bubbles: true }));

      root.querySelector<HTMLElement>('[data-graph-find="root"]')?.click();
      expect(root.querySelector("[data-graph-readout]")?.textContent)
        .toBe("No root in this range");
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

  describe("table", () => {
    const rows = () => [...root.querySelectorAll("[data-table-body] tr")];
    const headers = () =>
      [...root.querySelectorAll("[data-table-head] th")].map((th) => th.textContent);
    const cells = (row: number) =>
      [...(rows()[row]?.querySelectorAll("th, td") ?? [])].map((cell) => cell.textContent);
    const setFunction = (index: number, text: string) => {
      const input = root.querySelector<HTMLInputElement>(`[data-graph-input="${index}"]`);
      if (input) input.value = text;
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    };

    beforeEach(() => {
      button("Table").click();
    });

    it("has a tab and a panel", () => {
      expect(root.querySelector('[data-panel="table"]')).not.toBeNull();
      expect(root.querySelector('[data-tab="table"]')).not.toBeNull();
    });

    it("tabulates the default function", () => {
      // Y1 defaults to x^2-2, from 0 in steps of 1.
      expect(headers()).toEqual(["x", "Y1"]);
      expect(cells(0)).toEqual(["0", "-2"]);
      expect(cells(1)).toEqual(["1", "-1"]);
      expect(cells(3)).toEqual(["3", "7"]);
    });

    it("shows the same functions as the graph, as they are typed", () => {
      setFunction(1, "2*x");
      expect(headers()).toEqual(["x", "Y1", "Y2"]);
      expect(cells(2)).toEqual(["2", "2", "4"]);
    });

    it("drops a column when its function is cleared", () => {
      setFunction(1, "2*x");
      expect(headers()).toHaveLength(3);
      setFunction(1, "");
      expect(headers()).toEqual(["x", "Y1"]);
    });

    it("says so when there is nothing to tabulate", () => {
      const empty = () => root.querySelector<HTMLElement>("[data-table-empty]");
      // Y1 has a function to begin with, so the message starts out of the way.
      expect(empty()?.hidden).toBe(true);

      setFunction(0, "");
      expect(empty()?.hidden).toBe(false);
      expect(rows()).toHaveLength(0);

      setFunction(0, "x");
      expect(empty()?.hidden).toBe(true);
    });

    it("follows the start and step", () => {
      const start = root.querySelector<HTMLInputElement>("[data-table-start]");
      const step = root.querySelector<HTMLInputElement>("[data-table-step]");
      if (start) start.value = "10";
      if (step) step.value = "0.5";
      step?.dispatchEvent(new Event("input", { bubbles: true }));

      expect(cells(0)?.[0]).toBe("10");
      expect(cells(1)?.[0]).toBe("10.5");
    });

    it("pages through the rows", () => {
      const firstX = cells(0)?.[0];
      root.querySelector<HTMLElement>('[data-table-page="1"]')?.click();
      expect(cells(0)?.[0]).not.toBe(firstX);

      root.querySelector<HTMLElement>('[data-table-page="-1"]')?.click();
      expect(cells(0)?.[0]).toBe(firstX);
    });

    it("goes back to the top when a function changes", () => {
      root.querySelector<HTMLElement>('[data-table-page="1"]')?.click();
      expect(cells(0)?.[0]).not.toBe("0");

      setFunction(0, "x+1");
      expect(cells(0)?.[0]).toBe("0");
    });

    it("refuses a step of zero rather than printing one row forever", () => {
      const step = root.querySelector<HTMLInputElement>("[data-table-step]");
      if (step) step.value = "0";
      step?.dispatchEvent(new Event("input", { bubbles: true }));

      expect(cells(0)?.[0]).not.toBe(cells(1)?.[0]);
    });

    it("marks a value the function has no answer for", () => {
      setFunction(0, "sqrt(x)");
      const start = root.querySelector<HTMLInputElement>("[data-table-start]");
      if (start) start.value = "-4";
      start?.dispatchEvent(new Event("input", { bubbles: true }));

      expect(cells(0)).toEqual(["-4", "—"]);
      expect(cells(4)).toEqual(["0", "0"]);
    });

    it("follows Ans when the keypad computes a new one", () => {
      setFunction(0, "Ans*x");
      press("5");
      press("=");

      // Ans is 5, so the row for x = 2 is 10. Before this, the table kept the
      // numbers it had worked out with whatever Ans used to be.
      expect(cells(2)).toEqual(["2", "10"]);
    });

    it("keeps x readable when the step is finer than the start", () => {
      const start = root.querySelector<HTMLInputElement>("[data-table-start]");
      const step = root.querySelector<HTMLInputElement>("[data-table-step]");
      if (start) start.value = "100000";
      if (step) step.value = "0.001";
      step?.dispatchEvent(new Event("input", { bubbles: true }));

      // Eight significant figures would round every one of these to "100000".
      expect(cells(0)?.[0]).toBe("100000");
      expect(cells(1)?.[0]).toBe("100000.001");
      expect(cells(2)?.[0]).toBe("100000.002");
    });

    it("keeps a tiny step tiny instead of jumping it to 1", () => {
      const step = root.querySelector<HTMLInputElement>("[data-table-step]");
      // Below the floor that stops a step of zero repeating one row forever.
      // A tiny step is how a limit gets looked at, so the floor is where it
      // lands -- substituting 1 would answer a different question in silence.
      if (step) step.value = "1e-10";
      step?.dispatchEvent(new Event("input", { bubbles: true }));

      expect(cells(1)?.[0]).toBe("1e-9");
      expect(cells(2)?.[0]).toBe("2e-9");
    });

    it("marks a function that will not parse", () => {
      setFunction(0, "wobble(x)");
      expect(cells(0)?.[1]).toBe("error");
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

    it("keeps Ans working after a reload", () => {
      press("5", "*", "7", "=");
      handle.destroy();

      document.body.innerHTML = MARKUP;
      root = document.body;
      handle = setupCalculator(root);

      // The history panel showed the result while Ans denied having one.
      keyFor("ans").click();
      press("+", "1", "=");
      expect(result()).toBe("36");
    });

    it("keeps the recall arrows working after a reload", () => {
      press("1", "2", "*", "2", "=");
      handle.destroy();

      document.body.innerHTML = MARKUP;
      root = document.body;
      handle = setupCalculator(root);

      keyFor("recall-previous").click();
      expect(expression()).toBe("12 * 2");
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
    it("stops the keypad listener too", () => {
      // Re-setup on the *same* markup: without removal both instances would
      // respond to every key, and the dead one would persist stale state.
      const dead = handle.calculator;
      handle.destroy();

      const live = setupCalculator(root);
      press("5");

      expect(live.calculator.expression).toBe("5");
      // The point of the test: the destroyed instance must not have reacted.
      expect(dead.expression).toBe("");

      live.destroy();
      handle = setupCalculator(root);
    });

    it("stops the panel listeners too", () => {
      // destroy() used to leave the theme toggle, tabs and Clear attached, so
      // a dead instance kept persisting its own state.
      press("1", "+", "1", "=");
      const dead = handle.calculator;
      handle.destroy();

      root.querySelector<HTMLElement>("[data-history-clear]")?.click();
      expect(dead.history).toHaveLength(1);

      const themeBefore = document.documentElement.dataset["theme"];
      root.querySelector<HTMLElement>("[data-theme-toggle]")?.click();
      expect(document.documentElement.dataset["theme"]).toBe(themeBefore);

      handle = setupCalculator(root);
    });

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
