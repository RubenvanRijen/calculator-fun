import { add, subtract, multiply, transpose, determinant, inverse } from "@/matrix.ts";
import type { Matrix } from "@/types/matrix.ts";
import type { MatrixName } from "@/types/matrix-name.ts";
import type { MatrixOp } from "@/types/matrix-op.ts";
import type { MatrixOutcome } from "@/types/matrix-outcome.ts";

/** Both grids, so an operation can take whichever ones it needs. */
type Grids = Readonly<Record<MatrixName, Matrix>>;

const matrix = (value: Matrix): MatrixOutcome => ({ kind: "matrix", value });
const scalar = (label: string, value: number): MatrixOutcome =>
  ({ kind: "scalar", label, value });

/**
 * What each button does, as a table rather than a chain of comparisons.
 *
 * Typed as a Record over the operations, so the compiler will not let a new
 * one be added to the union without an entry here -- which is the difference
 * between a missing case being a build error and being a button that looks
 * like it worked because the previous answer is still on screen.
 *
 * Throws what the arithmetic throws; the panel turns that into its message.
 */
const OPERATIONS: Readonly<Record<MatrixOp, (grids: Grids) => MatrixOutcome>> = {
  add: (g) => matrix(add(g.A, g.B)),
  subtract: (g) => matrix(subtract(g.A, g.B)),
  multiply: (g) => matrix(multiply(g.A, g.B)),
  "transpose-A": (g) => matrix(transpose(g.A)),
  "transpose-B": (g) => matrix(transpose(g.B)),
  "determinant-A": (g) => scalar("det A", determinant(g.A)),
  "determinant-B": (g) => scalar("det B", determinant(g.B)),
  "inverse-A": (g) => matrix(inverse(g.A)),
  "inverse-B": (g) => matrix(inverse(g.B)),
};

/** Every operation's name, for checking the markup offers exactly these. */
export const MATRIX_OPS: readonly MatrixOp[] = Object.keys(OPERATIONS) as MatrixOp[];

/**
 * Whether `name` is an operation this panel knows, narrowing it if so.
 *
 * Checked against the list rather than with `in`, which walks the prototype
 * chain: `"toString"` is `in` every object, so it would narrow to a MatrixOp
 * and be called as one -- returning "[object Object]", whose `kind` is
 * undefined, which the panel would render as "undefined = —" and keep
 * rendering on every later edit.
 */
export function isMatrixOp(name: string | undefined): name is MatrixOp {
  return MATRIX_OPS.some((op) => op === name);
}

/** Work one out. Throws what the arithmetic throws. */
export function applyMatrixOp(op: MatrixOp, grids: Grids): MatrixOutcome {
  return OPERATIONS[op](grids);
}
