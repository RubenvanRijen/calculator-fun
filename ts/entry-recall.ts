/** How many past expressions the up/down arrows can walk back through. */
const MAX_ENTRIES = 50;

/**
 * The expressions the up and down arrows walk through, and where in them the
 * user currently is.
 *
 * A list with a cursor, which is what makes it a thing of its own rather than
 * a second HistoryLog: the history is what was worked out, this is what was
 * asked, and only this one has somewhere you can be standing in it.
 */
export class EntryRecall {
  #entries: string[] = [];
  /** Where in #entries the user is; equal to its length when not browsing. */
  #index = 0;

  /** The expressions themselves, oldest first, for persistence. */
  get entries(): readonly string[] {
    return this.#entries;
  }

  get isEmpty(): boolean {
    return this.#entries.length === 0;
  }

  /**
   * Record a computed expression and stop browsing.
   *
   * Consecutive duplicates are skipped, as HistoryLog does for its own rows,
   * so pressing = twice does not fill the list with the same line. The cursor
   * is reset either way: whether or not the expression was worth keeping, the
   * user is no longer part-way up the list.
   */
  add(expression: string): void {
    if (this.#entries[this.#entries.length - 1] !== expression) {
      this.#entries.push(expression);
      if (this.#entries.length > MAX_ENTRIES) this.#entries.shift();
    }
    this.stopBrowsing();
  }

  /** Step back, and return what is now under the cursor. */
  previous(): string | undefined {
    this.#index = Math.max(0, this.#index - 1);
    return this.#entries[this.#index];
  }

  /** Step forward; past the newest entry there is nothing, which clears. */
  next(): string | undefined {
    this.#index = Math.min(this.#entries.length, this.#index + 1);
    return this.#entries[this.#index];
  }

  /**
   * Put the cursor back at the end, keeping every entry.
   *
   * What AC does. Deliberately not the same thing as clear(): the two read
   * alike and mean opposites, and the list surviving AC is the point of the
   * arrows.
   */
  stopBrowsing(): void {
    this.#index = this.#entries.length;
  }

  /** Bring back entries from a previous visit, capped the same way. */
  restore(entries: readonly string[]): void {
    this.#entries = [...entries].slice(-MAX_ENTRIES);
    this.stopBrowsing();
  }

  /** Throw the entries away. What CH does, alongside clearing the history. */
  clear(): void {
    this.#entries = [];
    this.#index = 0;
  }
}
