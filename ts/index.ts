import { Calculator, isOperation } from "./calculator.js";
import type { HistoryEntry } from "./interfaces/history-entry.js";
import type { CalculatorHandle } from "./interfaces/calculator-handle.js";

/** How long a key flashes when driven from the keyboard. */
const FLASH_MS = 120;

/**
 * Bind a calculator to the buttons and display inside `root`.
 * Exported so the wiring itself can be tested against a jsdom document.
 */
export function setupCalculator(root: Document | HTMLElement): CalculatorHandle {
  const doc = root instanceof Document ? root : root.ownerDocument;

  const numberButtons = root.querySelectorAll<HTMLElement>("[data-number]");
  const operationButtons = root.querySelectorAll<HTMLElement>("[data-operation]");
  const memoryButtons = root.querySelectorAll<HTMLElement>("[data-memory]");
  const equalsButton = root.querySelector<HTMLElement>("[data-equals]");
  const deleteButton = root.querySelector<HTMLElement>("[data-delete]");
  const allClearButton = root.querySelector<HTMLElement>("[data-all-clear]");
  const signButton = root.querySelector<HTMLElement>("[data-sign]");
  const percentButton = root.querySelector<HTMLElement>("[data-percent]");
  const historyClearButton = root.querySelector<HTMLElement>("[data-history-clear]");

  const previousOperandTextElement = root.querySelector<HTMLElement>(
    "[data-previous-operand]"
  );
  const currentOperandTextElement = root.querySelector<HTMLElement>(
    "[data-current-operand]"
  );
  const errorElement = root.querySelector<HTMLElement>("[data-error]");
  const memoryIndicator = root.querySelector<HTMLElement>("[data-memory-indicator]");
  const historyList = root.querySelector<HTMLElement>("[data-history-list]");
  const historyEmpty = root.querySelector<HTMLElement>("[data-history-empty]");

  // strictNullChecks makes these `HTMLElement | null`, so the missing-markup
  // case has to be dealt with rather than blowing up later on `.textContent`.
  if (!previousOperandTextElement || !currentOperandTextElement) {
    throw new Error(
      "Calculator markup is missing [data-previous-operand] or [data-current-operand]."
    );
  }

  const calculator = new Calculator();

  /** Label -> button, so a keypress can flash the key it corresponds to. */
  const buttonsByLabel = new Map<string, HTMLElement>();
  for (const button of root.querySelectorAll<HTMLElement>("button")) {
    const label = button.textContent?.trim();
    if (label && !buttonsByLabel.has(label)) buttonsByLabel.set(label, button);
  }

  const updateDisplay = (): void => {
    currentOperandTextElement.textContent = calculator.currentDisplay;
    previousOperandTextElement.textContent = calculator.previousDisplay;

    if (errorElement) {
      errorElement.textContent = calculator.error ?? "";
      errorElement.hidden = calculator.error === null;
    }
    if (memoryIndicator) {
      memoryIndicator.hidden = !calculator.hasMemory;
    }
    renderHistory();
  };

  function renderHistory(): void {
    if (!historyList) return;

    const entries = calculator.history;
    if (historyEmpty) historyEmpty.hidden = entries.length > 0;

    historyList.replaceChildren(
      ...entries.map((entry) => renderHistoryEntry(entry))
    );
  }

  function renderHistoryEntry(entry: HistoryEntry): HTMLElement {
    const item = doc.createElement("li");

    // A button, not a bare <li>, so the entry is reachable by keyboard too.
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "history-entry";
    button.dataset["result"] = entry.result;

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

  numberButtons.forEach((button) => {
    button.addEventListener("click", () => {
      calculator.appendNumber(button.textContent ?? "");
      updateDisplay();
    });
  });

  operationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const operation = button.textContent ?? "";
      if (!isOperation(operation)) return;
      calculator.chooseOperation(operation);
      updateDisplay();
    });
  });

  memoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset["memory"]) {
        case "add":
          calculator.memoryAdd();
          break;
        case "subtract":
          calculator.memorySubtract();
          break;
        case "recall":
          calculator.memoryRecall();
          break;
        case "clear":
          calculator.memoryClear();
          break;
        default:
          return;
      }
      updateDisplay();
    });
  });

  equalsButton?.addEventListener("click", () => {
    calculator.compute();
    updateDisplay();
  });

  allClearButton?.addEventListener("click", () => {
    calculator.clear();
    updateDisplay();
  });

  deleteButton?.addEventListener("click", () => {
    calculator.delete();
    updateDisplay();
  });

  signButton?.addEventListener("click", () => {
    calculator.toggleSign();
    updateDisplay();
  });

  percentButton?.addEventListener("click", () => {
    calculator.percent();
    updateDisplay();
  });

  historyClearButton?.addEventListener("click", () => {
    calculator.clearHistory();
    updateDisplay();
  });

  /**
   * Map a keypress onto the same actions the buttons perform. Returns the
   * label of the key that was driven, or null when the press is not ours.
   */
  function applyKey(key: string): string | null {
    if (/^[0-9]$/.test(key) || key === ".") {
      calculator.appendNumber(key);
      return key;
    }
    // "/" is what a keyboard offers; the button is labelled "÷".
    const operation = key === "/" ? "÷" : key;
    if (isOperation(operation)) {
      calculator.chooseOperation(operation);
      return operation;
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
      default:
        return null;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    // A focused button handles Enter and Space itself; intercepting here would
    // fire the action twice.
    const active = doc.activeElement;
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

  updateDisplay();

  return {
    calculator,
    destroy: () => doc.removeEventListener("keydown", handleKeydown),
  };
}

// Only run against a real page; importing this module in a test must not
// require a document to already be sitting there.
if (typeof document !== "undefined" && document.querySelector(".calculator-grid")) {
  setupCalculator(document);
}
