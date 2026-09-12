import { describe, it, expect, vi } from "vitest";
import { FunctionSeries, SERIES_COUNT } from "@/function-series.ts";

describe("FunctionSeries", () => {
  it("holds four functions, empty by default", () => {
    const series = new FunctionSeries();
    expect(series.all()).toHaveLength(SERIES_COUNT);
    expect(series.all().every((expression) => expression === "")).toBe(true);
  });

  it("takes initial values and ignores any past the fourth", () => {
    const series = new FunctionSeries(["x", "2x", "", "", "ignored"]);
    expect(series.all()).toEqual(["x", "2x", "", ""]);
  });

  it("trims what it is given", () => {
    const series = new FunctionSeries(["  x + 1  "]);
    expect(series.at(0)).toBe("x + 1");
    series.set(1, "  sin(x) ");
    expect(series.at(1)).toBe("sin(x)");
  });

  it("reads an index it does not have as empty", () => {
    expect(new FunctionSeries().at(9)).toBe("");
  });

  it("lists only the series with something in them", () => {
    const series = new FunctionSeries(["", "sin(x)", "", "x^2"]);
    expect(series.active()).toEqual([
      { index: 1, expression: "sin(x)" },
      { index: 3, expression: "x^2" },
    ]);
  });

  it("tells listeners when an expression changes", () => {
    const series = new FunctionSeries();
    const listener = vi.fn();
    series.onChange(listener, new AbortController().signal);

    series.set(0, "x");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the value is the one it already had", () => {
    // Every keystroke fires an input event, and a redraw of a plot and a
    // table is not free.
    const series = new FunctionSeries(["x"]);
    const listener = vi.fn();
    series.onChange(listener, new AbortController().signal);

    series.set(0, "x");
    series.set(0, "  x  ");
    expect(listener).not.toHaveBeenCalled();
  });

  it("refuses an index outside the four", () => {
    const series = new FunctionSeries();
    const listener = vi.fn();
    series.onChange(listener, new AbortController().signal);

    series.set(-1, "x");
    series.set(SERIES_COUNT, "x");
    expect(listener).not.toHaveBeenCalled();
    expect(series.active()).toEqual([]);
  });

  it("stops telling a listener once its signal aborts", () => {
    // Panels are torn down by aborting one controller. A subscription that
    // survived it would keep a destroyed panel drawing into dead markup.
    const series = new FunctionSeries();
    const listener = vi.fn();
    const listeners = new AbortController();
    series.onChange(listener, listeners.signal);

    series.set(0, "x");
    expect(listener).toHaveBeenCalledTimes(1);

    listeners.abort();
    series.set(0, "2x");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores a listener whose signal has already aborted", () => {
    const series = new FunctionSeries();
    const listener = vi.fn();
    const listeners = new AbortController();
    listeners.abort();

    series.onChange(listener, listeners.signal);
    series.set(0, "x");
    expect(listener).not.toHaveBeenCalled();
  });

  it("hands out copies, so a caller cannot rewrite the model", () => {
    const series = new FunctionSeries(["x"]);
    const all = series.all() as string[];
    all[0] = "tampered";
    expect(series.at(0)).toBe("x");
  });
});
