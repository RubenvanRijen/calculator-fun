/**
 * The operations the calculator understands. Note that division uses the
 * "÷" character, because that is what the button in index.html renders.
 */
export type Operation = "+" | "-" | "*" | "÷";

const OPERATIONS = ["+", "-", "*", "÷"] as const satisfies readonly Operation[];

/** Narrow an arbitrary string to one of the four supported operations. */
export function isOperation(value: string): value is Operation {
  return (OPERATIONS as readonly string[]).includes(value);
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
   * The DOM layer reports it; clearing or starting a new entry resets it.
   */
  error: string | null = null;

  /** Reset every entry back to the starting state. */
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

  /**
   * Apply the selected operation to the two operands. Leaves state untouched
   * when there is nothing to compute, or sets `error` when the sum is
   * impossible.
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
          this.error = "Cannot divide by zero.";
          return;
        }
        computation = prev / current;
        break;
      default:
        return;
    }

    this.currentOperand = computation.toString();
    this.operation = undefined;
    this.previousOperand = "";
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
