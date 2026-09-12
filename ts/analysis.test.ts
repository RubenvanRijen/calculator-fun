import { describe, it, expect } from "vitest";
import { derivative, findExtremum, findIntersection, findRoot, integrate } from "@/analysis.ts";
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

describe("derivative", () => {
  it("differentiates a line to its slope", () => {
    expect(derivative((x) => 3 * x + 1, 5)).toBeCloseTo(3, 9);
  });

  it("differentiates x squared to 2x", () => {
    expect(derivative((x) => x * x, 4)).toBeCloseTo(8, 6);
    expect(derivative((x) => x * x, -3)).toBeCloseTo(-6, 6);
  });

  it("differentiates sine to cosine", () => {
    expect(derivative(Math.sin, 0)).toBeCloseTo(1, 8);
    expect(derivative(Math.sin, Math.PI / 2)).toBeCloseTo(0, 8);
    expect(derivative(Math.sin, Math.PI)).toBeCloseTo(-1, 8);
  });

  it("is zero at a turning point", () => {
    expect(derivative((x) => x * x - 2, 0)).toBeCloseTo(0, 8);
  });

  it("works far from the origin, where a fixed step would vanish", () => {
    // At 1e8 a step of 1e-10 is lost in the gap between one double and the
    // next, and the difference comes out as pure noise.
    expect(derivative((x) => 3 * x, 1e8)).toBeCloseTo(3, 6);
  });

  it("has no answer at a corner", () => {
    // abs(x) turns at zero. Averaging the two sides gives 0, which is not a
    // flat spot -- it is a point where there is no slope at all.
    expect(derivative(Math.abs, 0)).toBeNull();
  });

  it("differentiates a sharply bending curve rather than calling it a corner", () => {
    // 100x^2 is flat at zero and bends hard. Judging the disagreement between
    // the two sides against a fixed size condemns it, because curvature makes
    // them disagree in proportion to the step -- which is exactly what tells
    // it apart from a corner, where they disagree by the whole turn.
    expect(derivative((x) => 100 * x * x, 0)).toBeCloseTo(0, 6);
    expect(derivative((x) => 1000 * x * x, 0)).toBeCloseTo(0, 6);
    expect(derivative((x) => 1000 * x * x, 2)).toBeCloseTo(4000, 3);
  });

  it("differentiates an oscillating curve far from the origin", () => {
    // The step grows with x so that x + step is still a different number, and
    // at x = 1000 it is coarse next to a wave of length 2pi.
    expect(derivative(Math.sin, 1000)).toBeCloseTo(Math.cos(1000), 6);
    expect(derivative(Math.sin, 200)).toBeCloseTo(Math.cos(200), 6);
  });

  it("differentiates steeply near a pole without reaching it", () => {
    expect(derivative((x) => 1 / x, 0.001)).toBeCloseTo(-1e6, -2);
  });

  it("has no answer at a jump", () => {
    // Both sides of a jump agree on an enormous slope, so the corner test
    // sees nothing. What gives it away is that the answer doubles when the
    // step halves instead of settling.
    expect(derivative(Math.sign, 0)).toBeNull();
  });

  it("still differentiates that same corner away from the turn", () => {
    expect(derivative(Math.abs, 5)).toBeCloseTo(1, 9);
    expect(derivative(Math.abs, -5)).toBeCloseTo(-1, 9);
  });

  it("has no answer where the curve is undefined", () => {
    expect(derivative(Math.sqrt, -4)).toBeNull();
  });

  it("has no answer at a pole", () => {
    expect(derivative((x) => 1 / x, 0)).toBeNull();
  });

  it("survives a curve that throws", () => {
    expect(derivative(() => { throw new Error("nope"); }, 1)).toBeNull();
  });
});

