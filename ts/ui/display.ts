import { queryIn } from "@/ui/query.ts";
import type { Calculator } from "@/calculator.ts";

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
  readonly #exact: HTMLElement | null;

  constructor(root: Document | HTMLElement) {
    const query = queryIn(root);

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
    this.#exact = query("[data-exact-indicator]");
  }

  render(calculator: Calculator): void {
    this.#renderExpression(calculator);
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
    if (this.#exact) {
      this.#exact.hidden = !calculator.isShowingExact;
    }
    if (this.#paren) {
      const open = calculator.openParenCount;
      this.#paren.hidden = open === 0;
      this.#paren.textContent = `( ${open}`;
    }
  }

  /**
   * The caret is an empty element between two text nodes, so the element's
   * textContent stays exactly the expression -- nothing reading the display
   * has to know the caret is there.
   */
  #renderExpression(calculator: Calculator): void {
    const text = calculator.expressionDisplay;
    const at = calculator.displayCursor;

    if (at === null) {
      this.#expression.textContent = text;
      return;
    }

    const doc = this.#expression.ownerDocument;
    const caret = doc.createElement("span");
    caret.className = "caret";
    caret.setAttribute("data-caret", "");

    this.#expression.replaceChildren(
      doc.createTextNode(text.slice(0, at)),
      caret,
      doc.createTextNode(text.slice(at))
    );
  }
}
