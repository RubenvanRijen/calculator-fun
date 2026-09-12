import type { AngleMode } from "../types/angle-mode.js";

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
}
