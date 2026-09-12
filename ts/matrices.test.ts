import { describe, it, expect, vi } from "vitest";
import { MatrixStore, MAX_SIZE } from "@/matrices.ts";

describe("MatrixStore", () => {
  it("starts with two 2 by 2 matrices of zeros", () => {
    const store = new MatrixStore();
    expect(store.size("A")).toEqual({ rows: 2, columns: 2 });
    expect(store.get("B")).toEqual([[0, 0], [0, 0]]);
  });

  it("takes matrices it is given", () => {
    const store = new MatrixStore({ A: [[1, 2, 3], [4, 5, 6]] });
    expect(store.get("A")).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(store.size("A")).toEqual({ rows: 2, columns: 3 });
  });

  it("reads a saved cell that is not a number as a zero", () => {
    const store = new MatrixStore({ A: [[1, Number.NaN], [3, Infinity]] });
    expect(store.get("A")).toEqual([[1, 0], [3, 0]]);
  });

  it("clamps a saved matrix that is bigger than the panel offers", () => {
    const huge = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 1));
    expect(new MatrixStore({ A: huge }).size("A"))
      .toEqual({ rows: MAX_SIZE, columns: MAX_SIZE });
  });

  it("sets a cell", () => {
    const store = new MatrixStore();
    store.set("A", 0, 1, 7);
    expect(store.get("A")).toEqual([[0, 7], [0, 0]]);
  });

  it("ignores a cell it does not have", () => {
    const store = new MatrixStore();
    expect(() => store.set("A", 9, 9, 1)).not.toThrow();
    expect(store.get("A")).toEqual([[0, 0], [0, 0]]);
  });

  it("reads a value that is not a number as a zero", () => {
    const store = new MatrixStore();
    store.set("A", 0, 0, 5);
    store.set("A", 0, 0, Number.NaN);
    expect(store.get("A")[0]?.[0]).toBe(0);
  });

  it("keeps what still fits when it grows", () => {
    const store = new MatrixStore({ A: [[1, 2], [3, 4]] });
    store.resize("A", 3, 3);
    expect(store.get("A")).toEqual([[1, 2, 0], [3, 4, 0], [0, 0, 0]]);
  });

  it("keeps what still fits when it shrinks", () => {
    const store = new MatrixStore({ A: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] });
    store.resize("A", 2, 2);
    expect(store.get("A")).toEqual([[1, 2], [4, 5]]);
  });

  it("will not go below one or above the panel's limit", () => {
    const store = new MatrixStore();
    store.resize("A", 0, 99);
    expect(store.size("A")).toEqual({ rows: 1, columns: MAX_SIZE });
  });

  it("hands out copies, so a caller cannot rewrite the grid", () => {
    const store = new MatrixStore({ A: [[1, 2], [3, 4]] });
    const grid = store.get("A") as number[][];
    const row = grid[0];
    if (row) row[0] = 99;
    expect(store.get("A")[0]?.[0]).toBe(1);
  });

  it("keeps the two matrices apart", () => {
    const store = new MatrixStore();
    store.set("A", 0, 0, 5);
    expect(store.get("B")[0]?.[0]).toBe(0);
  });

  describe("notifications", () => {
    const listening = () => {
      const store = new MatrixStore();
      const listener = vi.fn();
      const listeners = new AbortController();
      store.onChange(listener, listeners.signal);
      return { store, listener, listeners };
    };

    it("tells listeners about a value", () => {
      const { store, listener } = listening();
      store.set("A", 0, 0, 1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stays quiet when the value is the one it already had", () => {
      const { store, listener } = listening();
      store.set("A", 0, 0, 0);
      expect(listener).not.toHaveBeenCalled();
    });

    it("tells listeners about a resize", () => {
      const { store, listener } = listening();
      store.resize("A", 3, 3);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stays quiet resizing to the size it already is", () => {
      const { store, listener } = listening();
      store.resize("A", 2, 2);
      expect(listener).not.toHaveBeenCalled();
    });

    it("stops once its signal aborts", () => {
      const { store, listener, listeners } = listening();
      listeners.abort();
      store.set("A", 0, 0, 1);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
