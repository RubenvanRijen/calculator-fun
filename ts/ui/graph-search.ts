import { derivative, findExtremum, findIntersection, findRoot, integrate } from "@/analysis.ts";
import { trim } from "@/ui/graph-readout.ts";
import type { Curve } from "@/types/curve.ts";
import type { ExtremumKind } from "@/types/extremum-kind.ts";
import type { SearchOutcome } from "@/types/search-outcome.ts";

/**
 * Run one of the graph's searches and say what it found.
 *
 * Pure: it is handed the curves and the window and hands back a description of
 * the answer, leaving the panel the one place that moves a marker or shades a
 * region. That is what makes the numeric side testable without a DOM, and what
 * keeps the six branches from each growing their own way of saying things.
 */
export function search(
  what: string,
  series: number,
  curve: Curve,
  /**
   * The other drawn curve, compiled only if the search needs one -- a thunk so
   * that looking for a root still costs exactly one compiled curve.
   */
  otherCurve: () => Curve | null,
  xMin: number,
  xMax: number,
  /** Where the trace is, or the middle of the window if it is not running. */
  at: number
): SearchOutcome {
  if (what === "slope") {
    const slope = derivative(curve, at);
    return {
      kind: "message",
      text: slope === null
        ? `No slope at x = ${trim(at)}`
        : `Y${series + 1}   x = ${trim(at)}   dy/dx = ${trim(slope)}`,
    };
  }

  if (what === "area") {
    const area = integrate(curve, xMin, xMax);
    if (area === null) {
      return { kind: "area", shade: false, text: "No area across this range" };
    }
    return {
      kind: "area",
      shade: true,
      text: `Y${series + 1}   ∫ from ${trim(xMin)} to ${trim(xMax)} = ${trim(area)}`,
    };
  }

  let found = null;
  if (what === "root") {
    found = findRoot(curve, xMin, xMax);
  } else if (what === "min" || what === "max") {
    found = findExtremum(curve, xMin, xMax, what as ExtremumKind);
  } else if (what === "intersect") {
    const other = otherCurve();
    if (other === null) {
      return { kind: "message", text: "Intersect needs two curves" };
    }
    found = findIntersection(curve, other, xMin, xMax);
  }

  if (found === null) return { kind: "message", text: `No ${what} in this range` };
  return { kind: "trace", x: found.x, y: found.y };
}
