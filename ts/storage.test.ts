import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, clearState } from "@/storage.ts";

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
    });
  });

  it("round-trips a null last answer", () => {
    saveState(
      { history: [], memory: 0, theme: "light", angleMode: "rad", lastAnswer: null, entries: [] },
      storage
    );
    expect(loadState(storage).lastAnswer).toBeNull();
  });

  it("returns nothing when there is nothing saved", () => {
    expect(loadState(storage)).toEqual({});
  });

  it("clears", () => {
    saveState(
      { history: [], memory: 1, theme: "light", angleMode: "rad", lastAnswer: null, entries: [] },
      storage
    );
    clearState(storage);
    expect(loadState(storage)).toEqual({});
  });

  describe("malformed data", () => {
    it("ignores invalid JSON", () => {
      expect(loadState(memoryStorage({ "calculator-fun.state": "{oh no" }))).toEqual({});
    });

    it("ignores a non-object", () => {
      expect(loadState(memoryStorage({ "calculator-fun.state": '"hello"' }))).toEqual({});
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
          { history: [], memory: 0, theme: "light", angleMode: "rad", lastAnswer: null, entries: [] },
          hostileStorage()
        )
      ).not.toThrow();
    });

    it("clears without throwing", () => {
      expect(() => clearState(hostileStorage())).not.toThrow();
    });

    it("treats a null storage as absent", () => {
      expect(loadState(null)).toEqual({});
      expect(() =>
        saveState(
          { history: [], memory: 0, theme: "light", angleMode: "rad", lastAnswer: null, entries: [] },
          null
        )
      ).not.toThrow();
    });
  });
});
