import type { PlotPoint } from "@/interfaces/plot-point.ts";

/**
 * A run of consecutive points with no break in between. A function such as
 * tan(x) or 1/x produces several, one per continuous piece.
 */
export type PlotSegment = readonly PlotPoint[];
