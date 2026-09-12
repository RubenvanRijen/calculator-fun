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

/** How many samples the first, uniform pass takes to size up an integral. */
const SCALE_STEPS = 200;

/** How deep the adaptive split may go before an area is called impossible. */
const MAX_DEPTH = 50;

/** And how much work in total, so a pathological curve cannot hang the page. */
const MAX_EVALUATIONS = 20000;

/**
 * How much of the gap survives halving the step before a point is a corner.
 *
 * Curvature halves it, leaving 0.5; a corner keeps all of it, leaving 1. The
 * threshold sits between the two with room on either side.
 */
const CORNER_RATIO = 0.75;

/** How far the two step sizes may disagree before there is no slope at all. */
const SLOPE_TOLERANCE = 1e-3;

/** How exact an area has to be, against how much area there is. */
const AREA_TOLERANCE = 1e-10;

/** Below this share of the area added up, what is left is rounding, not area. */
const SETTLE_TOLERANCE = 1e-14;

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


/**
 * The central difference across x ± step, and how far the two sides disagree.
 *
 * The disagreement is the useful part: on a smooth curve it is the curvature
 * times the step, so it shrinks with the step, while at a corner it is the
 * whole turn and does not shrink at all.
 */
function slopeAcross(
  curve: Curve,
  x: number,
  step: number
): { slope: number; gap: number } | null {
  // `high - low` rather than `2 * step`, because adding the step to x rounds
  // it, and dividing by the width actually used beats the one asked for.
  const high = x + step;
  const low = x - step;
  const above = safely(curve, high);
  const below = safely(curve, low);
  const here = safely(curve, x);
  if (Number.isNaN(above) || Number.isNaN(below) || Number.isNaN(here)) return null;

  const rising = (above - here) / (high - x);
  const falling = (here - below) / (x - low);
  return {
    slope: (above - below) / (high - low),
    gap: Math.abs(rising - falling),
  };
}

/**
 * The slope at a point.
 *
 * The step is scaled to x rather than fixed: the same absolute step that is
 * sensible at x = 1 is far too small at x = 1e8, where x + step rounds back to
 * x and the difference is nothing at all.
 *
 * Two things are checked before an answer is given, because a central
 * difference will cheerfully average its way across a point where no slope
 * exists:
 *
 * - A corner. The two one-sided slopes are compared at the step and at half
 *   the step. Curvature makes them disagree in proportion to the step, so
 *   halving it halves the disagreement; a corner keeps the whole turn however
 *   small the step gets. Comparing the disagreement against a fixed size
 *   instead would condemn any curve that bends sharply -- 100x² at zero is
 *   flat, not a corner.
 * - A jump. Both sides of one agree on an enormous slope, so the gap test
 *   sees nothing; what gives it away is that the answer doubles when the step
 *   halves instead of settling.
 *
 * The two differences are then combined so that their leading errors cancel,
 * which is what keeps the answer good at a large x where the step is coarse.
 */
export function derivative(curve: Curve, x: number): number | null {
  const step = Math.cbrt(Number.EPSILON) * Math.max(Math.abs(x), 1);
  const here = safely(curve, x);
  if (Number.isNaN(here)) return null;

  const wide = slopeAcross(curve, x, step);
  const narrow = slopeAcross(curve, x, step / 2);
  if (wide === null || narrow === null) return null;

  // Below this the gap is the float's own noise in the subtraction, and its
  // ratio means nothing -- a straight line has no curvature to measure.
  const noise = (Number.EPSILON * Math.max(Math.abs(here), 1) * 16) / step;
  if (wide.gap > noise && narrow.gap > wide.gap * CORNER_RATIO) return null;

  const settled = Math.abs(narrow.slope - wide.slope);
  if (settled > Math.max(Math.abs(narrow.slope), 1) * SLOPE_TOLERANCE) return null;

  // Richardson: the two have errors in h² and h²/4, and this combination
  // cancels them.
  return (4 * narrow.slope - wide.slope) / 3;
}

/**
 * The area under the curve between two points, by adaptive Simpson's rule.
 *
 * Simpson fits a parabola through each pair of intervals. Rather than spend
 * the same effort everywhere, each interval is compared against its own two
 * halves: where they agree the answer is taken, and where they do not the
 * interval is split and tried again.
 *
 * That adaptation is what tells a hard integral from an impossible one. The
 * square root at the left end of `sqrt(x+10)` needs a great many small
 * intervals and gets them, and converges. An asymptote never converges however
 * far it is split, so it runs out of depth and is refused -- which is the
 * honest answer, because the area there is infinite.
 *
 * Comparing two fixed resolutions cannot tell those apart. It rejects the
 * square root, whose fourth derivative is unbounded at the end, and it accepts
 * tan(x) across a window centred on zero, where the infinities on either side
 * cancel to something that looks like nothing at all.
 */
