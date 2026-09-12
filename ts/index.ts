import { Calculator } from "./calculator.js";
import { loadState, saveState } from "./storage.js";
import { applyTheme, otherTheme, preferredTheme } from "./theme.js";
import { Display } from "./ui/display.js";
import { HistoryPanel } from "./ui/history-panel.js";
import { Keypad } from "./ui/keypad.js";
import { setupGraphPanel } from "./ui/graph-panel.js";
import type { CalculatorHandle } from "./interfaces/calculator-handle.js";
import type { Theme } from "./types/theme.js";

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
  calculator.restore(saved.history ?? [], saved.memory ?? 0);
  calculator.angleMode = saved.angleMode ?? "rad";

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
    });
  };

  // --- the parts ----------------------------------------------------------
  const historyPanel = new HistoryPanel(root, doc, signal, (value) => {
    calculator.recall(value);
    update();
  });

  function update(): void {
    display.render(calculator);
    historyPanel.render(calculator);
    persist();
  }

  const keypad = new Keypad(root, doc, calculator, signal, update);
  const graph = setupGraphPanel(root, doc, signal);

  // Anything clicked outside the keypad -- a tab, a history entry, the theme
  // toggle, a graph chip -- also spends a pending 2nd. Otherwise the shift
  // stays latched across the detour and the next key runs its alternate,
  // which for MC means wiping the history instead of the memory.
  root.addEventListener(
    "click",
    (event) => {
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
  const onShow: Record<string, () => void> = { graph: graph.render };

  for (const tab of tabs) {
    tab.addEventListener(
      "click",
      () => {
        const name = tab.dataset["tab"];
        for (const other of tabs) {
          const active = other === tab;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-selected", String(active));
        }
        for (const panel of panels) {
          panel.hidden = panel.dataset["panel"] !== name;
        }
        if (name !== undefined) onShow[name]?.();
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
