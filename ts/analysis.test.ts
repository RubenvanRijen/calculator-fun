import { describe, it, expect } from "vitest";
import { findExtremum, findIntersection, findRoot } from "@/analysis.ts";
import { plot } from "@/graph.ts";

describe("findRoot", () => {
  it.each([
    ["x^2-2 on the positive side", (x: number) => x * x - 2, 0, 5, Math.SQRT2],
    ["x^2-2 on the negative side", (x: number) => x * x - 2, -5, 0, -Math.SQRT2],
    ["a straight line", (x: number) => 2 * x - 6, -10, 10, 3],
    ["a cubic", (x: number) => x ** 3 - 8, -10, 10, 2],
    ["sin, at pi", (x: number) => Math.sin(x), 1, 5, Math.PI],
  ])("finds the root of %s", (_label, curve, from, to, expected) => {
    const root = findRoot(curve, from, to);
    expect(root).not.toBeNull();
    expect(root?.x).toBeCloseTo(expected, 9);
    expect(root?.y).toBeCloseTo(0, 9);
  });

  it("finds the first root when there are several", () => {
    expect(findRoot((x) => Math.sin(x), 1, 10)?.x).toBeCloseTo(Math.PI, 9);
  });

  it("finds a root sitting exactly on the boundary", () => {
    expect(findRoot((x) => x, 0, 5)?.x).toBe(0);
  });

  it("has nothing to report when the curve never crosses", () => {
    expect(findRoot((x) => x * x + 1, -5, 5)).toBeNull();
  });

  // A touching root is found only when a sample lands on it exactly; the
  // search is driven by sign changes, and a curve that touches zero without
  // crossing produces none. That is the honest limit of a numeric search.
  it("reports a touching root that a sample lands on", () => {
    // A curve that touches zero without crossing is only found when a sample
    // lands exactly on it. This range is 399 steps of exactly 1, so the
    // samples are the whole numbers and one of them is the root at 5.
    expect(findRoot((x) => (x - 5) ** 2, 0, 399)?.x).toBe(5);
  });

  it("misses a touching root between samples", () => {
    expect(findRoot((x) => (x - 0.3333) ** 2, -5, 5)).toBeNull();
  });

  it("steps over a point where the curve is undefined", () => {
    const root = findRoot((x) => (x === 0 ? NaN : x - 3), -5, 5);
    expect(root?.x).toBeCloseTo(3, 9);
  });

  it("survives a curve that throws", () => {
    const root = findRoot((x) => {
      if (x > 1 && x < 1.1) throw new Error("nope");
      return x - 3;
    }, -5, 5);
    expect(root?.x).toBeCloseTo(3, 9);
  });

  it("does not mistake a pole for a root", () => {
    // 1/(x-3.017) jumps from a large negative to a large positive across its
    // pole. That is a sign change, and bisection converges on it, but there is
    // no root: the curve never takes the value zero.
    //
    // The offset matters. A pole sitting exactly on a scan sample evaluates to
    // Infinity, which the scan already skips -- so it would pass this test
    // with the check removed, and prove nothing.
    expect(findRoot((x) => 1 / (x - 3.017), -10, 10)).toBeNull();
  });

  it("keeps scanning past a pole to the root beyond it", () => {
    // tan(x) has a pole at pi/2 and a root at pi. Rejecting the pole must not
    // abandon the search, or the root behind it is never reached.
    const found = findRoot(Math.tan, 1, 4);
    expect(found?.x).toBeCloseTo(Math.PI, 6);
  });

  it("reports the root's y as zero, not the float residual", () => {
    // Evaluating x^2-2 at the converged x leaves about -4.4e-16. The answer is
    // zero; that residual is the error bar of the evaluation.
    const found = findRoot((x) => x * x - 2, 0, 10);
    expect(found?.x).toBeCloseTo(Math.SQRT2, 9);
    expect(found?.y).toBe(0);
  });
});

  it("stays inside the range when the best point is at its edge", () => {
    // 2x has no turning point, so the lowest visible point is the left edge.
    // Rounding 0.3 to 0 would find a better value -- outside the window the
    // question was asked about.
    const found = findExtremum((x) => 2 * x, 0.3, 10, "min");
    expect(found?.x).toBeCloseTo(0.3, 9);
    expect(found?.y).toBeCloseTo(0.6, 9);
  });

  /** The largest |y| the chart actually draws for `expression`. */
  const drawnLimit = (expression: string): number =>
    Math.max(
      ...plot(expression, -10, 10).segments.flat().map((point) => Math.abs(point.y))
    );

  // Both curves climb to about 1e15 beside their asymptotes. The plot clips
  // anything past a percentile of |y|, so a maximum above that cutoff puts the
  // marker where there is no curve to put it on -- which is why the search
  // uses the plot's own cutoff rather than a threshold of its own.
  it("does not report an asymptote of 1/x as the highest point", () => {
    const found = findExtremum((x) => 1 / x, -10, 10, "max");
    expect(found).not.toBeNull();
    expect(Math.abs(found?.y ?? Infinity)).toBeLessThanOrEqual(drawnLimit("1/x"));
  });

  it("does not report an asymptote of tan as the highest point", () => {
    const found = findExtremum(Math.tan, -10, 10, "max");
    expect(found).not.toBeNull();
    expect(Math.abs(found?.y ?? Infinity)).toBeLessThanOrEqual(drawnLimit("tan(x)"));
  });

  it("still finds a turning point on a curve with large values", () => {
    // The cutoff is a percentile, not a fixed ceiling, so a genuinely big
    // curve keeps its extremum: 1000x^2 dips to -5000 at x = 0.
    const found = findExtremum((x) => 1000 * x * x - 5000, -10, 10, "min");
    expect(found?.x).toBeCloseTo(0, 6);
    expect(found?.y).toBeCloseTo(-5000, 3);
  });

