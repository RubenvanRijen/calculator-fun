import { plot } from "../graph.js";
import type { PlotResult } from "../interfaces/plot-result.js";

/** The SVG user-space the plot is drawn in. */
const PLOT_WIDTH = 280;
const PLOT_HEIGHT = 200;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Short, readable numbers for the trace readout. */
function trim(value: number): string {
  return parseFloat(value.toPrecision(4)).toString();
}

/**
 * An emptied <input type="number"> reads as "", not null, so `??` would never
 * reach the fallback and Number("") would silently become 0.
 */
function readNumber(input: HTMLInputElement | null, fallback: number): number {
  const raw = input?.value.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * The ƒ(x) tab: an expression field, a range, and an inline SVG plot with a
 * hover readout. Owns nothing but its own elements, so the composition root
 * only has to hand it a place to look and tell it when to redraw.
 */
export function setupGraphPanel(
  root: Document | HTMLElement,
  doc: Document,
  signal: AbortSignal
): { render: () => void } {
  const query = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  const input = query<HTMLInputElement>("[data-graph-input]");
  const minInput = query<HTMLInputElement>("[data-graph-min]");
  const maxInput = query<HTMLInputElement>("[data-graph-max]");
  const svg = root.querySelector<SVGSVGElement>("[data-graph-svg]");
  const errorElement = query("[data-graph-error]");
  const readout = query("[data-graph-readout]");

  let lastPlot: PlotResult | null = null;
  let lastRange = { xMin: -10, xMax: 10 };

  function line(x1: number, y1: number, x2: number, y2: number): SVGElement {
    const element = doc.createElementNS(SVG_NS, "line");
    element.setAttribute("x1", String(x1));
    element.setAttribute("y1", String(y1));
    element.setAttribute("x2", String(x2));
    element.setAttribute("y2", String(y2));
    element.setAttribute("class", "plot-axis");
    return element;
  }

  function render(): void {
    if (!svg) return;

    const expression = input?.value ?? "";
    const xMin = readNumber(minInput, -10);
    const xMax = readNumber(maxInput, 10);
    const result = plot(expression, xMin, xMax);

    lastPlot = result;
    lastRange = { xMin, xMax };

    if (errorElement) {
      errorElement.textContent = result.error ?? "";
      errorElement.hidden = result.error === null;
    }

    svg.replaceChildren();

    const toScreenX = (x: number): number =>
      ((x - xMin) / (xMax - xMin)) * PLOT_WIDTH;
    const toScreenY = (y: number): number =>
      PLOT_HEIGHT - ((y - result.yMin) / (result.yMax - result.yMin)) * PLOT_HEIGHT;

    // Axes, drawn only where they fall inside the visible range.
    if (xMin < 0 && xMax > 0) {
      svg.append(line(toScreenX(0), 0, toScreenX(0), PLOT_HEIGHT));
    }
    if (result.yMin < 0 && result.yMax > 0) {
      svg.append(line(0, toScreenY(0), PLOT_WIDTH, toScreenY(0)));
    }

    for (const segment of result.segments) {
      const path = doc.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        segment
          .map((point, index) =>
            `${index === 0 ? "M" : "L"}${toScreenX(point.x).toFixed(2)} ${toScreenY(point.y).toFixed(2)}`
          )
          .join(" ")
      );
      path.setAttribute("class", "plot-line");
      svg.append(path);
    }

    const marker = doc.createElementNS(SVG_NS, "circle");
    marker.setAttribute("r", "3.5");
    marker.setAttribute("class", "plot-marker");
    marker.setAttribute("data-graph-marker", "");
    marker.setAttribute("visibility", "hidden");
    svg.append(marker);

    if (readout) readout.textContent = "";
  }

  function traceAt(ratio: number): void {
    if (!svg || !lastPlot || lastPlot.segments.length === 0) return;

    const { xMin, xMax } = lastRange;
    const x = xMin + ratio * (xMax - xMin);

    // Find the sampled point nearest the pointer.
    let nearest = null;
    let bestDistance = Infinity;
    for (const segment of lastPlot.segments) {
      for (const point of segment) {
        const distance = Math.abs(point.x - x);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = point;
        }
      }
    }
    if (!nearest) return;

    const marker = svg.querySelector("[data-graph-marker]");
    if (marker) {
      marker.setAttribute(
        "cx",
        (((nearest.x - xMin) / (xMax - xMin)) * PLOT_WIDTH).toFixed(2)
      );
      marker.setAttribute(
        "cy",
        (
          PLOT_HEIGHT -
          ((nearest.y - lastPlot.yMin) / (lastPlot.yMax - lastPlot.yMin)) * PLOT_HEIGHT
        ).toFixed(2)
      );
      marker.setAttribute("visibility", "visible");
    }
    if (readout) {
      readout.textContent = `x = ${trim(nearest.x)}   ƒ(x) = ${trim(nearest.y)}`;
    }
  }

  // pointermove covers mouse, pen and a finger dragged across the plot.
  svg?.addEventListener(
    "pointermove",
    (event) => {
      const bounds = svg.getBoundingClientRect();
      if (bounds.width === 0) return;
      traceAt((event.clientX - bounds.left) / bounds.width);
    },
    { signal }
  );
  svg?.addEventListener(
    "pointerleave",
    () => {
      svg.querySelector("[data-graph-marker]")?.setAttribute("visibility", "hidden");
      if (readout) readout.textContent = "";
    },
    { signal }
  );

  for (const field of [input, minInput, maxInput]) {
    field?.addEventListener("input", render, { signal });
  }

  for (const chip of root.querySelectorAll<HTMLElement>("[data-graph-example]")) {
    chip.addEventListener(
      "click",
      () => {
        if (input) input.value = chip.dataset["graphExample"] ?? "";
        render();
      },
      { signal }
    );
  }

  return { render };
}
