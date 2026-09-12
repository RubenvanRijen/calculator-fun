/** A least-squares line through paired data, and how well it fits. */
export interface Regression {
  readonly slope: number;
  readonly intercept: number;
  /**
   * Pearson's r: the sign says which way the line leans.
   *
   * Null when y does not vary at all. The line through constant data is flat
   * and fits perfectly, but r is 0/0 there -- and reporting 1 would assert a
   * positive relationship that a slope of zero plainly denies.
   */
  readonly correlation: number | null;
  /** r squared: the share of the variation in y the line accounts for. */
  readonly rSquared: number | null;
}
