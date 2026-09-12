/** One completed calculation, as shown in the history panel. */
export interface HistoryEntry {
  /** The sum that was performed, already formatted, e.g. "1,200 + 3". */
  readonly expression: string;
  /** The result as it was shown -- which may be exact, e.g. "2√2". */
  readonly result: string;
  /**
   * The same value in a form the parser can read back, since the shown form
   * may use √ and π symbols the tokenizer does not accept. Clicking an entry
   * inserts this.
   */
  readonly recall: string;
}
