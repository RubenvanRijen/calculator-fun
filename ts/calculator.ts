import type { Operation } from "./types/operation.js";
import type { HistoryEntry } from "./interfaces/history-entry.js";

const OPERATIONS = ["+", "-", "*", "÷"] as const satisfies readonly Operation[];

/** Narrow an arbitrary string to one of the four supported operations. */
export function isOperation(value: string): value is Operation {
  return (OPERATIONS as readonly string[]).includes(value);
}

/** How many past calculations to keep. Oldest are dropped beyond this. */
const MAX_HISTORY = 50;

/**
 * Binary floating point makes 0.1 + 0.2 come out as 0.30000000000000004.
 * Twelve significant digits is well inside a double's ~15-17 digits of
 * precision, so this trims the noise without changing any honest result.
 */
function roundResult(value: number): number {
  if (!Number.isFinite(value)) return value;
  return parseFloat(value.toPrecision(12));
}

/**
 * The calculator's state machine. It holds no reference to the DOM, so it can
 * be driven straight from a test; index.ts is what binds it to the buttons.
 */
export class Calculator {
  currentOperand = "";
  previousOperand = "";
  operation: Operation | undefined = undefined;

  /**
   * Set when the last action could not be completed, e.g. dividing by zero.
   * The DOM layer renders it; the next keypress clears it.
   */
  error: string | null = null;

  /** The memory register, as used by the MC/MR/M+/M- keys. */
  memory = 0;

  #history: HistoryEntry[] = [];

  /** Past calculations, most recent first. */
  get history(): readonly HistoryEntry[] {
    return this.#history;
  }

  /** Whether the display should show its "M" indicator. */
  get hasMemory(): boolean {
    return this.memory !== 0;
  }

  /** Reset the current entry. Memory and history deliberately survive. */
  clear(): void {
    this.currentOperand = "";
    this.previousOperand = "";
    this.operation = undefined;
    this.error = null;
  }

  /** Remove the last character of the current operand. */
  delete(): void {
    this.error = null;
    this.currentOperand = this.currentOperand.slice(0, -1);
  }

  /** Append a digit or the decimal point to the current operand. */
  appendNumber(number: string): void {
    this.error = null;
    if (number === "." && this.currentOperand.includes(".")) return;
    this.currentOperand = `${this.currentOperand}${number}`;
  }

  /** Load a value straight into the display, as MR and history clicks do. */
  recall(value: string): void {
    this.error = null;
    this.currentOperand = value;
  }

  /**
   * Select an operation, computing any pending one first so that chains such
   * as 1 + 2 + 3 fold as they are typed.
   */
  chooseOperation(operation: Operation): void {
    this.error = null;
    if (this.currentOperand === "") return;
    if (this.previousOperand !== "") {
      this.compute();
      if (this.error !== null) return;
    }
    this.operation = operation;
    this.previousOperand = this.currentOperand;
    this.currentOperand = "";
  }

  /** Flip the sign of the current operand. */
  toggleSign(): void {
    this.error = null;
    if (this.currentOperand === "") return;
    this.currentOperand = this.currentOperand.startsWith("-")
      ? this.currentOperand.slice(1)
      : `-${this.currentOperand}`;
  }

  /**
   * Convert the current operand to a percentage. Inside a pending + or -, it
   * is read as "percent of the first operand", so 50 + 10 % is 55 rather than
   * 50.1 -- which is how a physical calculator behaves. For * and ÷ there is
   * no sensible base, so it is a plain division by 100.
   */
  percent(): void {
    this.error = null;
    if (this.currentOperand === "") return;

    const current = parseFloat(this.currentOperand);
    if (isNaN(current)) return;

    const base = parseFloat(this.previousOperand);
    const isRelative =
      (this.operation === "+" || this.operation === "-") && !isNaN(base);

    const value = isRelative ? (base * current) / 100 : current / 100;
    this.currentOperand = roundResult(value).toString();
  }

  /** Add the displayed value to memory. */
  memoryAdd(): void {
    const value = this.#currentValue();
    if (value === null) return;
    this.error = null;
    this.memory = roundResult(this.memory + value);
  }

  /** Subtract the displayed value from memory. */
  memorySubtract(): void {
    const value = this.#currentValue();
    if (value === null) return;
    this.error = null;
    this.memory = roundResult(this.memory - value);
  }

  /** Copy memory into the display. */
  memoryRecall(): void {
    this.recall(this.memory.toString());
  }

  /** Empty the memory register. */
  memoryClear(): void {
    this.memory = 0;
  }

  /** Empty the history panel. */
  clearHistory(): void {
    this.#history = [];
  }

  /**
   * Apply the selected operation to the two operands. Leaves state untouched
   * when there is nothing to compute, or sets `error` when the sum is
   * impossible. A successful sum is recorded in the history.
   */
  compute(): void {
    this.error = null;

    let computation: number;
    const prev = parseFloat(this.previousOperand);
    const current = parseFloat(this.currentOperand);

    if (isNaN(prev) || isNaN(current)) return;

    switch (this.operation) {
      case "+":
        computation = prev + current;
        break;
      case "-":
        computation = prev - current;
        break;
      case "*":
        computation = prev * current;
        break;
      case "÷":
        if (current === 0) {
          this.error = "Cannot divide by zero";
          return;
        }
        computation = prev / current;
        break;
      default:
        return;
    }

    const expression = `${formatOperand(this.previousOperand)} ${this.operation} ${formatOperand(this.currentOperand)}`;

    this.currentOperand = roundResult(computation).toString();
    this.operation = undefined;
    this.previousOperand = "";

    this.#history.unshift({ expression, result: this.currentOperand });
    if (this.#history.length > MAX_HISTORY) this.#history.length = MAX_HISTORY;
  }

  /** The current operand, grouped with thousands separators, for display. */
  get currentDisplay(): string {
    return formatOperand(this.currentOperand);
  }

  /** The pending "12,345 +" line above the current operand, if any. */
  get previousDisplay(): string {
    if (this.operation === undefined) return "";
    return `${formatOperand(this.previousOperand)} ${this.operation}`;
  }

  /** The displayed number, or null when there is not a usable one. */
  #currentValue(): number | null {
    if (this.currentOperand === "") return null;
    const value = parseFloat(this.currentOperand);
    return isNaN(value) ? null : value;
  }
}

/**
 * Format an operand for display: group the integer part with thousands
 * separators while leaving the decimal part exactly as the user typed it, so
 * that a trailing "." or "50" is not swallowed mid-entry.
 */
export function formatOperand(operand: string): string {
  if (operand === "") return "";

  // noUncheckedIndexedAccess types both halves as `string | undefined`, which
  // is what lets the trailing-decimal case below be handled honestly.
  const [integerPart, decimalPart] = operand.split(".");
  const integerDigits = parseFloat(integerPart ?? "");
  const integerDisplay = isNaN(integerDigits)
    ? ""
    : integerDigits.toLocaleString("en", { maximumFractionDigits: 0 });

  return decimalPart === undefined
    ? integerDisplay
    : `${integerDisplay}.${decimalPart}`;
}
