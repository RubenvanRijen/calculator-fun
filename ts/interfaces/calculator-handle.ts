import type { Calculator } from "../calculator.js";

/** What `setupCalculator` hands back, so a caller can also tear it down. */
export interface CalculatorHandle {
  readonly calculator: Calculator;
  /** Remove the document-level key listener. Tests rely on this. */
  destroy(): void;
}
