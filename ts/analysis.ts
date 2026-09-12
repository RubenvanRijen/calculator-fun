import { DEFAULT_SAMPLES, magnitudeLimit } from "@/graph.ts";
import type { Curve } from "@/types/curve.ts";
import type { ExtremumKind } from "@/types/extremum-kind.ts";
import type { PlotPoint } from "@/interfaces/plot-point.ts";

/**
 * Finding the interesting points on a curve: roots, intersections and turning
 * points.
 *
 * Everything here is numeric rather than symbolic, and takes a plain function
 * of x, so it can be tested without going near the parser or the DOM. Each
 * search scans the range coarsely first and then refines, which is what keeps
 * it from wandering off to a root outside the visible window.
 */

/**
 * How many samples the coarse scan takes across the range.
 *
 * The same count, and the same spacing, as the plot: a search that saw a
 * slightly different set of points would compute a slightly different cutoff
 * and could answer with a point the chart had clipped.
 */
const SCAN_STEPS = DEFAULT_SAMPLES - 1;

/** Bisection halves the interval this many times: well past double precision. */
const REFINE_STEPS = 80;

/** Evaluate without throwing; anything that fails is simply undefined here. */
function safely(curve: Curve, x: number): number {
  try {
    const y = curve(x);
    return Number.isFinite(y) ? y : NaN;
  } catch {
    return NaN;
  }
}

/** Narrow a bracket where the sign changes down to a point. */
function bisect(curve: Curve, low: number, high: number): number {
  let a = low;
  let b = high;
  let fa = safely(curve, a);

  for (let step = 0; step < REFINE_STEPS; step += 1) {
    const mid = (a + b) / 2;
    const fmid = safely(curve, mid);
    if (Number.isNaN(fmid)) return mid;

    if (fa * fmid <= 0) {
      b = mid;
    } else {
      a = mid;
      fa = fmid;
    }
  }

  return (a + b) / 2;
}

/**
 * A sign change is a crossing only if the curve shrinks towards it.
 *
 * `1/(x-3)` flips from a large negative to a large positive across its pole,
 * which is a sign change with no root anywhere near it. Bisection converges on
 * the pole just as happily as on a root, so the two have to be told apart
 * afterwards: a genuine root leaves a residual of almost nothing, while a pole
 * leaves a value larger than either end of the bracket it was found in.
 */
function crosses(value: number, atLow: number, atHigh: number): boolean {
  if (!Number.isFinite(value)) return false;
  return Math.abs(value) <= Math.min(Math.abs(atLow), Math.abs(atHigh));
}

/**
 * The first x in [from, to] where the curve crosses zero.
 *
 * Only sign changes count: a curve that merely touches zero without crossing
 * is not found, which is the honest answer for a numeric search -- claiming
 * otherwise would mean reporting roots that are really rounding noise.
 *
 * The y reported is zero rather than the residual of the last evaluation. The
 * point is a root; `-4.4e-16` is the float's error bar, not the answer.
 */
export function findRoot(curve: Curve, from: number, to: number): PlotPoint | null {
  const step = (to - from) / SCAN_STEPS;
  let previousX = from;
  let previousY = safely(curve, from);

  if (previousY === 0) return { x: from, y: 0 };

  for (let index = 1; index <= SCAN_STEPS; index += 1) {
    const x = from + index * step;
    const y = safely(curve, x);

    if (!Number.isNaN(previousY) && !Number.isNaN(y)) {
      if (y === 0) return { x, y: 0 };
      if (previousY * y < 0) {
        const root = bisect(curve, previousX, x);
        // A pole is not a root: keep scanning rather than giving up, so
        // tan(x) still finds the crossings between its asymptotes.
        if (crosses(safely(curve, root), previousY, y)) return { x: root, y: 0 };
      }
    }

    previousX = x;
    previousY = y;
  }

  return null;
}