describe("findIntersection", () => {
  it("finds where a line meets a parabola", () => {
    const meeting = findIntersection((x) => x * x, (x) => x + 2, 0, 5);
    expect(meeting?.x).toBeCloseTo(2, 9);
    expect(meeting?.y).toBeCloseTo(4, 9);
  });

  it("finds where two lines cross", () => {
    const meeting = findIntersection((x) => 2 * x, (x) => x + 3, -10, 10);
    expect(meeting?.x).toBeCloseTo(3, 9);
    expect(meeting?.y).toBeCloseTo(6, 9);
  });

  it("has nothing to report for parallel lines", () => {
    expect(findIntersection((x) => x, (x) => x + 1, -10, 10)).toBeNull();
  });
});

describe("findExtremum", () => {
  it.each([
    ["the vertex of a parabola", (x: number) => (x - 3) ** 2 + 1, -10, 10, "min" as const, 3, 1],
    ["the peak of a downward parabola", (x: number) => -((x + 2) ** 2) + 5, -10, 10, "max" as const, -2, 5],
    ["the trough of sin", (x: number) => Math.sin(x), 0, 2 * Math.PI, "min" as const, (3 * Math.PI) / 2, -1],
    ["the crest of sin", (x: number) => Math.sin(x), 0, 2 * Math.PI, "max" as const, Math.PI / 2, 1],
  ])("finds %s", (_label, curve, from, to, kind, atX, atY) => {
    const point = findExtremum(curve, from, to, kind);
    expect(point).not.toBeNull();
    expect(point?.x).toBeCloseTo(atX, 6);
    expect(point?.y).toBeCloseTo(atY, 9);
  });

  // Near a turning point the curve is flat to float precision, so the search
  // settles on a tiny offset where the answer is plainly zero.
  it("rounds the answer as far as the curve allows", () => {
    expect(findExtremum((x) => x * x - 2, -10, 10, "min")?.x).toBe(0);
  });

  it("leaves an answer that is genuinely not round alone", () => {
    const point = findExtremum((x) => Math.sin(x), 0, 2 * Math.PI, "max");
    expect(point?.x).toBeCloseTo(Math.PI / 2, 6);
    expect(point?.x).not.toBe(2);
  });

  it("reports the end of the range for a curve with no turning point", () => {
    const point = findExtremum((x) => 2 * x, 0, 10, "max");
    expect(point?.x).toBeCloseTo(10, 6);
  });

  it("has nothing to report when the curve is undefined throughout", () => {
    expect(findExtremum(() => NaN, -5, 5, "min")).toBeNull();
  });

  it("ignores the parts where the curve is undefined", () => {
    const point = findExtremum((x) => (x < 0 ? NaN : (x - 2) ** 2), -5, 5, "min");
    expect(point?.x).toBeCloseTo(2, 6);
  });
});
