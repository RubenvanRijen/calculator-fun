/** Everything the calculator reports about a single list of numbers. */
export interface OneVarStats {
  readonly count: number;
  readonly sum: number;
  readonly sumOfSquares: number;
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  /** The median of the values below the median, as on the TI hardware. */
  readonly lowerQuartile: number;
  readonly upperQuartile: number;
  /** Divides by n: the spread of these numbers, taken as the whole population. */
  readonly populationDeviation: number;
  /**
   * Divides by n-1: the estimate of a wider population's spread.
   *
   * Null for a single value, where there is no such estimate to make -- one
   * number says nothing about how far apart numbers are.
   */
  readonly sampleDeviation: number | null;
}
