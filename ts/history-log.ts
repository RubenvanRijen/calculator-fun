import type { HistoryEntry } from "./interfaces/history-entry.js";

/** How many past calculations to keep. Oldest are dropped beyond this. */
const MAX_HISTORY = 50;

/** The list of completed calculations, newest first and capped. */
export class HistoryLog {
  #entries: HistoryEntry[] = [];

  get entries(): readonly HistoryEntry[] {
    return this.#entries;
  }

  add(expression: string, result: string): void {
    this.#entries.unshift({ expression, result });
    if (this.#entries.length > MAX_HISTORY) this.#entries.length = MAX_HISTORY;
  }

  /** Bring back entries from a previous visit, capped the same way. */
  restore(entries: readonly HistoryEntry[]): void {
    this.#entries = [...entries].slice(0, MAX_HISTORY);
  }

  clear(): void {
    this.#entries = [];
  }
}
