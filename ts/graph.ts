import { tokenize, toRpn, evaluateRpn } from "@/expression.ts";
import type { PlotPoint } from "@/interfaces/plot-point.ts";
import type { PlotSegment } from "@/types/plot-segment.ts";
import type { PlotResult } from "@/interfaces/plot-result.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";
import type { MultiPlotResult } from "@/interfaces/multi-plot-result.ts";

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
  samples: number = DEFAULT_SAMPLES,
  context: EvalContext = {}
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

  // Two points is the fewest that can describe a line; fewer would divide by
  // zero below and yield NaN for every x.
  const count = Math.max(2, Math.floor(samples));
  const step = (xMax - xMin) / (count - 1);
  const sampled: (PlotPoint | null)[] = [];
  let evaluated = 0;

  for (let index = 0; index < count; index += 1) {
    const x = xMin + index * step;
    try {
      // Graphs are always drawn in radians, whatever the keypad is set to,
      // but stored values and Ans are as available here as anywhere else.
      const y = evaluateRpn(rpn, { ...context, angleMode: "rad", x });
      evaluated += 1;
      sampled.push(Number.isFinite(y) ? { x, y } : null);
    } catch {
      sampled.push(null);
    }
  }

  if (evaluated === 0) {
    // Every sample threw, so the expression itself is the problem.
    try {
      evaluateRpn(rpn, { ...context, angleMode: "rad", x: 1 });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Invalid expression";
      return { ...EMPTY, error: message };
    }
  }

  const limit = magnitudeLimit(
    sampled.filter((point): point is PlotPoint => point !== null).map((point) => Math.abs(point.y))
  );
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
    // Distinguish "this expression is broken" from "it is simply undefined
    // here", so sqrt(x) over a negative range explains itself rather than
    // drawing a blank chart.
    return {
      ...EMPTY,
      error: evaluated === 0 ? "Invalid expression" : "Not defined in this range",
    };
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
 *
 * Exported because the searches in `analysis.ts` need the same cutoff: a
 * turning point the chart refuses to draw is not one worth reporting either.
 */
export function magnitudeLimit(magnitudes: readonly number[]): number {
  const sorted = [...magnitudes].sort((a, b) => a - b);
  if (sorted.length === 0) return Infinity;

  const index = Math.floor(sorted.length * 0.95);
  const percentile = sorted[Math.min(index, sorted.length - 1)] ?? 0;
  return Math.max(percentile * 8, 10);
}

/**
 * Sample several functions over one range, sharing a y window.
 *
 * Each is plotted independently -- the magnitude cutoff that splits tan(x)
 * into separate curves has to stay per series, or one steep function would
 * clip the rest -- and only the resulting windows are merged.
 */
export function plotAll(
  expressions: readonly string[],
  xMin: number,
  xMax: number,
  samples: number = DEFAULT_SAMPLES,
  context: EvalContext = {}
): MultiPlotResult {
  const series = expressions.map((expression) =>
    plot(expression, xMin, xMax, samples, context)
  );

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const result of series) {
    if (result.segments.length === 0) continue;
    yMin = Math.min(yMin, result.yMin);
    yMax = Math.max(yMax, result.yMax);
  }

  // Nothing drawable, so any window will do; keep the one an empty plot uses.
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    return { series, yMin: -1, yMax: 1 };
  }

  return { series, yMin, yMax };
}
