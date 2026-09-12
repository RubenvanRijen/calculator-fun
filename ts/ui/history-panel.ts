import type { Calculator } from "@/calculator.ts";
import type { HistoryEntry } from "@/interfaces/history-entry.ts";

/**
 * The list of past calculations. Re-rendered wholesale on every update, which
 * is cheap at fifty entries and keeps the DOM a pure function of the log.
 */
export class HistoryPanel {
  readonly #list: HTMLElement | null;
  readonly #empty: HTMLElement | null;
  readonly #doc: Document;
  readonly #signal: AbortSignal;
  readonly #onRecall: (value: string) => void;

  constructor(
    root: Document | HTMLElement,
    doc: Document,
    signal: AbortSignal,
    onRecall: (value: string) => void
  ) {
    this.#list = root.querySelector<HTMLElement>("[data-history-list]");
    this.#empty = root.querySelector<HTMLElement>("[data-history-empty]");
    this.#doc = doc;
    this.#signal = signal;
    this.#onRecall = onRecall;
  }

  render(calculator: Calculator): void {
    if (!this.#list) return;
    const entries = calculator.history;
    if (this.#empty) this.#empty.hidden = entries.length > 0;
    this.#list.replaceChildren(...entries.map((entry) => this.#renderEntry(entry)));
  }

  #renderEntry(entry: HistoryEntry): HTMLElement {
    const item = this.#doc.createElement("li");

    // A button, not a bare <li>, so the entry is reachable by keyboard too.
    const button = this.#doc.createElement("button");
    button.type = "button";
    button.className = "history-entry";

    const expression = this.#doc.createElement("span");
    expression.className = "history-expression";
    expression.textContent = entry.expression;

    const result = this.#doc.createElement("span");
    result.className = "history-result";
    result.textContent = entry.result;

    button.append(expression, result);
    button.addEventListener("click", () => this.#onRecall(entry.result), {
      signal: this.#signal,
    });

    item.append(button);
    return item;
  }
}
