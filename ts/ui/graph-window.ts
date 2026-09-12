import { significant } from "@/format.ts";

/**
 * A window that holds `values` with a little room around them.
 *
 * The margin is a tenth of the span, applied on each side, so a point never
 * sits exactly on the edge of the box. Flat data -- every value the same --
 * still gets a margin of one on each side, rather than a window of no height
 * at all.
 */
export function windowAround(values: readonly number[]): { min: number; max: number } {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = Math.max((high - low) * 0.1, 1);
  return { min: low - margin, max: high + margin };
}

/**
 * A window bound as a field shows it.
 *
 * Short enough to read in a narrow input, and exact enough that zooming in and
 * back out again lands where it started.
 */
export function boundText(value: number): string {
  return String(significant(value, 6));
}
