import { summarise, regress } from "@/stats.ts";
import { LIST_NAMES } from "@/stat-lists.ts";
import type { StatLists } from "@/stat-lists.ts";
import type { OneVarStats } from "@/interfaces/one-var-stats.ts";

/** Enough digits to be useful, few enough to read down a column. */
function figure(value: number | null): string {
  if (value === null) return "—";
  if (!Number.isFinite(value)) return "—";
  return parseFloat(value.toPrecision(8)).toString();
}

/** The rows of the summary, in the order the hardware lists them. */
const SUMMARY_ROWS: readonly { label: string; of: (stats: OneVarStats) => number | null }[] = [
  { label: "n", of: (stats) => stats.count },
  { label: "Σx", of: (stats) => stats.sum },
  { label: "Σx²", of: (stats) => stats.sumOfSquares },
  { label: "x̄", of: (stats) => stats.mean },
  { label: "σ", of: (stats) => stats.populationDeviation },
  { label: "s", of: (stats) => stats.sampleDeviation },
  { label: "min", of: (stats) => stats.min },
  { label: "Q1", of: (stats) => stats.lowerQuartile },
  { label: "med", of: (stats) => stats.median },
  { label: "Q3", of: (stats) => stats.upperQuartile },
  { label: "max", of: (stats) => stats.max },
];

/**
 * The Stats tab: two columns of numbers, what they add up to, and the line
 * through them.
 *
 * The row inputs are written once and then left alone. Rewriting them on every
 * change would fight the person typing: "1." would be rewritten to "1" and the
 * next keystroke would make 15 out of what was going to be 1.5.
 */
export function setupStatsPanel(
  root: Document | HTMLElement,
  doc: Document,
  signal: AbortSignal,
  lists: StatLists,
  /** Hands the scatter and its fit to the graph, and shows it. */
  onPlot: (fit: string) => void
): { render: () => void } {
  const query = <T extends HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);

  const body = root.querySelector<HTMLTableSectionElement>("[data-stats-body]");
  const summary = root.querySelector<HTMLTableSectionElement>("[data-stats-summary]");
  const fitLine = query("[data-stats-fit]");
  const panel = query('[data-panel="stats"]');

  /** Rebuild the editable rows. Only when the shape changes, never on a keystroke. */
  function renderRows(): void {
    if (!body) return;
    body.replaceChildren();

    lists.rows().forEach((row, index) => {
      const tr = doc.createElement("tr");

      const number = doc.createElement("th");
      number.scope = "row";
      number.textContent = String(index + 1);
      tr.append(number);

      for (const name of LIST_NAMES) {
        const td = doc.createElement("td");
        const input = doc.createElement("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.className = "cell-input";
        input.value = row[name] === null ? "" : String(row[name]);
        input.setAttribute("data-stats-cell", name);
        input.setAttribute("data-stats-row", String(index));
        input.setAttribute("aria-label", `${name} row ${index + 1}`);
        td.append(input);
        tr.append(td);
      }

      body.append(tr);
    });
  }

  function summaryCell(text: string): HTMLTableCellElement {
    const td = doc.createElement("td");
    td.textContent = text;
    return td;
  }

  /** The figures and the fit, which do follow every keystroke. */
  function renderSummary(): void {
    if (summary) {
      summary.replaceChildren();
      const columns = LIST_NAMES.map((name) => summarise(lists.column(name)));

      for (const row of SUMMARY_ROWS) {
        const tr = doc.createElement("tr");
        const label = doc.createElement("th");
        label.scope = "row";
        label.textContent = row.label;
        tr.append(label);

        for (const stats of columns) {
          tr.append(summaryCell(stats === null ? "—" : figure(row.of(stats))));
        }
        summary.append(tr);
      }
    }

    if (fitLine) fitLine.textContent = fitText();
  }

  /**
   * The line, or why there isn't one.
   *
   * The two reasons are different things to fix: not enough complete rows, or
   * enough rows that all sit above the same x. Telling someone with five rows
   * that a line needs two rows would send them looking for the wrong problem.
   */
  function fitText(): string {
    const points = lists.pairs();
    const fit = regress(points.map((point) => point.x), points.map((point) => point.y));

    if (fit === null) {
      return points.length < 2
        ? "A line needs two rows with both values."
        : "Every x is the same, so there is no line to fit.";
    }

    const sign = fit.intercept < 0 ? "−" : "+";
    const line = `y = ${figure(fit.slope)}x ${sign} ${figure(Math.abs(fit.intercept))}`;
    return `${line}    r² = ${figure(fit.rSquared)}    r = ${figure(fit.correlation)}`;
  }

  function render(): void {
    // Tabs unhide the panel before asking it to render.
    if (panel?.hidden === true) return;
    renderRows();
    renderSummary();
  }

  /** The fit as something the grapher can parse. */
  function fitExpression(): string | null {
    const points = lists.pairs();
    const fit = regress(points.map((p) => p.x), points.map((p) => p.y));
    if (fit === null) return null;
    const intercept = fit.intercept < 0
      ? `-${Math.abs(fit.intercept)}`
      : `+${fit.intercept}`;
    return `${fit.slope}*x${intercept}`;
  }

  // --- wiring ---------------------------------------------------------------
  /** True only while a change is coming from one of the row inputs. */
  let typing = false;

  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const name = input.dataset["statsCell"];
    if (name !== "L1" && name !== "L2") return;

    const index = Number(input.dataset["statsRow"]);
    const text = input.value.trim();
    const value = text === "" ? null : Number(text);

    // The change is coming out of this very input, so the rows must not be
    // rebuilt underneath the caret.
    typing = true;
    lists.set(name, index, value);
    typing = false;
  }, { signal });

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-stats-action]")
      : null;
    if (button === null) return;

    const action = button.dataset["statsAction"];
    if (action === "add") lists.addRow();
    else if (action === "clear") {
      lists.clear();
      // A cell holding text that is not a number is already empty as far as
      // the model is concerned, so clearing it is not a change and nothing
      // would be redrawn -- leaving the text on screen and the button looking
      // broken.
      renderRows();
      renderSummary();
    }
    else if (action === "plot") {
      const fit = fitExpression();
      if (fit === null) {
        if (fitLine) fitLine.textContent = "Nothing to plot: a line needs two rows with both values.";
        return;
      }
      onPlot(fit);
    }
  }, { signal });

  // The figures follow every edit. The rows are rebuilt for changes that came
  // from anywhere else -- Clear empties the cells, and the inputs would go on
  // showing the old numbers otherwise.
  lists.onChange(() => {
    if (panel?.hidden === true) return;
    if (!typing) renderRows();
    renderSummary();
  }, signal);

  return { render };
}
