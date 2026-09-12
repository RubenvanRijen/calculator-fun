import type { PersistedState } from "@/interfaces/persisted-state.ts";
import type { HistoryEntry } from "@/interfaces/history-entry.ts";
import type { Theme } from "@/types/theme.ts";
import type { AngleMode } from "@/types/angle-mode.ts";
import type { RegisterName } from "@/types/register-name.ts";
import type { StatRow } from "@/interfaces/stat-row.ts";
import { REGISTER_NAMES } from "@/expression.ts";
import { MATRIX_NAMES } from "@/matrices.ts";
import type { Matrix } from "@/types/matrix.ts";
import type { MatrixName } from "@/types/matrix-name.ts";

const STORAGE_KEY = "calculator-fun.state";

/**
 * localStorage can be missing, full, or throw outright in a private window,
 * so every access is guarded and failure simply means "no saved state".
 */
function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

const MODES: Readonly<Record<AngleMode, true>> = { deg: true, rad: true, grad: true };

/**
 * Every angle mode, so a saved one is recognised by being in the list rather
 * than by being compared against three names written out here.
 *
 * Membership is tested against the list, not with `in`: every object has a
 * "toString", and a saved state saying so should not be taken for a mode.
 */
const ANGLE_MODES: readonly AngleMode[] = Object.keys(MODES) as AngleMode[];

/** Read saved state, ignoring anything malformed. */
export function loadState(storage: Storage | null = safeStorage()): Partial<PersistedState> {
  if (storage === null) return {};

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw === null) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const record = parsed as Record<string, unknown>;
    const state: {
      history?: HistoryEntry[];
      memory?: number;
      theme?: Theme;
      angleMode?: AngleMode;
      lastAnswer?: number | null;
      entries?: string[];
      registers?: Partial<Record<RegisterName, number>>;
      lists?: StatRow[];
      matrices?: Partial<Record<MatrixName, Matrix>>;
    } = {};

    if (Array.isArray(record["history"])) {
      state.history = record["history"]
        .filter(isValidHistoryEntry)
        .map((entry) => ({
          expression: entry.expression,
          result: entry.result,
          // Entries saved before recall existed fall back to the shown value.
          recall: typeof entry.recall === "string" && entry.recall !== ""
            ? entry.recall
            : entry.result,
        }));
    }
    if (typeof record["memory"] === "number" && Number.isFinite(record["memory"])) {
      state.memory = record["memory"];
    }
    if (record["theme"] === "light" || record["theme"] === "dark") {
      state.theme = record["theme"];
    }
    const mode = record["angleMode"];
    if (ANGLE_MODES.some((known) => known === mode)) {
      state.angleMode = mode as AngleMode;
    }
    if (record["lastAnswer"] === null) {
      state.lastAnswer = null;
    } else if (
      typeof record["lastAnswer"] === "number" &&
      Number.isFinite(record["lastAnswer"])
    ) {
      state.lastAnswer = record["lastAnswer"];
    }
    const saved = record["registers"];
    if (typeof saved === "object" && saved !== null) {
      const registers: Partial<Record<RegisterName, number>> = {};
      for (const name of REGISTER_NAMES) {
        const value = (saved as Record<string, unknown>)[name];
        if (typeof value === "number" && Number.isFinite(value)) registers[name] = value;
      }
      state.registers = registers;
    }
    if (Array.isArray(record["lists"])) {
      // A cell is a finite number or nothing at all. Anything else saved by a
      // future version, or corrupted in place, reads as an empty cell rather
      // than taking the whole list down with it.
      const cell = (value: unknown): number | null =>
        typeof value === "number" && Number.isFinite(value) ? value : null;

      state.lists = record["lists"]
        .filter((row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null)
        .map((row) => ({ L1: cell(row["L1"]), L2: cell(row["L2"]) }));
    }
    const grids = record["matrices"];
    if (typeof grids === "object" && grids !== null) {
      // A grid is rows of numbers. Anything else -- a ragged array, a string
      // where a number should be -- reads as a zero in that cell rather than
      // taking the matrix down with it.
      const matrices: Partial<Record<MatrixName, Matrix>> = {};
      for (const name of MATRIX_NAMES) {
        const grid = (grids as Record<string, unknown>)[name];
        if (!Array.isArray(grid)) continue;

        matrices[name] = grid
          .filter((row): row is unknown[] => Array.isArray(row))
          .map((row) =>
            row.map((value) =>
              typeof value === "number" && Number.isFinite(value) ? value : 0
            )
          );
      }
      state.matrices = matrices;
    }
    if (Array.isArray(record["entries"])) {
      state.entries = record["entries"].filter(
        (entry): entry is string => typeof entry === "string"
      );
    }
    return state;
  } catch {
    return {};
  }
}

/** Write state, silently doing nothing when storage is unavailable or full. */
export function saveState(
  state: PersistedState,
  storage: Storage | null = safeStorage()
): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A full or blocked quota is not worth breaking the calculator over.
  }
}

/** Forget everything saved. */
export function clearState(storage: Storage | null = safeStorage()): void {
  if (storage === null) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do.
  }
}

function isValidHistoryEntry(
  value: unknown
): value is { expression: string; result: string; recall?: unknown } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["expression"] === "string" && typeof record["result"] === "string"
  );
}
