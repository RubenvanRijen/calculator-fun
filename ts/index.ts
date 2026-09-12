import { Calculator } from "./calculator.js";
import { isOperation } from "./expression.js";
import { plot } from "./graph.js";
import { loadState, saveState } from "./storage.js";
import { applyTheme, otherTheme, preferredTheme } from "./theme.js";
import type { CalculatorHandle } from "./interfaces/calculator-handle.js";
import type { HistoryEntry } from "./interfaces/history-entry.js";
import type { PlotResult } from "./interfaces/plot-result.js";
import type { Theme } from "./types/theme.js";

/** How long a key flashes when driven from the keyboard. */
const FLASH_MS = 120;

/** The SVG user-space the plot is drawn in. */
const PLOT_WIDTH = 280;
const PLOT_HEIGHT = 200;

/**
 * Bind a calculator to the buttons and display inside `root`.
 * Exported so the wiring itself can be tested against a jsdom document.
 */
export function setupCalculator(root: Document | HTMLElement): CalculatorHandle {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const query = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  const expressionElement = query("[data-expression]");
  const resultElement = query("[data-result]");
  const errorElement = query("[data-error]");
  const memoryIndicator = query("[data-memory-indicator]");
  const parenIndicator = query("[data-paren-indicator]");
  const historyList = query("[data-history-list]");
  const historyEmpty = query("[data-history-empty]");

  // strictNullChecks makes these `HTMLElement | null`, so the missing-markup
  // case has to be dealt with rather than blowing up later on `.textContent`.
  if (!expressionElement || !resultElement) {
    throw new Error(
      "Calculator markup is missing [data-expression] or [data-result]."
    );
  }

  const calculator = new Calculator();

  // --- persistence & theme ------------------------------------------------
  const saved = loadState();
  calculator.restore(saved.history ?? [], saved.memory ?? 0);

  let theme: Theme = saved.theme ?? preferredTheme();
  const themeIcon = query("[data-theme-icon]");
  const applyCurrentTheme = (): void => {
    applyTheme(theme, doc.documentElement);
    if (themeIcon) themeIcon.textContent = theme === "dark" ? "☀" : "☾";
  };
  applyCurrentTheme();

  const persist = (): void => {
    saveState({ history: calculator.history, memory: calculator.memory, theme });
  };

  // --- display ------------------------------------------------------------
  const buttonsByLabel = new Map<string, HTMLElement>();
  for (const button of root.querySelectorAll<HTMLElement>("button")) {
    const label = button.textContent?.trim();
    if (label && !buttonsByLabel.has(label)) buttonsByLabel.set(label, button);
  }

  const updateDisplay = (): void => {
    expressionElement.textContent = calculator.expressionDisplay;
    resultElement.textContent = calculator.resultDisplay;

    if (errorElement) {
      errorElement.textContent = calculator.error ?? "";
      errorElement.hidden = calculator.error === null;
    }
    if (memoryIndicator) memoryIndicator.hidden = !calculator.hasMemory;
    if (parenIndicator) {
      const open = calculator.openParenCount;
      parenIndicator.hidden = open === 0;
      parenIndicator.textContent = `( ${open}`;
    }
    renderHistory();
    persist();
  };

  function renderHistory(): void {
    if (!historyList) return;
    const entries = calculator.history;
    if (historyEmpty) historyEmpty.hidden = entries.length > 0;
    historyList.replaceChildren(...entries.map(renderHistoryEntry));
  }

  function renderHistoryEntry(entry: HistoryEntry): HTMLElement {
    const item = doc.createElement("li");

    // A button, not a bare <li>, so the entry is reachable by keyboard too.
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "history-entry";

    const expression = doc.createElement("span");
    expression.className = "history-expression";
    expression.textContent = entry.expression;

    const result = doc.createElement("span");
    result.className = "history-result";
    result.textContent = entry.result;

    button.append(expression, result);
    button.addEventListener("click", () => {
      calculator.recall(entry.result);
      updateDisplay();
    });

    item.append(button);
    return item;
  }

  function flash(label: string): void {
    const button = buttonsByLabel.get(label);
    if (!button) return;
    button.classList.add("is-pressed");
    setTimeout(() => button.classList.remove("is-pressed"), FLASH_MS);
  }

  // --- keypad -------------------------------------------------------------
  const on = (selector: string, handler: (element: HTMLElement) => void): void => {
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      element.addEventListener("click", () => {
        handler(element);
        updateDisplay();
      });
    }
  };

  on("[data-number]", (button) =>
    calculator.appendNumber(button.dataset["number"] ?? button.textContent ?? "")
  );
  on("[data-operation]", (button) => {
    const operation = button.dataset["operation"] ?? "";
    if (isOperation(operation)) calculator.chooseOperation(operation);
  });
  on("[data-memory]", (button) => {
    switch (button.dataset["memory"]) {
      case "add": calculator.memoryAdd(); break;
      case "subtract": calculator.memorySubtract(); break;
      case "recall": calculator.memoryRecall(); break;
      case "clear": calculator.memoryClear(); break;
    }
  });
  on("[data-function]", (button) =>
    calculator.appendFunction(button.dataset["function"] ?? "")
  );
  on("[data-constant]", (button) =>
    calculator.appendConstant(button.dataset["constant"] ?? "")
  );
  on("[data-equals]", () => calculator.compute());
  on("[data-all-clear]", () => calculator.clear());
  on("[data-delete]", () => calculator.delete());
  on("[data-sign]", () => calculator.toggleSign());
  on("[data-percent]", () => calculator.percent());
  on("[data-square]", () => calculator.square());
  on("[data-reciprocal]", () => calculator.reciprocal());
  on("[data-open-paren]", () => calculator.openParen());
  on("[data-close-paren]", () => calculator.closeParen());
  on("[data-history-clear]", () => calculator.clearHistory());

  // --- theme toggle -------------------------------------------------------
  query("[data-theme-toggle]")?.addEventListener("click", () => {
    theme = otherTheme(theme);
    applyCurrentTheme();
    persist();
  });

  // --- keyboard -----------------------------------------------------------
  function applyKey(key: string): string | null {
    if (/^[0-9]$/.test(key) || key === ".") {
      calculator.appendNumber(key);
      return key;
    }
    // "/" is what a keyboard offers; the button is labelled "÷".
    const operation = key === "/" ? "÷" : key;
    if (isOperation(operation)) {
      calculator.chooseOperation(operation);
      return operation === "^" ? "xⁿ" : operation;
    }
    switch (key) {
      case "Enter":
      case "=":
        calculator.compute();
        return "=";
      case "Backspace":
        calculator.delete();
        return "DEL";
      case "Escape":
        calculator.clear();
        return "AC";
      case "%":
        calculator.percent();
        return "%";
      case "(":
        calculator.openParen();
        return "(";
      case ")":
        calculator.closeParen();
        return ")";
      default:
        return null;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // Typing into the graph input must not drive the keypad.
    const active = doc.activeElement;
    if (active instanceof HTMLInputElement) return;

    // A focused button handles Enter and Space itself; intercepting here would
    // fire the action twice.
    if (
      (event.key === "Enter" || event.key === " ") &&
      active instanceof HTMLButtonElement
    ) {
      return;
    }

    const label = applyKey(event.key);
    if (label === null) return;

    event.preventDefault();
    flash(label);
    updateDisplay();
  }

  doc.addEventListener("keydown", handleKeydown);

  // --- tabs ---------------------------------------------------------------
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-tab]")];
  const panels = [...root.querySelectorAll<HTMLElement>("[data-panel]")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const name = tab.dataset["tab"];
      for (const other of tabs) {
        const active = other === tab;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
      }
      for (const panel of panels) {
        panel.hidden = panel.dataset["panel"] !== name;
      }
      if (name === "graph") renderGraph();
    });
  }

  // --- graph --------------------------------------------------------------
  const graphInput = query<HTMLInputElement>("[data-graph-input]");
  const graphMin = query<HTMLInputElement>("[data-graph-min]");
  const graphMax = query<HTMLInputElement>("[data-graph-max]");
  const graphSvg = root.querySelector<SVGSVGElement>("[data-graph-svg]");
  const graphError = query("[data-graph-error]");
  const graphReadout = query("[data-graph-readout]");

  let lastPlot: PlotResult | null = null;
  let lastRange: { xMin: number; xMax: number } = { xMin: -10, xMax: 10 };

  function renderGraph(): void {
    if (!graphSvg) return;

    const expression = graphInput?.value ?? "";
    const xMin = readNumber(graphMin, -10);
    const xMax = readNumber(graphMax, 10);
    const result = plot(expression, xMin, xMax);

    lastPlot = result;
    lastRange = { xMin, xMax };

    if (graphError) {
      graphError.textContent = result.error ?? "";
      graphError.hidden = result.error === null;
    }

    graphSvg.replaceChildren();
    const svgNs = "http://www.w3.org/2000/svg";

    const toScreenX = (x: number): number =>
      ((x - xMin) / (xMax - xMin)) * PLOT_WIDTH;
    const toScreenY = (y: number): number =>
      PLOT_HEIGHT - ((y - result.yMin) / (result.yMax - result.yMin)) * PLOT_HEIGHT;

    // Axes, drawn only where they fall inside the visible range.
    if (xMin < 0 && xMax > 0) {
      const axis = doc.createElementNS(svgNs, "line");
      axis.setAttribute("x1", String(toScreenX(0)));
      axis.setAttribute("x2", String(toScreenX(0)));
      axis.setAttribute("y1", "0");
      axis.setAttribute("y2", String(PLOT_HEIGHT));
      axis.setAttribute("class", "plot-axis");
      graphSvg.append(axis);
    }
    if (result.yMin < 0 && result.yMax > 0) {
      const axis = doc.createElementNS(svgNs, "line");
      axis.setAttribute("x1", "0");
      axis.setAttribute("x2", String(PLOT_WIDTH));
      axis.setAttribute("y1", String(toScreenY(0)));
      axis.setAttribute("y2", String(toScreenY(0)));
      axis.setAttribute("class", "plot-axis");
      graphSvg.append(axis);
    }

    for (const segment of result.segments) {
      const path = doc.createElementNS(svgNs, "path");
      const d = segment
        .map((point, index) =>
          `${index === 0 ? "M" : "L"}${toScreenX(point.x).toFixed(2)} ${toScreenY(point.y).toFixed(2)}`
        )
        .join(" ");
      path.setAttribute("d", d);
      path.setAttribute("class", "plot-line");
      graphSvg.append(path);
    }

    const marker = doc.createElementNS(svgNs, "circle");
    marker.setAttribute("r", "3.5");
    marker.setAttribute("class", "plot-marker");
    marker.setAttribute("data-graph-marker", "");
    marker.setAttribute("visibility", "hidden");
    graphSvg.append(marker);

    if (graphReadout) graphReadout.textContent = "";
  }

  function traceAt(ratio: number): void {
    if (!graphSvg || !lastPlot || lastPlot.segments.length === 0) return;

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

    const marker = graphSvg.querySelector("[data-graph-marker]");
    if (marker) {
      const screenX = ((nearest.x - xMin) / (xMax - xMin)) * PLOT_WIDTH;
      const screenY =
        PLOT_HEIGHT -
        ((nearest.y - lastPlot.yMin) / (lastPlot.yMax - lastPlot.yMin)) * PLOT_HEIGHT;
      marker.setAttribute("cx", screenX.toFixed(2));
      marker.setAttribute("cy", screenY.toFixed(2));
      marker.setAttribute("visibility", "visible");
    }
    if (graphReadout) {
      graphReadout.textContent = `x = ${trim(nearest.x)}   ƒ(x) = ${trim(nearest.y)}`;
    }
  }

  graphSvg?.addEventListener("pointermove", (event) => {
    const bounds = graphSvg.getBoundingClientRect();
    if (bounds.width === 0) return;
    traceAt((event.clientX - bounds.left) / bounds.width);
  });
  graphSvg?.addEventListener("pointerleave", () => {
    graphSvg.querySelector("[data-graph-marker]")?.setAttribute("visibility", "hidden");
    if (graphReadout) graphReadout.textContent = "";
  });

  graphInput?.addEventListener("input", renderGraph);
  graphMin?.addEventListener("input", renderGraph);
  graphMax?.addEventListener("input", renderGraph);
  on("[data-graph-example]", (button) => {
    if (graphInput) graphInput.value = button.dataset["graphExample"] ?? "";
    renderGraph();
  });

  updateDisplay();

  return {
    calculator,
    destroy: () => doc.removeEventListener("keydown", handleKeydown),
  };
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

/** Short, readable numbers for the trace readout. */
function trim(value: number): string {
  return parseFloat(value.toPrecision(4)).toString();
}

// Only run against a real page; importing this module in a test must not
// require a document to already be sitting there.
if (typeof document !== "undefined" && document.querySelector(".calculator-grid")) {
  setupCalculator(document);
}
