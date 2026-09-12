import type { Curve } from "@/types/curve.ts";
import type { PlotSegment } from "@/types/plot-segment.ts";

/** The SVG user-space the plot is drawn in. */
export const PLOT_WIDTH = 280;
export const PLOT_HEIGHT = 200;

const SVG_NS = "http://www.w3.org/2000/svg";

/** How many points the shaded region of an integral is drawn from. */
const REGION_STEPS = 240;

/** Where a value lands on screen, once the panel has decided the window. */
type Project = (value: number) => number;

export function axisLine(
  doc: Document,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): SVGElement {
  const element = doc.createElementNS(SVG_NS, "line");
  element.setAttribute("x1", String(x1));
  element.setAttribute("y1", String(y1));
  element.setAttribute("x2", String(x2));
  element.setAttribute("y2", String(y2));
  element.setAttribute("class", "plot-axis");
  return element;
}

export function curvePath(doc: Document, d: string, series: number): SVGElement {
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("class", "plot-line");
  path.setAttribute("data-series", String(series));
  return path;
}

export function areaShape(doc: Document, d: string, series: number): SVGElement {
  const region = doc.createElementNS(SVG_NS, "path");
  region.setAttribute("d", d);
  region.setAttribute("class", "plot-area");
  region.setAttribute("data-graph-area", String(series));
  return region;
}

export function dot(doc: Document, cx: number, cy: number): SVGElement {
  const point = doc.createElementNS(SVG_NS, "circle");
  point.setAttribute("r", "2.5");
  point.setAttribute("cx", cx.toFixed(2));
  point.setAttribute("cy", cy.toFixed(2));
  point.setAttribute("class", "plot-point");
  point.setAttribute("data-graph-point", "");
  return point;
}

/** The trace marker, created hidden and moved into place when there is a trace. */
export function traceMarker(doc: Document): SVGElement {
  const element = doc.createElementNS(SVG_NS, "circle");
  element.setAttribute("r", "3.5");
  element.setAttribute("class", "plot-marker");
  element.setAttribute("data-graph-marker", "");
  element.setAttribute("visibility", "hidden");
  return element;
}

/** The `d` of one drawn stretch of curve. */
export function segmentD(
  segment: PlotSegment,
  toScreenX: Project,
  toScreenY: Project
): string {
  return segment
    .map((point, at) =>
      `${at === 0 ? "M" : "L"}${toScreenX(point.x).toFixed(2)} ${toScreenY(point.y).toFixed(2)}`
    )
    .join(" ");
}

/**
 * The `d` of the region under a curve, or null when there is too little of it
 * to draw.
 *
 * Sampled from the curve rather than taken from the drawn segments: the plot
 * drops whatever runs past its magnitude cutoff, and a region built from what
 * is left would leave out the very spans that decided the total. Clamped to the
 * box so a spike shades to the edge instead of escaping it.
 */
export function areaD(
  curve: Curve | null,
  xMin: number,
  xMax: number,
  toScreenX: Project,
  toScreenY: Project
): string | null {
  const baseline = clampToBox(toScreenY(0));
  const points: string[] = [];

  for (let index = 0; index <= REGION_STEPS; index += 1) {
    const x = xMin + ((xMax - xMin) * index) / REGION_STEPS;
    let y: number;
    try {
      y = curve === null ? Number.NaN : curve(x);
    } catch {
      y = Number.NaN;
    }
    if (!Number.isFinite(y)) continue;
    points.push(`L${toScreenX(x).toFixed(2)} ${clampToBox(toScreenY(y)).toFixed(2)}`);
  }

  if (points.length <= 1) return null;
  return (
    `M0 ${baseline.toFixed(2)} ${points.join(" ")} ` +
    `L${PLOT_WIDTH.toFixed(2)} ${baseline.toFixed(2)} Z`
  );
}

function clampToBox(y: number): number {
  return Math.min(Math.max(y, 0), PLOT_HEIGHT);
}
