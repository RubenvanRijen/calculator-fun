import type { Matrix } from "@/types/matrix.ts";
import type { MatrixName } from "@/types/matrix-name.ts";

/** Both matrices, in the order they are shown. */
export const MATRIX_NAMES: readonly MatrixName[] = ["A", "B"];

/** The largest grid the panel offers, which is what fits in the panel. */
export const MAX_SIZE = 4;

/** What a fresh matrix is: the 2 by 2 of zeros. */
const DEFAULT_SIZE = 2;

function blank(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIZE;
  return Math.min(Math.max(Math.round(value), 1), MAX_SIZE);
}

/**
 * The two matrices behind the Matrix tab.
 *
 * Separate from the arithmetic in `matrix.ts`, which knows nothing about
 * storage, and from the panel, which knows nothing about how a grid is kept.
 */
export class MatrixStore {
  readonly #grids: Record<MatrixName, number[][]>;
  readonly #listeners: (() => void)[] = [];

  constructor(saved: Partial<Record<MatrixName, Matrix>> = {}) {
    this.#grids = {
      A: MatrixStore.#adopt(saved.A),
      B: MatrixStore.#adopt(saved.B),
    };
  }

  /** Take a saved grid if it is usable, and a blank one if it is not. */
  static #adopt(grid: Matrix | undefined): number[][] {
    if (grid === undefined || grid.length === 0) return blank(DEFAULT_SIZE, DEFAULT_SIZE);

    const rows = clamp(grid.length);
    const columns = clamp(grid[0]?.length ?? DEFAULT_SIZE);
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => {
        const value = grid[row]?.[column];
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
      })
    );
  }

  get(name: MatrixName): Matrix {
    return this.#grids[name].map((row) => [...row]);
  }

  size(name: MatrixName): { rows: number; columns: number } {
    const grid = this.#grids[name];
    return { rows: grid.length, columns: grid[0]?.length ?? 0 };
  }

  /**
   * Change the shape, keeping whatever still fits.
   *
   * Growing a matrix should not clear the numbers already typed into it, and
   * shrinking then growing back is a mistake worth being able to undo by
   * hand rather than a reason to retype everything.
   */
  resize(name: MatrixName, rows: number, columns: number): void {
    const wanted = { rows: clamp(rows), columns: clamp(columns) };
    const current = this.size(name);
    if (wanted.rows === current.rows && wanted.columns === current.columns) return;

    const old = this.#grids[name];
    this.#grids[name] = Array.from({ length: wanted.rows }, (_, row) =>
      Array.from({ length: wanted.columns }, (_, column) => old[row]?.[column] ?? 0)
    );
    this.#notify();
  }

  /** Put a number in one cell. Anything that is not one reads as zero. */
  set(name: MatrixName, row: number, column: number, value: number): void {
    const target = this.#grids[name][row];
    if (target === undefined || column < 0 || column >= target.length) return;

    const cleaned = Number.isFinite(value) ? value : 0;
    if (target[column] === cleaned) return;

    target[column] = cleaned;
    this.#notify();
  }

  /** Run `listener` whenever either matrix changes, until `signal` aborts. */
  onChange(listener: () => void, signal: AbortSignal): void {
    if (signal.aborted) return;
    this.#listeners.push(listener);

    signal.addEventListener("abort", () => {
      const at = this.#listeners.indexOf(listener);
      if (at !== -1) this.#listeners.splice(at, 1);
    }, { once: true });
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
