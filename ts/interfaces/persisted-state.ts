import type { HistoryEntry } from "./history-entry.js";
import type { Theme } from "../types/theme.js";
import type { AngleMode } from "../types/angle-mode.js";

/** Everything that survives a page reload. */
export interface PersistedState {
  readonly history: readonly HistoryEntry[];
  readonly memory: number;
  readonly theme: Theme;
  readonly angleMode: AngleMode;
  /** What Ans refers to, so the key still works after a reload. */
  readonly lastAnswer: number | null;
  /** Expressions the up/down arrows walk through. */
  readonly entries: readonly string[];
}
