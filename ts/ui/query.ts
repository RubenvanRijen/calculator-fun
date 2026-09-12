/**
 * Look inside one panel's markup.
 *
 * Five panels had written this closure out identically -- the generic, the
 * `| null`, the lot -- which is four copies too many of a decision made once.
 *
 * It does not isolate anything, and should not be read as doing so: in the
 * running page every panel is handed the whole document, and what keeps them
 * out of each other's markup is that no two panels share a data attribute.
 * The root is a parameter so a test can hand a panel a container of its own,
 * and so nothing here reaches for a global document.
 *
 * Defaulting to HTMLElement rather than requiring it is what lets the same
 * call find the graph's `<svg>`, which is an Element and not an HTMLElement.
 * Those lookups used to be written out longhand beside the closure that could
 * not express them -- two spellings of one lookup, on adjacent lines of the
 * same file. The type argument asserts rather than checks, as it did in every
 * one of those five copies: it says what the markup holds, and the markup is
 * what has to be right.
 */
export function queryIn(root: Document | HTMLElement) {
  return <T extends Element = HTMLElement>(selector: string): T | null =>
    root.querySelector<T>(selector);
}