export function integrate(curve: Curve, from: number, to: number): number | null {
  if (from === to) return 0;
  // Orientation is part of the answer: integrating backwards negates it.
  if (from > to) {
    const backwards = integrate(curve, to, from);
    return backwards === null ? null : -backwards;
  }

  // How much area there is to be accurate about. The signed total cannot set
  // its own tolerance -- it is near zero exactly when the cancellation makes
  // accuracy hardest.
  const scale = absoluteArea(curve, from, to);
  if (scale === null) return null;
  const tolerance = Math.max(scale, Number.MIN_VALUE) * AREA_TOLERANCE;

  // An integral converges only if the area of its absolute value does, and
  // that is the test that cannot be fooled by symmetry. tan(x) across a window
  // centred on zero makes every estimate exactly zero -- the infinity on the
  // left cancels the one on the right at every level of splitting, so nothing
  // ever disagrees and the first interval is accepted whole. Its absolute
  // value has nothing to cancel against, and never settles.
  const converges = adapt((at) => Math.abs(safely(curve, at)), from, to, tolerance);
  if (converges === null) return null;

  const total = adapt(curve, from, to, tolerance);
  if (total === null) return null;

  // Areas above and below the axis cancel, and what survives an exact
  // cancellation is the float's error bar rather than an area: the integral of
  // x across a window centred on zero is nothing, not 3.6e-15. The bar is set
  // by how much area was added up to get there, not by how much there could
  // have been -- a curve reaching 1e8 can still have a real area of 6e-5.
  return Math.abs(total) < scale * SETTLE_TOLERANCE ? 0 : total;
}

/**
 * Adaptive Simpson over one interval, or null if it will not settle.
 *
 * Each interval is compared against its own two halves: where they agree the
 * answer is taken, and where they do not the interval is split and tried
 * again. Running out of depth, or of the work allowed, means the area is not
 * one that can be measured -- which is the honest answer for an asymptote,
 * where it is infinite.
 */
function adapt(
  curve: Curve,
  from: number,
  to: number,
  tolerance: number
): number | null {
  let budget = MAX_EVALUATIONS;
  const evaluate = (at: number): number => {
    budget -= 1;
    return safely(curve, at);
  };

  const recurse = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    allowed: number,
    depth: number
  ): number | null => {
    if (budget <= 0 || depth <= 0) return null;

    const middle = (a + b) / 2;
    const flm = evaluate((a + middle) / 2);
    const frm = evaluate((middle + b) / 2);
    if (Number.isNaN(flm) || Number.isNaN(frm)) return null;

    const left = ((middle - a) / 6) * (fa + 4 * flm + fm);
    const right = ((b - middle) / 6) * (fm + 4 * frm + fb);
    const difference = left + right - whole;

    // Simpson's error falls by sixteen when the interval halves, so the gap
    // between the two is fifteen times the error left in the finer one.
    if (Math.abs(difference) <= 15 * allowed) return left + right + difference / 15;

    const lower = recurse(a, middle, fa, flm, fm, left, allowed / 2, depth - 1);
    if (lower === null) return null;
    const upper = recurse(middle, b, fm, frm, fb, right, allowed / 2, depth - 1);
    return upper === null ? null : lower + upper;
  };

  const middle = (from + to) / 2;
  const fa = evaluate(from);
  const fm = evaluate(middle);
  const fb = evaluate(to);
  if (Number.isNaN(fa) || Number.isNaN(fm) || Number.isNaN(fb)) return null;

  const whole = ((to - from) / 6) * (fa + 4 * fm + fb);
  return recurse(from, to, fa, fm, fb, whole, tolerance, MAX_DEPTH);
}

/**
 * Roughly how much curve there is, ignoring which side of the axis it is on.
 *
 * Only a scale, so a coarse uniform pass is enough. It is what the tolerance
 * and the settling threshold are measured against.
 */
function absoluteArea(curve: Curve, from: number, to: number): number | null {
  const step = (to - from) / SCALE_STEPS;
  let total = 0;
  for (let index = 0; index <= SCALE_STEPS; index += 1) {
    const y = safely(curve, from + index * step);
    if (Number.isNaN(y)) return null;
    total += Math.abs(y);
  }
  return total * step;
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
