import type { PersistedState } from "./interfaces/persisted-state.js";
import type { HistoryEntry } from "./interfaces/history-entry.js";
import type { Theme } from "./types/theme.js";

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
    const state: { history?: HistoryEntry[]; memory?: number; theme?: Theme } = {};

    if (Array.isArray(record["history"])) {
      state.history = record["history"].filter(isHistoryEntry);
    }
    if (typeof record["memory"] === "number" && Number.isFinite(record["memory"])) {
      state.memory = record["memory"];
    }
    if (record["theme"] === "light" || record["theme"] === "dark") {
      state.theme = record["theme"];
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

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["expression"] === "string" && typeof record["result"] === "string"
  );
}
