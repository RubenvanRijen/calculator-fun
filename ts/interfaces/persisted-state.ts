import type { HistoryEntry } from "@/interfaces/history-entry.ts";
import type { Theme } from "@/types/theme.ts";
import type { AngleMode } from "@/types/angle-mode.ts";
import type { RegisterName } from "@/types/register-name.ts";
import type { StatRow } from "@/interfaces/stat-row.ts";
import type { Matrix } from "@/types/matrix.ts";
import type { MatrixName } from "@/types/matrix-name.ts";

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
  /** Values stored under A, B, C and D. */
  readonly registers: Readonly<Partial<Record<RegisterName, number>>>;
  /** The rows of the statistics lists. */
  readonly lists: readonly StatRow[];
  /** The two matrices, A and B. */
  readonly matrices: Readonly<Partial<Record<MatrixName, Matrix>>>;
}
