/**
 * The letters a value can be stored under.
 *
 * E and X are missing on purpose: the tokenizer already reads those as
 * Euler's constant and the graph variable, and a letter cannot mean two
 * things at once.
 */
export type RegisterName = "A" | "B" | "C" | "D";
