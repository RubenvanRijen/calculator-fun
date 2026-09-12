import { compileCurve, plotAll } from "@/graph.ts";
import { findExtremum, findIntersection, findRoot } from "@/analysis.ts";
import { SERIES_COUNT } from "@/function-series.ts";
import { readNumber } from "@/ui/read-number.ts";
import type { FunctionSeries } from "@/function-series.ts";
import type { MultiPlotResult } from "@/interfaces/multi-plot-result.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";
import type { Curve } from "@/types/curve.ts";
import type { ExtremumKind } from "@/types/extremum-kind.ts";

/** The SVG user-space the plot is drawn in. */
const PLOT_WIDTH = 280;
const PLOT_HEIGHT = 200;
const SVG_NS = "http://www.w3.org/2000/svg";

/** How far one press of the trace arrows moves, as a share of the range. */
const TRACE_STEP = 1 / 60;

/** Short, readable numbers for the readout. */
function trim(value: number): string {
  return parseFloat(value.toPrecision(4)).toString();
}

/**
 * The ƒ(x) tab: up to four functions, a range that can be zoomed, a trace that
 * walks along a curve, and searches for roots, turning points and crossings.
 */
export function setupGraphPanel(
  root: Document | HTMLElement,
  doc: Document,
  signal: AbortSignal,
  /** The functions being plotted, shared with the table. */
  series: FunctionSeries,
  /** Supplies stored values, so "A*x" can be plotted. */
  contextOf: () => EvalContext
): { render: () => void } {
  const query = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  const inputs = Array.from({ length: SERIES_COUNT }, (_, index) =>
    query<HTMLInputElement>(`[data-graph-input="${index}"]`)
  );
  const minInput = query<HTMLInputElement>("[data-graph-min]");
  const maxInput = query<HTMLInputElement>("[data-graph-max]");
  const svg = root.querySelector<SVGSVGElement>("[data-graph-svg]");
  const errorElement = query("[data-graph-error]");
  const readout = query("[data-graph-readout]");
  const panel = query('[data-panel="graph"]');

  let plotted: MultiPlotResult | null = null;
  let range = { xMin: -10, xMax: 10 };
  /**
   * Which series the trace is following, and where along it.
   *
   * `known` is carried so a redraw does not undo a search: a root's y is zero,
   * and re-evaluating the curve there would put the float residual back.
   */
  let traced: { series: number; x: number; known: number | undefined } | null = null;

  const expressions = (): readonly string[] => series.all();

  /** The indexes of the series that actually have something drawn. */
  const drawn = (): number[] =>
    (plotted?.series ?? [])
      .map((result, index) => (result.segments.length > 0 ? index : -1))
      .filter((index) => index !== -1);

  /** A plain function of x for one series, for the numeric searches. */
  const curveFor = (index: number): Curve | null =>
    compileCurve(series.at(index), contextOf);

  function line(x1: number, y1: number, x2: number, y2: number): SVGElement {
    const element = doc.createElementNS(SVG_NS, "line");
    element.setAttribute("x1", String(x1));
    element.setAttribute("y1", String(y1));
    element.setAttribute("x2", String(x2));
    element.setAttribute("y2", String(y2));
    element.setAttribute("class", "plot-axis");
    return element;
  }

  const toScreenX = (x: number): number =>
    ((x - range.xMin) / (range.xMax - range.xMin)) * PLOT_WIDTH;

  const toScreenY = (y: number): number => {
    if (plotted === null) return PLOT_HEIGHT / 2;
    const span = plotted.yMax - plotted.yMin;
    return PLOT_HEIGHT - ((y - plotted.yMin) / span) * PLOT_HEIGHT;
  };

  function render(): void {
    if (!svg) return;
    // Tabs unhide the panel before asking it to render, so this only skips the
    // redraws that would land on a panel nobody is looking at.
    if (panel?.hidden === true) return;

    range = { xMin: readNumber(minInput, -10), xMax: readNumber(maxInput, 10) };
    plotted = plotAll(expressions(), range.xMin, range.xMax, undefined, contextOf());

    // Report the first thing that went wrong, naming which field it was in --
    // except a bad range, which every series reports and none of them caused.
    const badRange = range.xMax <= range.xMin;
    const failed = plotted.series.findIndex((result) => result.error !== null);
    if (errorElement) {
      let problem: string | null = null;
      if (badRange) problem = "x-max must be greater than x-min";
      else if (failed !== -1) {
        const reason = plotted.series[failed]?.error ?? null;
        problem = reason === null ? null : `Y${failed + 1}: ${reason}`;
      }
      errorElement.textContent = problem ?? "";
      errorElement.hidden = problem === null;
    }

    svg.replaceChildren();

    if (range.xMin < 0 && range.xMax > 0) {
      svg.append(line(toScreenX(0), 0, toScreenX(0), PLOT_HEIGHT));
    }
    if (plotted.yMin < 0 && plotted.yMax > 0) {
      svg.append(line(0, toScreenY(0), PLOT_WIDTH, toScreenY(0)));
    }

    plotted.series.forEach((result, index) => {
      for (const segment of result.segments) {
        const path = doc.createElementNS(SVG_NS, "path");
        path.setAttribute(
          "d",
          segment
            .map((point, at) =>
              `${at === 0 ? "M" : "L"}${toScreenX(point.x).toFixed(2)} ${toScreenY(point.y).toFixed(2)}`
            )
            .join(" ")
        );
        path.setAttribute("class", "plot-line");
        path.setAttribute("data-series", String(index));
        svg.append(path);
      }
    });

    const marker = doc.createElementNS(SVG_NS, "circle");
    marker.setAttribute("r", "3.5");
    marker.setAttribute("class", "plot-marker");
    marker.setAttribute("data-graph-marker", "");
    marker.setAttribute("visibility", "hidden");
    svg.append(marker);

    // A trace already running should survive a redraw -- but only while it is
    // still on screen. Replaying one from the old window would leave the
    // readout describing a point outside the new one.
    if (traced !== null && traced.x >= range.xMin && traced.x <= range.xMax) {
      showTrace(traced.series, traced.x, traced.known);
    } else {
      clearTrace();
    }
  }

  /** Take the marker off the curve and say nothing, rather than something stale. */
  function clearTrace(): void {
    traced = null;
    svg?.querySelector("[data-graph-marker]")?.setAttribute("visibility", "hidden");
    if (readout) readout.textContent = "";
  }

  /**
   * Put the marker on `series` at `x`, and say where it is.
   *
   * `known` is the y a search already established. A root's y is zero by
   * definition, so re-evaluating the curve there would replace the answer with
   * whatever float dust the evaluation happens to leave behind.
   */
  function showTrace(series: number, x: number, known?: number): void {
    const curve = curveFor(series);
    if (!svg || curve === null) return clearTrace();

    let y: number;
    if (known !== undefined) {
      y = known;
    } else {
      try {
        y = curve(x);
      } catch {
        return clearTrace();
      }
    }
    if (!Number.isFinite(y)) return clearTrace();

    traced = { series, x, known };

    const marker = svg.querySelector("[data-graph-marker]");
    if (marker) {
      marker.setAttribute("cx", toScreenX(x).toFixed(2));
      marker.setAttribute("cy", toScreenY(y).toFixed(2));
      marker.setAttribute("visibility", "visible");
      marker.setAttribute("data-series", String(series));
    }
    if (readout) {
      readout.textContent = `Y${series + 1}   x = ${trim(x)}   y = ${trim(y)}`;
    }
  }

  /** The series nearest a point, so hovering follows whichever curve is there. */
  function nearestSeries(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;

    for (const index of drawn()) {
      const curve = curveFor(index);
      if (curve === null) continue;
      try {
        const value = curve(x);
        if (!Number.isFinite(value)) continue;
        const distance = Math.abs(value - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      } catch {
        continue;
      }
    }

    return best;
  }

  function scaleRange(factor: number): void {
    const centre = (range.xMin + range.xMax) / 2;
    const half = ((range.xMax - range.xMin) / 2) * factor;
    if (minInput) minInput.value = String(parseFloat((centre - half).toPrecision(6)));
    if (maxInput) maxInput.value = String(parseFloat((centre + half).toPrecision(6)));
    render();
  }

  function step(direction: number): void {
    const series = traced?.series ?? drawn()[0];
    if (series === undefined) return;
    const from = traced?.x ?? (range.xMin + range.xMax) / 2;
    const next = from + direction * (range.xMax - range.xMin) * TRACE_STEP;
    showTrace(series, Math.min(Math.max(next, range.xMin), range.xMax));
  }

  /** Run one of the numeric searches and put the marker on what it found. */
  function find(what: string): void {
    const visible = drawn();
    const series = traced?.series ?? visible[0];
    const curve = series === undefined ? null : curveFor(series);
    if (series === undefined || curve === null) {
      if (readout) readout.textContent = "Nothing to search";
      return;
    }

    let found = null;
    if (what === "root") {
      found = findRoot(curve, range.xMin, range.xMax);
    } else if (what === "min" || what === "max") {
      found = findExtremum(curve, range.xMin, range.xMax, what as ExtremumKind);
    } else if (what === "intersect") {
      const other = visible.find((index) => index !== series);
      const otherCurve = other === undefined ? null : curveFor(other);
      if (otherCurve === null) {
        if (readout) readout.textContent = "Intersect needs two curves";
        return;
      }
      found = findIntersection(curve, otherCurve, range.xMin, range.xMax);
    }

    if (found === null) {
      if (readout) readout.textContent = `No ${what} in this range`;
      return;
    }
    showTrace(series, found.x, found.y);
  }

  // --- wiring ---------------------------------------------------------------
  inputs.forEach((input, index) => {
    input?.addEventListener("input", () => {
      series.set(index, input.value);
    }, { signal });
  });

  series.onChange(() => {
    traced = null;
    render();
  }, signal);
  for (const input of [minInput, maxInput]) {
    input?.addEventListener("input", render, { signal });
  }

  svg?.addEventListener("pointermove", (event) => {
    const bounds = svg.getBoundingClientRect();
    // A collapsed box divides by zero below. Both ratios go to Infinity and
    // the hover ends up doing nothing anyway; this just says so up front.
    if (bounds.width === 0 || bounds.height === 0 || plotted === null) return;

    const ratio = (event.clientX - bounds.left) / bounds.width;
    const x = range.xMin + ratio * (range.xMax - range.xMin);
    const yRatio = (event.clientY - bounds.top) / bounds.height;
    const y = plotted.yMax - yRatio * (plotted.yMax - plotted.yMin);

    const series = nearestSeries(x, y);
    if (series !== null) showTrace(series, x);
  }, { signal });

  svg?.addEventListener("pointerleave", clearTrace, { signal });

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-graph-zoom], [data-graph-step], [data-graph-find]")
      : null;
    if (button === null) return;

    const zoom = button.dataset["graphZoom"];
    if (zoom === "in") scaleRange(0.5);
    else if (zoom === "out") scaleRange(2);
    else if (zoom === "reset") {
      if (minInput) minInput.value = "-10";
      if (maxInput) maxInput.value = "10";
      traced = null;
      render();
    }

    const stepBy = button.dataset["graphStep"];
    if (stepBy !== undefined) step(Number(stepBy));

    const what = button.dataset["graphFind"];
    if (what !== undefined) find(what);
  }, { signal });

  return { render };
}
