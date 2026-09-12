import type { HistoryEntry } from "@/interfaces/history-entry.ts";

/** How many past calculations to keep. Oldest are dropped beyond this. */
const MAX_HISTORY = 50;

/** The list of completed calculations, newest first and capped. */
export class HistoryLog {
  #entries: HistoryEntry[] = [];

  get entries(): readonly HistoryEntry[] {
    return this.#entries;
  }

  add(expression: string, result: string, recall: string = result): void {
    // Re-running the same sum should not stack identical rows; the recall list
    // behaves the same way.
    const newest = this.#entries[0];
    if (newest?.expression === expression && newest.result === result) return;

    this.#entries.unshift({ expression, result, recall });
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
