import type { Calculator } from "../calculator.js";

/**
 * The output area: the expression line, the result line, and the three badges.
 * Reads the calculator, writes the DOM, decides nothing.
 */
export class Display {
  readonly #expression: HTMLElement;
  readonly #result: HTMLElement;
  readonly #error: HTMLElement | null;
  readonly #memory: HTMLElement | null;
  readonly #paren: HTMLElement | null;
  readonly #angle: HTMLElement | null;

  constructor(root: Document | HTMLElement) {
    const query = <T extends HTMLElement>(selector: string): T | null =>
      root.querySelector<T>(selector);

    const expression = query("[data-expression]");
    const result = query("[data-result]");

    // strictNullChecks makes these `HTMLElement | null`, so the missing-markup
    // case has to be dealt with rather than blowing up later on `.textContent`.
    if (!expression || !result) {
      throw new Error(
        "Calculator markup is missing [data-expression] or [data-result]."
      );
    }

    this.#expression = expression;
    this.#result = result;
    this.#error = query("[data-error]");
    this.#memory = query("[data-memory-indicator]");
    this.#paren = query("[data-paren-indicator]");
    this.#angle = query("[data-angle-indicator]");
  }

  render(calculator: Calculator): void {
    this.#expression.textContent = calculator.expressionDisplay;
    this.#result.textContent = calculator.resultDisplay;

    if (this.#error) {
      this.#error.textContent = calculator.error ?? "";
      this.#error.hidden = calculator.error === null;
    }
    if (this.#memory) {
      this.#memory.hidden = !calculator.hasMemory;
    }
    if (this.#angle) {
      this.#angle.textContent = calculator.angleMode.toUpperCase();
    }
    if (this.#paren) {
      const open = calculator.openParenCount;
      this.#paren.hidden = open === 0;
      this.#paren.textContent = `( ${open}`;
    }
  }
}
