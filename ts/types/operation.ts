/**
 * The binary operations the calculator understands. Division uses the "÷"
 * character, because that is what the button in index.html renders.
 *
 * nCr and nPr are infix here, as they are on the reference hardware -- "5 nCr
 * 2" rather than "nCr(5, 2)" -- which is what lets the parser stay free of
 * multi-argument functions and the comma that would need.
 */
export type Operation = "+" | "-" | "*" | "÷" | "^" | "nCr" | "nPr";
