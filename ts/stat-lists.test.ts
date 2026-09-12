import { describe, it, expect, vi } from "vitest";
import { StatLists, STARTING_ROWS } from "@/stat-lists.ts";

describe("StatLists", () => {
  it("starts with empty rows to type into", () => {
    const lists = new StatLists();
    expect(lists.rowCount).toBe(STARTING_ROWS);
    expect(lists.column("L1")).toEqual([]);
    expect(lists.pairs()).toEqual([]);
  });

  it("takes rows it is given and pads out to the starting size", () => {
    const lists = new StatLists([{ L1: 1, L2: 2 }]);
    expect(lists.rowCount).toBe(STARTING_ROWS);
    expect(lists.column("L1")).toEqual([1]);
  });

  it("keeps more rows than it starts with", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ L1: index, L2: null }));
    expect(new StatLists(many).rowCount).toBe(12);
  });

  it("leaves empty cells out of a column", () => {
    const lists = new StatLists();
    lists.set("L1", 0, 5);
    lists.set("L1", 3, 7);
    expect(lists.column("L1")).toEqual([5, 7]);
  });

  it("pairs only the rows that have both values", () => {
    const lists = new StatLists();
    lists.set("L1", 0, 1);
    lists.set("L2", 0, 10);
    lists.set("L1", 1, 2);
    // Row 1 has no L2, so it is not a point.
    expect(lists.pairs()).toEqual([{ x: 1, y: 10 }]);
  });

  it("treats a missing value as missing, not as zero", () => {
    // Counting the empty L2 as 0 would drag a regression towards the origin.
    const lists = new StatLists();
    lists.set("L1", 0, 4);
    expect(lists.column("L2")).toEqual([]);
    expect(lists.pairs()).toEqual([]);
  });

  it("clears a cell with null", () => {
    const lists = new StatLists();
    lists.set("L1", 0, 9);
    lists.set("L1", 0, null);
    expect(lists.column("L1")).toEqual([]);
  });

  it("refuses a value that is not a finite number", () => {
    // Half-typed text is not data, and must not throw the summary away.
    const lists = new StatLists();
    lists.set("L1", 0, NaN);
    lists.set("L1", 1, Infinity);
    expect(lists.column("L1")).toEqual([]);
  });

  it("ignores a row it does not have", () => {
    const lists = new StatLists();
    expect(() => lists.set("L1", 99, 1)).not.toThrow();
    expect(lists.column("L1")).toEqual([]);
  });

  it("adds a row", () => {
    const lists = new StatLists();
    lists.addRow();
    expect(lists.rowCount).toBe(STARTING_ROWS + 1);
  });

  it("clears every cell but keeps the rows", () => {
    const lists = new StatLists();
    lists.set("L1", 0, 1);
    lists.set("L2", 0, 2);
    lists.addRow();

    lists.clear();
    expect(lists.column("L1")).toEqual([]);
    expect(lists.column("L2")).toEqual([]);
    expect(lists.rowCount).toBe(STARTING_ROWS + 1);
  });

  it("hands out copies, so a caller cannot rewrite the data", () => {
    const lists = new StatLists([{ L1: 1, L2: 2 }]);
    const rows = lists.rows() as { L1: number | null; L2: number | null }[];
    const first = rows[0];
    if (first) first.L1 = 99;
    expect(lists.column("L1")).toEqual([1]);
  });

  describe("notifications", () => {
    const listening = () => {
      const lists = new StatLists();
      const listener = vi.fn();
      const listeners = new AbortController();
      lists.onChange(listener, listeners.signal);
      return { lists, listener, listeners };
    };

    it("tells listeners when a value changes", () => {
      const { lists, listener } = listening();
      lists.set("L1", 0, 1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stays quiet when the value is the one it already had", () => {
      const { lists, listener } = listening();
      lists.set("L1", 0, 1);
      lists.set("L1", 0, 1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stays quiet clearing what is already empty", () => {
      const { lists, listener } = listening();
      lists.clear();
      expect(listener).not.toHaveBeenCalled();
    });

    it("tells listeners about a new row", () => {
      const { lists, listener } = listening();
      lists.addRow();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("stops once its signal aborts", () => {
      const { lists, listener, listeners } = listening();
      listeners.abort();
      lists.set("L1", 0, 1);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
