import type { PlotSegment } from "@/types/plot-segment.ts";

/** The outcome of sampling a function across a range of x. */
export interface PlotResult {
  readonly segments: readonly PlotSegment[];
  readonly yMin: number;
  readonly yMax: number;
  /** Set when the expression could not be parsed or evaluated at all. */
  readonly error: string | null;
}
