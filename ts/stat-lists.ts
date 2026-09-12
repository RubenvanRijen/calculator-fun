import type { ListName } from "@/types/list-name.ts";
import { Listeners } from "@/listeners.ts";
import type { StatRow } from "@/interfaces/stat-row.ts";
import type { PlotPoint } from "@/interfaces/plot-point.ts";

/** How many empty rows a fresh editor offers. */
export const STARTING_ROWS = 8;

/** Both lists, in the order they are shown. */
export const LIST_NAMES: readonly ListName[] = ["L1", "L2"];

/**
 * The data behind the Stats tab: two columns of numbers, edited as rows.
 *
 * Rows rather than two independent lists, because that is what the editor
 * shows and what a regression needs -- an x with no y is not a point, and
 * pairing two lists of different lengths after the fact is guesswork.
 */
export class StatLists {
  #rows: { L1: number | null; L2: number | null }[];
  readonly #listeners = new Listeners();

  constructor(rows: readonly StatRow[] = []) {
    this.#rows = rows.map((row) => ({ L1: row.L1, L2: row.L2 }));
    while (this.#rows.length < STARTING_ROWS) this.#rows.push({ L1: null, L2: null });
  }

  get rowCount(): number {
    return this.#rows.length;
  }

  rows(): readonly StatRow[] {
    return this.#rows.map((row) => ({ L1: row.L1, L2: row.L2 }));
  }

  /** One column's numbers, with the empty cells left out. */
  column(name: ListName): readonly number[] {
    return this.#rows
      .map((row) => row[name])
      .filter((value): value is number => value !== null);
  }

  /** Only the rows with both values, which are the points a line can fit. */
  pairs(): readonly PlotPoint[] {
    return this.#rows
      .filter((row) => row.L1 !== null && row.L2 !== null)
      .map((row) => ({ x: row.L1 as number, y: row.L2 as number }));
  }

  /**
   * Put a value in one cell, or clear it with null.
   *
   * A value that is not a finite number clears the cell instead: half-typed
   * text like "-" or "1e" should not be counted as data, and should not throw
   * the whole summary away either.
   */
  set(name: ListName, index: number, value: number | null): void {
    const row = this.#rows[index];
    if (row === undefined) return;

    const cleaned = value !== null && Number.isFinite(value) ? value : null;
    if (row[name] === cleaned) return;

    row[name] = cleaned;
    this.#listeners.notify();
  }

  /** Add an empty row at the bottom, for data that outgrew the editor. */
  addRow(): void {
    this.#rows.push({ L1: null, L2: null });
    this.#listeners.notify();
  }

  /** Empty every cell, keeping the editor the size it was. */
  clear(): void {
    if (this.#rows.every((row) => row.L1 === null && row.L2 === null)) return;
    this.#rows = this.#rows.map(() => ({ L1: null, L2: null }));
    this.#listeners.notify();
  }

  /** Run `listener` whenever the data changes, until `signal` aborts. */
  onChange(listener: () => void, signal: AbortSignal): void {
    this.#listeners.add(listener, signal);
  }
}
