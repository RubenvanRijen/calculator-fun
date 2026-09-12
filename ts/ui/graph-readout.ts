import { significant } from "@/format.ts";

/** Short, readable numbers for the readout. */
export function trim(value: number): string {
  return String(significant(value, 4));
}

/**
 * What the readout says while the marker is on a curve.
 *
 * The series is named because there can be four of them, and a bare pair of
 * numbers would not say which one was being read.
 */
export function traceText(series: number, x: number, y: number): string {
  return `Y${series + 1}   x = ${trim(x)}   y = ${trim(y)}`;
}
