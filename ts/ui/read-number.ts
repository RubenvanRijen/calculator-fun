/**
 * Read a number out of a field, falling back when there is nothing usable.
 *
 * An emptied <input type="number"> reads as "", not null, so `??` would never
 * reach the fallback and Number("") would silently become 0 -- which for a
 * graph range or a table step is a number nobody typed.
 */
export function readNumber(input: HTMLInputElement | null, fallback: number): number {
  const raw = input?.value.trim();
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
