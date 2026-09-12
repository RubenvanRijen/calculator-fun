import type { OneVarStats } from "@/interfaces/one-var-stats.ts";
import type { Regression } from "@/interfaces/regression.ts";

/**
 * Statistics over lists of numbers.
 *
 * Plain arrays in, plain numbers out, no DOM and no parser, so every figure
 * here can be checked against one worked by hand.
 */

/** The middle of an already-sorted list. */
function medianOfSorted(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? NaN;
  return ((sorted[middle - 1] ?? NaN) + (sorted[middle] ?? NaN)) / 2;
}

/**
 * The five-figure summary and the deviations for one list.
 *
 * Null for an empty list: a mean of nothing is not zero, and reporting it as
 * zero would put a number on the screen that no data supports.
 *
 * Quartiles follow the hardware: the lower quartile is the median of the
 * values below the median, and for an odd count the median itself belongs to
 * neither half.
 */
export function summarise(values: readonly number[]): OneVarStats | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  const sumOfSquares = sorted.reduce((total, value) => total + value * value, 0);
  const mean = sum / count;

  const squaredError = sorted.reduce(
    (total, value) => total + (value - mean) ** 2,
    0
  );

  const half = Math.floor(count / 2);
  const lower = sorted.slice(0, half);
  // An odd count leaves the median out of both halves.
  const upper = sorted.slice(count % 2 === 1 ? half + 1 : half);

  return {
    count,
    sum,
    sumOfSquares,
    mean,
    median: medianOfSorted(sorted),
    min: sorted[0] ?? NaN,
    max: sorted[count - 1] ?? NaN,
    lowerQuartile: lower.length === 0 ? (sorted[0] ?? NaN) : medianOfSorted(lower),
    upperQuartile: upper.length === 0 ? (sorted[count - 1] ?? NaN) : medianOfSorted(upper),
    populationDeviation: Math.sqrt(squaredError / count),
    sampleDeviation: count < 2 ? null : Math.sqrt(squaredError / (count - 1)),
  };
}

/**
 * The least-squares line through paired data.
 *
 * Null when there is no line to draw: fewer than two points, mismatched list
 * lengths, or every x the same -- a vertical line has no slope, and returning
 * an enormous one would be a worse answer than saying there isn't one.
 */
export function regress(
  xs: readonly number[],
  ys: readonly number[]
): Regression | null {
  if (xs.length !== ys.length || xs.length < 2) return null;

  const count = xs.length;
  const meanX = xs.reduce((total, value) => total + value, 0) / count;
  const meanY = ys.reduce((total, value) => total + value, 0) / count;

  let varianceX = 0;
  let varianceY = 0;
  let covariance = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = (xs[index] ?? NaN) - meanX;
    const dy = (ys[index] ?? NaN) - meanY;
    varianceX += dx * dx;
    varianceY += dy * dy;
    covariance += dx * dy;
  }

  if (varianceX === 0) return null;

  const slope = covariance / varianceX;

  // r is 0/0 when y does not vary. The flat line through constant data is a
  // perfect fit, but there is no correlation to report: saying 1 would claim
  // a positive relationship that a slope of zero denies.
  const correlation =
    varianceY === 0 ? null : covariance / Math.sqrt(varianceX * varianceY);

  return {
    slope,
    intercept: settle(meanY - slope * meanX, Math.abs(meanY) + Math.abs(slope * meanX)),
    correlation,
    rSquared: correlation === null ? null : correlation * correlation,
  };
}

/**
 * Zero out a value that is only the residue of a cancellation.
 *
 * The intercept is the difference of two numbers of size `scale`. Data lying
 * exactly on y = 2.1x leaves -8.88e-16 behind, which is the float's error bar
 * on that subtraction rather than an intercept, and printing it as one puts
 * "y = 2.1x - 8.8817842e-16" on the screen.
 */
function settle(value: number, scale: number): number {
  return Math.abs(value) < scale * 1e-12 ? 0 : value;
}
