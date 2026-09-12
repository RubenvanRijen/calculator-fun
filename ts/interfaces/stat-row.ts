/**
 * One row of the list editor.
 *
 * Null is an empty cell rather than a zero: a row with only an L1 value is
 * half-entered data, and counting the missing L2 as 0 would quietly drag a
 * regression towards the origin.
 */
export interface StatRow {
  readonly L1: number | null;
  readonly L2: number | null;
}
