import { Calculator } from "@/calculator.ts";
import { loadState, saveState } from "@/storage.ts";
import { applyTheme, otherTheme, preferredTheme } from "@/theme.ts";
import { Display } from "@/ui/display.ts";
import { HistoryPanel } from "@/ui/history-panel.ts";
import { RegisterPanel } from "@/ui/register-panel.ts";
import { Keypad } from "@/ui/keypad.ts";
import { setupGraphPanel } from "@/ui/graph-panel.ts";
import { setupTablePanel } from "@/ui/table-panel.ts";
import { setupStatsPanel } from "@/ui/stats-panel.ts";
import { StatLists } from "@/stat-lists.ts";
import { setupMatrixPanel } from "@/ui/matrix-panel.ts";
import { MatrixStore } from "@/matrices.ts";
import { FunctionSeries, SERIES_COUNT } from "@/function-series.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";
import type { CalculatorHandle } from "@/interfaces/calculator-handle.ts";
import type { Theme } from "@/types/theme.ts";

/**
 * Wire the pieces together against the markup in `root`. This is a composition
 * root and nothing else: each part below owns its own elements and behaviour,
 * and this function only says how they are connected.
 *
 * Exported so the wiring itself can be tested against a jsdom document.
 */
export function setupCalculator(root: Document | HTMLElement): CalculatorHandle {
  const doc = root instanceof Document ? root : root.ownerDocument;

  // Every listener is registered against this signal, so destroy() is a single
  // abort rather than a list that drifts out of date. `root` and `doc` outlive
  // the markup, so a stale handler would keep writing state to storage.
  const listeners = new AbortController();
  const signal = listeners.signal;

  const calculator = new Calculator();
  const display = new Display(root);

  // --- persistence and theme ----------------------------------------------
  const saved = loadState();
  calculator.restore(saved);
  calculator.angleMode = saved.angleMode ?? "rad";

  // Declared up here because persist() writes it out, and a const used before
  // its line would be a crash waiting for someone to move a call.
  const lists = new StatLists(saved.lists ?? []);
  const matrices = new MatrixStore(saved.matrices ?? {});

  let theme: Theme = saved.theme ?? preferredTheme();
  const themeIcon = root.querySelector<HTMLElement>("[data-theme-icon]");

  const applyCurrentTheme = (): void => {
    applyTheme(theme, doc.documentElement);
    if (themeIcon) themeIcon.textContent = theme === "dark" ? "☀" : "☾";
  };

  const persist = (): void => {
    saveState({
      history: calculator.history,
      memory: calculator.memory,
      theme,
      angleMode: calculator.angleMode,
      lastAnswer: calculator.lastAnswer,
      entries: calculator.entries,
      registers: calculator.registers,
      lists: lists.rows(),
      matrices: { A: matrices.get("A"), B: matrices.get("B") },
    });
  };

  // --- the parts ----------------------------------------------------------
  const historyPanel = new HistoryPanel(root, doc, signal, (value) => {
    calculator.recall(value);
    update();
  });

  const registerPanel = new RegisterPanel(root, doc, signal, calculator, () => update());

  /** What the graph reads besides the expressions themselves. */
  let plottedContext = "";

  function update(): void {
    display.render(calculator);
    historyPanel.render(calculator);
    registerPanel.render();

    // A stored value is part of what "A*x" means, so changing one makes a
    // shaded area the answer to a curve that is no longer on the chart.
    const context = JSON.stringify(graphContext());
    if (context !== plottedContext) {
      plottedContext = context;
      graph.forgetArea();
    }
    // "Ans*x" is plotted and tabulated against the last answer, so pressing =
    // changes what those two panels should be showing. Each render is a no-op
    // while its own panel is hidden, so this costs nothing on the History tab.
    graph.render();
    table.render();
    persist();
  }

  const keypad = new Keypad(root, doc, signal, calculator, update);
  // The graph and the table are two views of one set of functions, so the
  // expressions live outside both of them.
  const series = new FunctionSeries(
    // Keyed by the attribute, the way the panel looks them up. Reading them in
    // document order would put Y3's text into Y2 the day the markup is
    // reordered, and the panel would then disagree with the model.
    Array.from({ length: SERIES_COUNT }, (_, index) =>
      root.querySelector<HTMLInputElement>(`[data-graph-input="${index}"]`)?.value ?? ""
    )
  );
  const graphContext = (): EvalContext => ({
    registers: calculator.registers,
    ans: calculator.lastAnswer ?? undefined,
  });
  const graph = setupGraphPanel(
    root, doc, signal, series, graphContext, () => lists.pairs()
  );
  const table = setupTablePanel(root, doc, signal, series, graphContext);

  const matrixPanel = setupMatrixPanel(root, doc, signal, matrices);

  // No redraw on either: both stores are edited only from their own tab, so
  // the graph is never on screen when they change, and showing it renders it.
  lists.onChange(persist, signal);
  matrices.onChange(persist, signal);

  const stats = setupStatsPanel(root, doc, signal, lists, (fit) => {
    // Fit the window to the data, or the points land off the edge of whatever
    // range was left over from the last thing plotted.
    graph.frameTo(lists.pairs());

    // The fit goes in the first free slot, so a curve already being looked at
    // is not overwritten by pressing plot.
    const free = series.all().findIndex((expression) => expression === "");
    series.set(free === -1 ? SERIES_COUNT - 1 : free, fit);

    graph.showScatter(true);
    showTab("graph");
  });

  // Anything clicked outside the keypad -- a tab, a history entry, the theme
  // toggle, a graph chip -- also spends a pending 2nd. Otherwise the shift
  // stays latched across the detour and the next key runs its alternate,
  // which for MC means wiping the history instead of the memory.
  root.addEventListener(
    "click",
    (event) => {
      // A pointer click leaves focus on whatever button it hit. The keypad
      // clears that for its own keys; without the same treatment here, a click
      // on a history entry, a tab or the theme toggle leaves a button focused
      // and the keyboard handler then hands every Enter to it -- so Enter
      // silently stops computing.
      if (event instanceof MouseEvent && event.detail > 0) {
        const button =
          event.target instanceof Element ? event.target.closest("button") : null;
        button?.blur();
      }

      const inKeypad =
        event.target instanceof Element && event.target.closest("[data-keypad]") !== null;
      if (inKeypad) return;
      if (keypad.spendShift()) update();
    },
    { signal }
  );

  root.querySelector<HTMLElement>("[data-theme-toggle]")?.addEventListener(
    "click",
    () => {
      theme = otherTheme(theme);
      applyCurrentTheme();
      persist();
    },
    { signal }
  );

  root.querySelector<HTMLElement>("[data-history-clear]")?.addEventListener(
    "click",
    () => {
      calculator.clearHistory();
      update();
    },
    { signal }
  );

  // --- tabs ---------------------------------------------------------------
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-tab]")];
  const panels = [...root.querySelectorAll<HTMLElement>("[data-panel]")];
  /** What to do when a panel becomes visible, keyed by its name. */
  const onShow: Record<string, () => void> = {
    graph: graph.render,
    table: table.render,
    stats: stats.render,
    matrix: matrixPanel.render,
  };

  /** Show one tab's panel and hide the rest. */
  function showTab(name: string): void {
    for (const other of tabs) {
      const active = other.dataset["tab"] === name;
      other.classList.toggle("is-active", active);
      other.setAttribute("aria-selected", String(active));
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset["panel"] !== name;
    }
    onShow[name]?.();
  }

  for (const tab of tabs) {
    tab.addEventListener(
      "click",
      () => {
        const name = tab.dataset["tab"];
        if (name !== undefined) showTab(name);
      },
      { signal }
    );
  }

  applyCurrentTheme();
  update();

  return {
    calculator,
    actionNames: keypad.actionNames,
    destroy: () => listeners.abort(),
  };
}

// Only run against a real page; importing this module in a test must not
// require a document to already be sitting there.
if (typeof document !== "undefined" && document.querySelector(".calculator-grid")) {
  setupCalculator(document);
}
