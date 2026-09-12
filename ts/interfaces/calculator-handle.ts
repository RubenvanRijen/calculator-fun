import type { Calculator } from "@/calculator.ts";

/** What `setupCalculator` hands back, so a caller can also tear it down. */
export interface CalculatorHandle {
  readonly calculator: Calculator;
  /** Every action name the keypad may reference, for markup verification. */
  readonly actionNames: ReadonlySet<string>;
  /** Remove the document-level key listener. Tests rely on this. */
  destroy(): void;
}