/** Where two curves meet, which is a root of their difference. */
export function findIntersection(
  first: Curve,
  second: Curve,
  from: number,
  to: number
): PlotPoint | null {
  const difference: Curve = (x) => safely(first, x) - safely(second, x);
  const crossing = findRoot(difference, from, to);
  return crossing === null ? null : { x: crossing.x, y: safely(first, crossing.x) };
}

/**
 * The lowest or highest point in [from, to].
 *
 * The coarse scan picks the best sample, then a ternary search refines within
 * its neighbours. Ternary search assumes one turning point in that bracket,
 * which the scan has already made true.
 *
 * Samples running off to an asymptote are left out of the scan. Without that,
 * the highest point of `1/x` is the sample nearest its pole -- a y of 2.4e15,
 * which is not a turning point, and which the chart does not even draw. The
 * cutoff is the one the plot uses, so the two agree on what is on the curve.
 */
export function findExtremum(
  curve: Curve,
  from: number,
  to: number,
  kind: ExtremumKind
): PlotPoint | null {
  const step = (to - from) / SCAN_STEPS;
  const better = (a: number, b: number): boolean => (kind === "min" ? a < b : a > b);

  const scanned: number[] = [];
  for (let index = 0; index <= SCAN_STEPS; index += 1) {
    scanned.push(safely(curve, from + index * step));
  }
  const limit = magnitudeLimit(scanned.filter((y) => !Number.isNaN(y)).map(Math.abs));

  let bestIndex = -1;
  let bestY = NaN;

  for (let index = 0; index <= SCAN_STEPS; index += 1) {
    const y = scanned[index] ?? NaN;
    if (Number.isNaN(y) || Math.abs(y) > limit) continue;
    if (bestIndex === -1 || better(y, bestY)) {
      bestIndex = index;
      bestY = y;
    }
  }

  if (bestIndex === -1) return null;

  let low = from + Math.max(bestIndex - 1, 0) * step;
  let high = from + Math.min(bestIndex + 1, SCAN_STEPS) * step;

  for (let iteration = 0; iteration < REFINE_STEPS; iteration += 1) {
    const third = (high - low) / 3;
    const leftX = low + third;
    const rightX = high - third;
    const leftY = safely(curve, leftX);
    const rightY = safely(curve, rightX);

    if (Number.isNaN(leftY) || Number.isNaN(rightY)) break;
    if (better(leftY, rightY)) high = rightX;
    else low = leftX;
  }

  const x = (low + high) / 2;
  const y = safely(curve, x);
  // The bracket around the best sample can still contain an asymptote, and a
  // ternary search climbs one happily. Refinement that leaves the part of the
  // curve the chart draws is refused; the scan's own best sample stands.
  if (Number.isNaN(y) || Math.abs(y) > limit) {
    return { x: from + bestIndex * step, y: bestY };
  }

  const rounded = tidy(curve, x, better, from, to);
  return { x: rounded, y: safely(curve, rounded) };
}

/**
 * Round the answer as far as the curve allows.
 *
 * Near a turning point the curve is flat to within float precision, so the
 * search settles on something like 1.054e-8 where the answer is plainly 0.
 * Rounding is only accepted when it does not make the value any worse, so a
 * genuine 4.712388980 is left alone.
 *
 * A rounded x outside [from, to] is refused however good it looks. On a curve
 * with no turning point the best value sits at the edge of the range, and
 * rounding there always improves on it by stepping outside -- which would
 * answer a question about the visible window with a point that is not in it.
 */
function tidy(
  curve: Curve,
  x: number,
  better: (a: number, b: number) => boolean,
  from: number,
  to: number
): number {
  const settled = safely(curve, x);
  if (Number.isNaN(settled)) return x;

  const low = Math.min(from, to);
  const high = Math.max(from, to);

  for (const places of [0, 1, 2, 3, 4, 6, 9]) {
    const candidate = Number(x.toFixed(places));
    if (candidate < low || candidate > high) continue;
    const y = safely(curve, candidate);
    if (!Number.isNaN(y) && !better(settled, y)) return candidate;
  }

  return x;
}