describe("integrate", () => {
  it("integrates a constant to a rectangle", () => {
    expect(integrate(() => 3, 0, 4)).toBeCloseTo(12, 9);
  });

  it("integrates x to half x squared", () => {
    expect(integrate((x) => x, 0, 4)).toBeCloseTo(8, 9);
  });

  it("integrates a cubic exactly, which Simpson's rule can do", () => {
    // The integral of x^3 from 0 to 2 is 4.
    expect(integrate((x) => x * x * x, 0, 2)).toBeCloseTo(4, 9);
  });

  it("integrates sine over half a turn to two", () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 9);
  });

  it("integrates sine over a full turn to nothing", () => {
    // The halves cancel: the area above the axis and the area below it. What
    // survives an exact cancellation is the float's error bar, not an area,
    // so the answer is 0 rather than 3.6e-15.
    expect(integrate(Math.sin, 0, 2 * Math.PI)).toBe(0);
    expect(integrate((x) => x, -10, 10)).toBe(0);
  });

  it("leaves a genuinely tiny area alone", () => {
    // 1e-15 is nothing next to an area of 200, and everything next to an area
    // of 1e-15. The cutoff is relative to how much area was added up.
    expect(integrate(() => 1e-15, 0, 1)).toBeCloseTo(1e-15, 25);
  });

  it("counts area below the axis as negative", () => {
    expect(integrate((x) => x, -4, 0)).toBeCloseTo(-8, 9);
  });

  it("is nothing across no distance at all", () => {
    expect(integrate((x) => x * x, 3, 3)).toBe(0);
  });

  it("negates when the ends are given the other way round", () => {
    const forwards = integrate((x) => x * x, 0, 3) ?? 0;
    expect(integrate((x) => x * x, 3, 0)).toBeCloseTo(-forwards, 9);
  });

  it("has no answer across a point the curve does not reach", () => {
    // 1/x does not converge across zero, and the sample landing on it says so.
    expect(integrate((x) => 1 / x, -1, 1)).toBeNull();
  });

  it("refuses an area that has not settled", () => {
    // A pole inside the range never settles however finely it is split, which
    // is the honest answer: the area there is infinite.
    expect(integrate((x) => 1 / (x - 0.317), -1, 1)).toBeNull();
  });

  it("refuses a divergent area whose halves cancel exactly", () => {
    // tan is odd about the middle of this window, so the infinity on the left
    // cancels the one on the right at every level of splitting. Every estimate
    // is exactly zero, nothing ever disagrees, and a check on the signed total
    // alone accepts the first interval whole and reports an area of 0.
    expect(integrate(Math.tan, -10, 10)).toBeNull();
    expect(integrate(Math.tan, -20, 20)).toBeNull();
  });

  it("integrates a curve whose slope runs away at the end", () => {
    // The fourth derivative of a square root is unbounded at zero, so two
    // fixed resolutions disagree by far more than a smooth curve would -- and
    // refusing on that basis turns away an ordinary, finite area.
    expect(integrate((x) => Math.sqrt(x + 10), -10, 10)).toBeCloseTo(59.62847939, 6);
    expect(integrate(Math.sqrt, 0, 4)).toBeCloseTo(16 / 3, 9);
  });

  it("keeps a small area under a curve that reaches far higher", () => {
    // The area is 6.3e-5 under a curve reaching 1e8. Judging what counts as
    // rounding by how much area there could have been swallows it whole.
    // To seven places, not more: adding and subtracting numbers of size 1e8
    // to arrive at 6e-5 costs about eight digits, and no rule can give them
    // back. The point is that the answer survives at all rather than being
    // rounded away to zero.
    expect(integrate((x) => 1e8 * Math.sin(x) + 1e-5, 0, 2 * Math.PI))
      .toBeCloseTo(2 * Math.PI * 1e-5, 7);
  });

  it("integrates a steep but honest curve", () => {
    // Large values are not the problem; not converging is. The integral of
    // 1/x from 1 to e is exactly 1.
    expect(integrate((x) => 1 / x, 1, Math.E)).toBeCloseTo(1, 9);
  });
});
