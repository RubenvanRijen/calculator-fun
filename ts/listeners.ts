/**
 * A list of callbacks that come off together.
 *
 * Three stores -- the Y expressions, the statistics lists and the matrices --
 * each need a way to tell their views something changed, and each needs those
 * subscriptions to come off with the one AbortController the page is torn down
 * by. Held rather than inherited: the three stores have nothing else in common,
 * and a base class would make identical plumbing look like a shared kind of
 * thing.
 */
export class Listeners {
  readonly #listeners: (() => void)[] = [];

  /**
   * Run `listener` on every notify, until `signal` aborts.
   *
   * The signal is not optional. Every listener in the UI is registered against
   * the one controller so tearing down is a single abort; a subscription that
   * outlived it would hold a destroyed panel's render closure, and with it the
   * markup that panel was drawing into.
   */
  add(listener: () => void, signal: AbortSignal): void {
    if (signal.aborted) return;
    this.#listeners.push(listener);

    signal.addEventListener("abort", () => {
      const at = this.#listeners.indexOf(listener);
      if (at !== -1) this.#listeners.splice(at, 1);
    }, { once: true });
  }

  notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
