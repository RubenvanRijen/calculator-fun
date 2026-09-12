/** One completed calculation, as shown in the history panel. */
export interface HistoryEntry {
  /** The sum that was performed, already formatted, e.g. "1,200 + 3". */
  readonly expression: string;
  /** The raw result, suitable for feeding back into the display. */
  readonly result: string;
}
