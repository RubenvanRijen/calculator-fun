import { describe, it, expect } from "vitest";
import { plot } from "./graph.js";

/** Every point across every segment, for assertions that ignore breaks. */
function allPoints(result: ReturnType<typeof plot>) {
  return result.segments.flatMap((segment) => [...segment]);
}

describe("plot", () => {
  it("samples a parabola", () => {
    const result = plot("x^2", -2, 2, 5);
    expect(result.error).toBeNull();
    expect(result.segments).toHaveLength(1);
    expect(allPoints(result).map((p) => p.y)).toEqual([4, 1, 0, 1, 4]);
  });

  it("samples a straight line", () => {
    const result = plot("2*x+1", 0, 4, 5);
    expect(allPoints(result).map((p) => p.y)).toEqual([1, 3, 5, 7, 9]);
  });

  it("pads the y range so the curve does not touch the frame", () => {
    const result = plot("x", 0, 10, 11);
    expect(result.yMin).toBeLessThan(0);
    expect(result.yMax).toBeGreaterThan(10);
  });

  it("gives a flat line a usable range", () => {
    const result = plot("3", -5, 5, 11);
    expect(result.error).toBeNull();
    expect(result.yMax).toBeGreaterThan(result.yMin);
  });

  it("handles an empty expression as nothing to draw", () => {
    const result = plot("", -5, 5);
    expect(result.segments).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  it("reports a parse error", () => {
    const result = plot("x^^2", -5, 5);
    expect(result.error).not.toBeNull();
    expect(result.segments).toHaveLength(0);
  });

  it("reports an unknown name", () => {
    const result = plot("wobble(x)", -5, 5);
    expect(result.error).toMatch(/Unknown name/);
  });

  it("rejects a backwards range", () => {
    const result = plot("x", 10, -10);
    expect(result.error).toMatch(/x-max must be greater/);
  });

  it("uses a constant expression across the range", () => {
    const result = plot("pi", -1, 1, 3);
    expect(allPoints(result).every((p) => Math.abs(p.y - Math.PI) < 1e-9)).toBe(true);
  });

  describe("discontinuities", () => {
    it("breaks 1/x into two segments either side of the asymptote", () => {
      const result = plot("1/x", -5, 5, 201);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
    });

    it("breaks tan(x) into several segments", () => {
      const result = plot("tan(x)", -6, 6, 401);
      expect(result.segments.length).toBeGreaterThanOrEqual(3);
    });

    it("drops the undefined half of sqrt(x)", () => {
      const result = plot("sqrt(x)", -4, 4, 101);
      expect(result.error).toBeNull();
      expect(allPoints(result).every((p) => p.x >= -1e-9)).toBe(true);
    });

    it("keeps the y range finite despite an asymptote", () => {
      const result = plot("1/x", -5, 5, 201);
      expect(Number.isFinite(result.yMin)).toBe(true);
      expect(Number.isFinite(result.yMax)).toBe(true);
    });
  });

  it("respects the sample count", () => {
    expect(allPoints(plot("x", 0, 1, 10))).toHaveLength(10);
  });

  describe("regressions", () => {
    it.each([0, 1, -5])("still plots a line with a sample count of %s", (samples) => {
      const result = plot("x", -10, 10, samples);
      expect(result.error).toBeNull();
      expect(allPoints(result).every((p) => Number.isFinite(p.y))).toBe(true);
    });

    it("explains a function that is undefined across the whole range", () => {
      const result = plot("sqrt(x)", -10, -1);
      expect(result.segments).toHaveLength(0);
      // Was a blank chart with no message at all.
      expect(result.error).toBe("Not defined in this range");
    });

    it("still reports a genuinely broken expression differently", () => {
      expect(plot("x^^2", -10, 10).error).not.toBe("Not defined in this range");
    });
  });
});
