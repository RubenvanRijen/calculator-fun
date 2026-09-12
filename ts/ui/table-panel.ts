import { compileCurve } from "@/graph.ts";
import { readNumber } from "@/ui/read-number.ts";
import { queryIn } from "@/ui/query.ts";
import type { FunctionSeries } from "@/function-series.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";

/** How many rows the table shows at once. */
const ROW_COUNT = 20;

/** A step of zero would print the same row forever. */
const MIN_STEP = 1e-9;

/**
 * How many digits the x column needs so consecutive rows differ.
 *
 * Eight significant figures is plenty for a y value, but x is an arithmetic
 * sequence: from 100000 in steps of 0.001, eight figures rounds twenty rows to
 * the same "100000". The step says how fine the column has to be.
 */
function xDigits(start: number, step: number): number {
  const largest = Math.abs(start) + Math.abs(step) * ROW_COUNT;
  const magnitude = largest === 0 ? 0 : Math.floor(Math.log10(largest));
  const finest = Math.floor(Math.log10(Math.abs(step)));
  // One spare digit, so a step of 0.001 still shows a rounded-off tail.
  return Math.min(Math.max(magnitude - finest + 2, 8), 21);
}

/**
 * Cell text. Wider than the graph readout's four digits, because a table is
 * read column against column and a truncated value hides the pattern being
 * looked for.
 */
function cell(value: number, digits = 8): string {
  if (Number.isNaN(value)) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
  return parseFloat(value.toPrecision(digits)).toString();
}

/**
 * The table tab: the same functions as the graph, read off as numbers.
 *
 * A column per function that has something in it, a row per step of x. The
 * page of rows moves with the arrows rather than growing without end, so a
 * step of 0.001 does not try to render a million of them.
 */
export function setupTablePanel(
  root: Document | HTMLElement,
  doc: Document,
  signal: AbortSignal,
  series: FunctionSeries,
  /** Supplies stored values, so "A*x" tabulates like it plots. */
  contextOf: () => EvalContext
): { render: () => void } {
  const query = queryIn(root);

  const startInput = query<HTMLInputElement>("[data-table-start]");
  const stepInput = query<HTMLInputElement>("[data-table-step]");
  const head = query<HTMLTableRowElement>("[data-table-head]");
  const body = query<HTMLTableSectionElement>("[data-table-body]");
  const empty = query("[data-table-empty]");
  const panel = query('[data-panel="table"]');

  /** Which page of rows is showing, as a count of rows from the start value. */
  let offset = 0;

  function headerCell(text: string, index: number | null): HTMLTableCellElement {
    const th = doc.createElement("th");
    th.scope = "col";
    th.textContent = text;
    if (index !== null) {
      th.className = "series-label";
      th.setAttribute("data-series-label", String(index));
    }
    return th;
  }

  function render(): void {
    if (!head || !body) return;
    // Tabs unhide the panel before asking it to render, so this only skips the
    // redraws that would land on a panel nobody is looking at.
    if (panel?.hidden === true) return;

    const active = series.active();
    if (empty) empty.hidden = active.length > 0;
    head.replaceChildren();
    body.replaceChildren();
    if (active.length === 0) return;

    head.append(headerCell("x", null));
    for (const entry of active) {
      head.append(headerCell(`Y${entry.index + 1}`, entry.index));
    }

    // Compiled once for the whole table rather than per cell.
    const curves = active.map((entry) => compileCurve(entry.expression, contextOf));

    const start = readNumber(startInput, 0);
    const rawStep = readNumber(stepInput, 1);
    // A step of zero prints one row forever. Anything else the user typed is
    // kept, however small: a tiny step is how a limit gets inspected, and
    // replacing it with 1 would answer a different question in silence.
    //
    // The floor keeps the sign it was given. Taking the magnitude and putting
    // back a positive one turned a step of -1e-12 into +1e-9, so a table asked
    // to count down counted up instead.
    const floor = rawStep < 0 ? -MIN_STEP : MIN_STEP;
    const step = Math.abs(rawStep) < MIN_STEP ? floor : rawStep;
    const digits = xDigits(start, step);

    for (let row = 0; row < ROW_COUNT; row += 1) {
      const x = start + (offset + row) * step;
      const tr = doc.createElement("tr");

      const xCell = doc.createElement("th");
      xCell.scope = "row";
      xCell.textContent = cell(x, digits);
      tr.append(xCell);

      for (const curve of curves) {
        const td = doc.createElement("td");
        if (curve === null) {
          td.textContent = "error";
          td.className = "cell-error";
        } else {
          let y: number;
          try {
            y = curve(x);
          } catch {
            y = NaN;
          }
          td.textContent = cell(y);
        }
        tr.append(td);
      }

      body.append(tr);
    }
  }

  // A change to a function, or to the start or step, redraws from the top:
  // keeping the old page would leave the reader looking at a different part of
  // a different function than the one they just typed.
  series.onChange(() => {
    offset = 0;
    render();
  }, signal);
  for (const input of [startInput, stepInput]) {
    input?.addEventListener("input", () => {
      offset = 0;
      render();
    }, { signal });
  }

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-table-page]")
      : null;
    if (button === null) return;

    const direction = Number(button.dataset["tablePage"]);
    if (!Number.isFinite(direction)) return;
    offset += direction * ROW_COUNT;
    render();
  }, { signal });

  return { render };
}
