import { describe, it, expect } from "vitest";
import { summarise, regress } from "@/stats.ts";

describe("summarise", () => {
  it("has nothing to say about an empty list", () => {
    // A mean of nothing is not zero.
    expect(summarise([])).toBeNull();
  });

  it("summarises a single value", () => {
    const stats = summarise([7]);
    expect(stats?.count).toBe(1);
    expect(stats?.mean).toBe(7);
    expect(stats?.median).toBe(7);
    expect(stats?.min).toBe(7);
    expect(stats?.max).toBe(7);
    expect(stats?.populationDeviation).toBe(0);
  });

  it("has no sample deviation for a single value", () => {
    // Dividing by n-1 divides by zero; one number says nothing about spread.
    expect(summarise([7])?.sampleDeviation).toBeNull();
  });

  it("works the textbook figures for 2 4 4 4 5 5 7 9", () => {
    // Mean 5, population deviation exactly 2, sample deviation sqrt(32/7).
    const stats = summarise([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats?.count).toBe(8);
    expect(stats?.sum).toBe(40);
    expect(stats?.mean).toBe(5);
    expect(stats?.sumOfSquares).toBe(232);
    expect(stats?.populationDeviation).toBeCloseTo(2, 12);
    expect(stats?.sampleDeviation).toBeCloseTo(Math.sqrt(32 / 7), 12);
  });

  it("takes the median of an even count as the middle pair's mean", () => {
    expect(summarise([1, 2, 3, 4])?.median).toBe(2.5);
  });

  it("takes the median of an odd count as the middle value", () => {
    expect(summarise([1, 2, 3, 4, 5])?.median).toBe(3);
  });

  it("sorts before it summarises", () => {
    const jumbled = summarise([9, 1, 5, 3, 7]);
    expect(jumbled?.median).toBe(5);
    expect(jumbled?.min).toBe(1);
    expect(jumbled?.max).toBe(9);
  });

  it("quarters an even count by halving it", () => {
    // Halves are 1 2 3 4 and 5 6 7 8, whose medians are 2.5 and 6.5.
    const stats = summarise([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stats?.lowerQuartile).toBe(2.5);
    expect(stats?.upperQuartile).toBe(6.5);
  });

  it("leaves the median out of both halves when the count is odd", () => {
    // As the hardware does: for 1 2 3 4 5 the halves are 1 2 and 4 5.
    const stats = summarise([1, 2, 3, 4, 5]);
    expect(stats?.median).toBe(3);
    expect(stats?.lowerQuartile).toBe(1.5);
    expect(stats?.upperQuartile).toBe(4.5);
  });

  it("gives a two-value list quartiles of its two values", () => {
    const stats = summarise([10, 20]);
    expect(stats?.lowerQuartile).toBe(10);
    expect(stats?.upperQuartile).toBe(20);
  });

  it("reports no spread for a list that does not vary", () => {
    const stats = summarise([3, 3, 3, 3]);
    expect(stats?.populationDeviation).toBe(0);
    expect(stats?.sampleDeviation).toBe(0);
  });

  it("handles negative values", () => {
    const stats = summarise([-5, -1, 3]);
    expect(stats?.mean).toBeCloseTo(-1, 12);
    expect(stats?.median).toBe(-1);
    expect(stats?.min).toBe(-5);
  });
});

describe("regress", () => {
  it("has no line through fewer than two points", () => {
    expect(regress([1], [2])).toBeNull();
    expect(regress([], [])).toBeNull();
  });

  it("refuses lists of different lengths", () => {
    expect(regress([1, 2, 3], [1, 2])).toBeNull();
  });

  it("has no line when every x is the same", () => {
    // A vertical line has no slope; a huge number would be a worse answer.
    expect(regress([2, 2, 2], [1, 5, 9])).toBeNull();
  });

  it("recovers a line the points sit exactly on", () => {
    // y = 3x + 1
    const fit = regress([0, 1, 2, 3], [1, 4, 7, 10]);
    expect(fit?.slope).toBeCloseTo(3, 12);
    expect(fit?.intercept).toBeCloseTo(1, 12);
    expect(fit?.rSquared).toBeCloseTo(1, 12);
  });

  it("signs the correlation by which way the line leans", () => {
    const falling = regress([0, 1, 2, 3], [10, 8, 6, 4]);
    expect(falling?.slope).toBeCloseTo(-2, 12);
    expect(falling?.correlation).toBeCloseTo(-1, 12);
    expect(falling?.rSquared).toBeCloseTo(1, 12);
  });

  it("fits a scattered set to its least-squares line", () => {
    // The worked example: x 1..5, y 2 4 5 4 5. Slope 0.6, intercept 2.2.
    const fit = regress([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    expect(fit?.slope).toBeCloseTo(0.6, 12);
    expect(fit?.intercept).toBeCloseTo(2.2, 12);
    expect(fit?.rSquared).toBeCloseTo(0.6, 12);
  });

  it("gives a flat line its slope but no correlation", () => {
    // Every y the same: y = 3 goes exactly through every point, so the slope
    // and intercept are real and worth having. But r is 0/0 -- there is no
    // relationship to measure, and calling it 1 would assert a positive one
    // that a slope of zero denies.
    const fit = regress([1, 2, 3], [3, 3, 3]);
    expect(fit).not.toBeNull();
    expect(fit?.slope).toBe(0);
    expect(fit?.intercept).toBeCloseTo(3, 12);
    expect(fit?.correlation).toBeNull();
    expect(fit?.rSquared).toBeNull();
  });

  it("settles an intercept that is only float residue", () => {
    // These points lie exactly on y = 2.1x. The subtraction that produces the
    // intercept leaves about -8.9e-16 behind, which is the float's error bar
    // and not an intercept: it would print as "y = 2.1x - 8.8817842e-16".
    const fit = regress([1, 2, 3, 4, 5], [2.1, 4.2, 6.3, 8.4, 10.5]);
    expect(fit?.slope).toBeCloseTo(2.1, 12);
    expect(fit?.intercept).toBe(0);
  });

  it("leaves a small intercept alone when the data is small too", () => {
    // 1e-9 is nothing next to a mean of 5, but everything next to a mean of
    // 1e-9. The cutoff is relative to what the numbers actually are.
    const fit = regress([0.000000001, 0.000000002], [0.000000002, 0.000000003]);
    expect(fit?.intercept).toBeCloseTo(1e-9, 18);
    expect(fit?.intercept).not.toBe(0);
  });

  it("puts the line through the mean of the data", () => {
    // A least-squares line always passes through (mean x, mean y).
    const xs = [1, 3, 4, 8, 11];
    const ys = [2, 7, 6, 15, 19];
    const fit = regress(xs, ys);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    expect((fit?.slope ?? 0) * meanX + (fit?.intercept ?? 0)).toBeCloseTo(meanY, 12);
  });
});
