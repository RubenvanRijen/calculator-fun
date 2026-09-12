import type { AngleMode } from "@/types/angle-mode.ts";
import type { RegisterName } from "@/types/register-name.ts";

/**
 * Everything an expression needs beyond its own tokens. Both fields are
 * optional so a caller can supply only what it cares about; `evaluateRpn`
 * fills in the rest.
 */
export interface EvalContext {
  /** Defaults to radians, which is what the grapher always wants. */
  readonly angleMode?: AngleMode | undefined;
  /** The free variable, supplied per sample by the grapher. */
  readonly x?: number | undefined;
  /** What the Ans token resolves to: the previous result, if there is one. */
  readonly ans?: number | undefined;
  /** Values stored under A, B, C and D. */
  readonly registers?: Readonly<Partial<Record<RegisterName, number>>> | undefined;
}
