// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupCalculator } from "./index.js";

/** The same button layout as index.html, minus the styling. */
const MARKUP = `
  <div class="calculator-grid">
    <div class="output">
      <div data-previous-operand class="previous-operand"></div>
      <div data-current-operand class="current-operand"></div>
    </div>
    <button data-all-clear>AC</button>
    <button data-delete>DEL</button>
    <button data-operation>÷</button>
    <button data-number>1</button>
    <button data-number>2</button>
    <button data-number>3</button>
    <button data-operation>*</button>
    <button data-number>4</button>
    <button data-number>5</button>
    <button data-number>6</button>
    <button data-operation>+</button>
    <button data-number>7</button>
    <button data-number>8</button>
    <button data-number>9</button>
    <button data-operation>-</button>
    <button data-number>.</button>
    <button data-number>0</button>
    <button data-equals>=</button>
  </div>
`;

describe("setupCalculator", () => {
  let root: HTMLElement;
  let onError: ReturnType<typeof vi.fn>;

  /** Click the button whose label is `label`, as a user would. */
  function press(...labels: string[]): void {
    for (const label of labels) {
      const button = [...root.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === label
      );
      if (!button) throw new Error(`No button labelled "${label}"`);
      button.click();
    }
  }

  const current = () =>
    root.querySelector("[data-current-operand]")?.textContent;
  const previous = () =>
    root.querySelector("[data-previous-operand]")?.textContent;

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
    root = document.body;
    onError = vi.fn();
    setupCalculator(root, { onError });
  });

  it("starts with a blank display", () => {
    expect(current()).toBe("");
    expect(previous()).toBe("");
  });

  it("shows digits as they are pressed", () => {
    press("1", "2", "3");
    expect(current()).toBe("123");
  });

  it("groups thousands in the display", () => {
    press("1", "0", "0", "0");
    expect(current()).toBe("1,000");
  });

  it("shows the pending operation on the previous line", () => {
    press("1", "2", "+");
    expect(previous()).toBe("12 +");
    expect(current()).toBe("");
  });

  it("computes a sum when = is pressed", () => {
    press("1", "2", "+", "3", "=");
    expect(current()).toBe("15");
    expect(previous()).toBe("");
  });

  it("wires up every operator button", () => {
    press("8", "÷", "2", "=");
    expect(current()).toBe("4");
    press("*", "3", "=");
    expect(current()).toBe("12");
    press("-", "2", "=");
    expect(current()).toBe("10");
    press("+", "5", "=");
    expect(current()).toBe("15");
  });

  it("wires up DEL", () => {
    press("1", "2", "3", "DEL");
    expect(current()).toBe("12");
  });

  it("wires up AC", () => {
    press("1", "2", "+", "3", "AC");
    expect(current()).toBe("");
    expect(previous()).toBe("");
  });

  it("reports a division by zero through onError", () => {
    press("5", "÷", "0", "=");
    expect(onError).toHaveBeenCalledWith("Cannot divide by zero.");
  });

  it("does not report anything during a normal sum", () => {
    press("5", "÷", "2", "=");
    expect(onError).not.toHaveBeenCalled();
  });

  it("throws when the display elements are missing", () => {
    document.body.innerHTML = `<div class="calculator-grid"></div>`;
    expect(() => setupCalculator(document.body)).toThrow(
      /missing \[data-previous-operand\]/
    );
  });
});
