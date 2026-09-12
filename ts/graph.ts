import { tokenize, toRpn, evaluateRpn } from "./expression.js";
import type { PlotPoint } from "./interfaces/plot-point.js";
import type { PlotSegment } from "./types/plot-segment.js";
import type { PlotResult } from "./interfaces/plot-result.js";

/** How many points to sample across the visible range. */
export const DEFAULT_SAMPLES = 400;

/** Never plot below this, so a flat line still gets a sensible axis. */
const MIN_SPAN = 1e-6;

const EMPTY: PlotResult = { segments: [], yMin: -1, yMax: 1, error: null };

/**
 * Sample `expression` across [xMin, xMax].
 *
 * Points where the function is undefined or shoots off to infinity break the
 * line into separate segments, so tan(x) and 1/x are drawn as the several
 * distinct curves they are rather than joined by vertical streaks.
 */
export function plot(
  expression: string,
  xMin: number,
  xMax: number,
  samples: number = DEFAULT_SAMPLES
): PlotResult {
  if (expression.trim() === "") return EMPTY;
  if (!(xMax > xMin)) {
    return { ...EMPTY, error: "x-max must be greater than x-min" };
  }

  let rpn;
  try {
    rpn = toRpn(tokenize(expression));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid expression";
    return { ...EMPTY, error: message };
  }

  const step = (xMax - xMin) / (samples - 1);
  const sampled: (PlotPoint | null)[] = [];
  let evaluated = 0;

  for (let index = 0; index < samples; index += 1) {
    const x = xMin + index * step;
    try {
      const y = evaluateRpn(rpn, x);
      evaluated += 1;
      sampled.push(Number.isFinite(y) ? { x, y } : null);
    } catch {
      sampled.push(null);
    }
  }

  if (evaluated === 0) {
    // Every sample threw, so the expression itself is the problem.
    try {
      evaluateRpn(rpn, 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Invalid expression";
      return { ...EMPTY, error: message };
    }
  }

  const limit = magnitudeLimit(sampled);
  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];

  for (const point of sampled) {
    if (point === null || Math.abs(point.y) > limit) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 1) segments.push(current);

  if (segments.length === 0) {
    return { ...EMPTY, error: evaluated === 0 ? "Invalid expression" : null };
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const segment of segments) {
    for (const point of segment) {
      if (point.y < yMin) yMin = point.y;
      if (point.y > yMax) yMax = point.y;
    }
  }

  // Pad a little so the curve does not touch the frame, and give a flat line
  // some room rather than a zero-height axis.
  const span = Math.max(yMax - yMin, MIN_SPAN);
  const padding = span * 0.1;

  return {
    segments: segments as readonly PlotSegment[],
    yMin: yMin - padding,
    yMax: yMax + padding,
    error: null,
  };
}

/**
 * Where to cut the curve. Based on a high percentile of |y| rather than a
 * fixed number, so a genuinely large function still plots while an asymptote
 * is still clipped.
 */
function magnitudeLimit(sampled: readonly (PlotPoint | null)[]): number {
  const magnitudes = sampled
    .filter((point): point is PlotPoint => point !== null)
    .map((point) => Math.abs(point.y))
    .sort((a, b) => a - b);

  if (magnitudes.length === 0) return Infinity;

  const index = Math.floor(magnitudes.length * 0.95);
  const percentile = magnitudes[Math.min(index, magnitudes.length - 1)] ?? 0;
  return Math.max(percentile * 8, 10);
}
