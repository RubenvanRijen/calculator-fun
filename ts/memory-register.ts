import { roundResult } from "./format.js";

/** The M register behind the MC / MR / M+ / M- keys. */
export class MemoryRegister {
  #value = 0;

  get value(): number {
    return this.#value;
  }

  set value(next: number) {
    this.#value = next;
  }

  /** Whether the display should show its "M" indicator. */
  get isEmpty(): boolean {
    return this.#value === 0;
  }

  add(amount: number): void {
    this.#value = roundResult(this.#value + amount);
  }

  subtract(amount: number): void {
    this.#value = roundResult(this.#value - amount);
  }

  clear(): void {
    this.#value = 0;
  }
}
