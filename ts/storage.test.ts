import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState } from "@/storage.ts";
import type { PersistedState } from "@/interfaces/persisted-state.ts";

/**
 * A complete state, for tests that care about one field of it.
 *
 * Spelled out in one place so that adding a field to PersistedState is one
 * edit here rather than a compile error in every fixture below.
 */
const EMPTY: PersistedState = {
  history: [],
  memory: 0,
  theme: "light",
  angleMode: "rad",
  lastAnswer: null,
  entries: [],
  registers: {},
  lists: [],
  matrices: {},
};

/** A minimal in-memory Storage, so these tests need no browser. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

/** A Storage that throws on every access, as a locked-down browser does. */
function hostileStorage(): Storage {
  const boom = (): never => { throw new Error("denied"); };
  return {
    get length(): number { return boom(); },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  };
}

describe("storage", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("round-trips state", () => {
    saveState(
      {
        history: [{ expression: "1 + 1", result: "2", recall: "2" }],
        memory: 7,
        theme: "dark",
        angleMode: "deg",
        lastAnswer: 35,
        entries: ["1+1"],
        registers: { A: 12 },
        lists: [{ L1: 1, L2: 2 }],
        matrices: { A: [[1, 2], [3, 4]] },
      },
      storage
    );
    expect(loadState(storage)).toEqual({
      history: [{ expression: "1 + 1", result: "2", recall: "2" }],
      memory: 7,
      theme: "dark",
      angleMode: "deg",
      lastAnswer: 35,
      entries: ["1+1"],
      registers: { A: 12 },
      lists: [{ L1: 1, L2: 2 }],
      matrices: { A: [[1, 2], [3, 4]] },
    });
  });

  it("round-trips a null last answer", () => {
    saveState(
      EMPTY,
      storage
    );
    expect(loadState(storage).lastAnswer).toBeNull();
  });

  it("returns nothing when there is nothing saved", () => {
    expect(loadState(storage)).toEqual({});
  });

  describe("malformed data", () => {
    it("ignores invalid JSON", () => {
      expect(loadState(memoryStorage({ "calculator-fun.state": "{oh no" }))).toEqual({});
    });

    it("ignores a non-object", () => {
      expect(loadState(memoryStorage({ "calculator-fun.state": '"hello"' }))).toEqual({});
    });

    it("reads a broken list cell as an empty one", () => {
      // A cell corrupted in place, or written by a version that stored
      // something else, should cost that cell and not the whole list.
      const raw = JSON.stringify({
        lists: [{ L1: 1, L2: "two" }, { L1: null, L2: 4 }, 42],
      });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).lists)
        .toEqual([{ L1: 1, L2: null }, { L1: null, L2: 4 }]);
    });

    it("reads a non-finite list cell as an empty one", () => {
      // JSON has no Infinity, so it arrives as null already; NaN does not
      // survive the round trip either. A string "Infinity" might.
      const raw = JSON.stringify({ lists: [{ L1: "Infinity", L2: 3 }] });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).lists)
        .toEqual([{ L1: null, L2: 3 }]);
    });

    it("reads a broken matrix cell as a zero", () => {
      const raw = JSON.stringify({
        matrices: { A: [[1, "two"], [3, 4]], B: "not a grid" },
      });
      const loaded = loadState(memoryStorage({ "calculator-fun.state": raw }));
      expect(loaded.matrices?.A).toEqual([[1, 0], [3, 4]]);
      expect(loaded.matrices?.B).toBeUndefined();
    });

    it("drops matrix rows that are not rows", () => {
      const raw = JSON.stringify({ matrices: { A: [[1, 2], 42, [3, 4]] } });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).matrices?.A)
        .toEqual([[1, 2], [3, 4]]);
    });

    it("drops history entries of the wrong shape", () => {
      const raw = JSON.stringify({ history: [{ expression: "1+1", result: "2" }, 42, {}] });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).history)
        .toEqual([{ expression: "1+1", result: "2", recall: "2" }]);
    });

    // Entries saved before the recall field existed still work.
    it("fills in a missing recall value from the result", () => {
      const raw = JSON.stringify({ history: [{ expression: "\u221a8", result: "2\u221a2" }] });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).history?.[0]?.recall)
        .toBe("2\u221a2");
    });

    it("ignores a non-numeric memory", () => {
      const raw = JSON.stringify({ memory: "lots" });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).memory).toBeUndefined();
    });

    it("ignores an infinite memory", () => {
      const raw = JSON.stringify({ memory: null });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).memory).toBeUndefined();
    });

    it("ignores an unknown theme", () => {
      const raw = JSON.stringify({ theme: "neon" });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).theme).toBeUndefined();
    });

    it("ignores a non-numeric last answer", () => {
      const raw = JSON.stringify({ lastAnswer: "lots" });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).lastAnswer).toBeUndefined();
    });

    it("drops non-string entries", () => {
      const raw = JSON.stringify({ entries: ["1+1", 42, null, "2*2"] });
      expect(loadState(memoryStorage({ "calculator-fun.state": raw })).entries)
        .toEqual(["1+1", "2*2"]);
    });
  });

  describe("when storage is unavailable", () => {
    it("loads as empty rather than throwing", () => {
      expect(() => loadState(hostileStorage())).not.toThrow();
      expect(loadState(hostileStorage())).toEqual({});
    });

    it("saves without throwing", () => {
      expect(() =>
        saveState(
          EMPTY,
          hostileStorage()
        )
      ).not.toThrow();
    });

    it("treats a null storage as absent", () => {
      expect(loadState(null)).toEqual({});
      expect(() =>
        saveState(
          EMPTY,
          null
        )
      ).not.toThrow();
    });
  });
});
