import type { SeriesEntry } from "@/interfaces/series-entry.ts";

/** How many functions the calculator holds, as Y1 to Y4. */
export const SERIES_COUNT = 4;

/**
 * The four Y expressions.
 *
 * The graph and the table are two views of the same functions: typing `sin(x)`
 * into Y2 has to reach both. Holding the text here rather than in either
 * panel's inputs is what lets the second view exist at all without reading the
 * first one's DOM, and lets the whole thing be tested without a browser.
 */
export class FunctionSeries {
  readonly #expressions: string[];
  readonly #listeners: (() => void)[] = [];

  constructor(initial: readonly string[] = []) {
    this.#expressions = Array.from(
      { length: SERIES_COUNT },
      (_, index) => initial[index]?.trim() ?? ""
    );
  }

  /** The expression for one series, or "" for an index that has none. */
  at(index: number): string {
    return this.#expressions[index] ?? "";
  }

  /** Every expression, including the empty ones, in Y order. */
  all(): readonly string[] {
    return [...this.#expressions];
  }

  /** Only the series with something in them, each knowing its own number. */
  active(): readonly SeriesEntry[] {
    return this.#expressions
      .map((expression, index) => ({ index, expression }))
      .filter((entry) => entry.expression !== "");
  }

  /**
   * Replace one expression, telling the views only when it really changed.
   *
   * Every keystroke in a field fires an input event, and a redraw of a plot
   * and a table is not free; re-running them for a value that is the same as
   * it was is work nobody asked for.
   */
  set(index: number, text: string): void {
    if (index < 0 || index >= SERIES_COUNT) return;
    const trimmed = text.trim();
    if (this.#expressions[index] === trimmed) return;

    this.#expressions[index] = trimmed;
    for (const listener of this.#listeners) listener();
  }

  /**
   * Run `listener` whenever any expression changes, until `signal` aborts.
   *
   * The signal is not optional. Every other listener in the UI is registered
   * against the one controller so tearing down is a single abort; a
   * subscription here that outlived it would hold a destroyed panel's render
   * closure, and with it the markup that panel was drawing into.
   */
  onChange(listener: () => void, signal: AbortSignal): void {
    if (signal.aborted) return;
    this.#listeners.push(listener);

    signal.addEventListener("abort", () => {
      const at = this.#listeners.indexOf(listener);
      if (at !== -1) this.#listeners.splice(at, 1);
    }, { once: true });
  }
}
