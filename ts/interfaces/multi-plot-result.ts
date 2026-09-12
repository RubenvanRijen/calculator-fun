import type { PlotResult } from "@/interfaces/plot-result.ts";

/** Several functions sampled over the same range, sharing one y window. */
export interface MultiPlotResult {
  /** One entry per expression given, in the same order. */
  readonly series: readonly PlotResult[];
  readonly yMin: number;
  readonly yMax: number;
}
