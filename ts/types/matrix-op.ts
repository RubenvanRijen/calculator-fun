/**
 * The operations the Matrix tab offers.
 *
 * The operand is part of the name for the ones that take only one matrix,
 * because the buttons are per-operand: there is a "det A" key and a "det B"
 * key, not a "det" key and a way of saying which.
 */
export type MatrixOp =
  | "add"
  | "subtract"
  | "multiply"
  | "transpose-A"
  | "transpose-B"
  | "determinant-A"
  | "determinant-B"
  | "inverse-A"
  | "inverse-B";
