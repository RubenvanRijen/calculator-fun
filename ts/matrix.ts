import type { Matrix } from "@/types/matrix.ts";

/**
 * Matrix arithmetic.
 *
 * Plain numbers in and out, with no DOM and no parser: matrices do not enter
 * the expression engine, they are worked on in their own panel.
 *
 * Every operation that cannot be done throws with a message saying why, rather
 * than returning a number that is not an answer. A singular matrix has no
 * inverse, and producing one full of infinities would be worse than saying so.
 */

/**
 * How many rows and columns, refusing anything that is not rectangular.
 *
 * Every operation measures its arguments through here, so a ragged grid is
 * turned away once rather than quietly producing an answer: without the check
 * `add([[1,2],[3]], [[1,2],[3,4]])` agrees the shapes match, because only the
 * first row was ever measured, and hands back a ragged sum.
 */
export function shape(matrix: Matrix): { rows: number; columns: number } {
  const columns = matrix[0]?.length ?? 0;
  if (matrix.some((row) => row.length !== columns)) {
    throw new Error("Every row of a matrix must be the same length");
  }
  return { rows: matrix.length, columns };
}

/** One entry, with the bounds check the index signature demands. */
function at(matrix: Matrix, row: number, column: number): number {
  return matrix[row]?.[column] ?? 0;
}

function sameShape(a: Matrix, b: Matrix): boolean {
  const first = shape(a);
  const second = shape(b);
  return first.rows === second.rows && first.columns === second.columns;
}

/** A mutable copy, for the algorithms that work in place. */
function copy(matrix: Matrix): number[][] {
  return matrix.map((row) => [...row]);
}

export function add(a: Matrix, b: Matrix): Matrix {
  if (!sameShape(a, b)) throw new Error("Matrices must be the same size to add");
  return a.map((row, index) => row.map((value, column) => value + at(b, index, column)));
}

export function subtract(a: Matrix, b: Matrix): Matrix {
  if (!sameShape(a, b)) throw new Error("Matrices must be the same size to subtract");
  return a.map((row, index) => row.map((value, column) => value - at(b, index, column)));
}

/**
 * The product, which is only defined when A is as wide as B is tall.
 *
 * The result is as tall as A and as wide as B, so A×B and B×A are different
 * questions with different answers -- and often only one of them has one.
 */
export function multiply(a: Matrix, b: Matrix): Matrix {
  const left = shape(a);
  const right = shape(b);
  if (left.columns !== right.rows) {
    throw new Error("A must have as many columns as B has rows to multiply");
  }

  return Array.from({ length: left.rows }, (_, row) =>
    Array.from({ length: right.columns }, (_, column) => {
      let total = 0;
      for (let index = 0; index < left.columns; index += 1) {
        total += at(a, row, index) * at(b, index, column);
      }
      return total;
    })
  );
}

export function transpose(matrix: Matrix): Matrix {
  const { rows, columns } = shape(matrix);
  return Array.from({ length: columns }, (_, row) =>
    Array.from({ length: rows }, (_, column) => at(matrix, column, row))
  );
}

/** The n by n matrix with ones down the diagonal. */
export function identity(size: number): Matrix {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0))
  );
}

/**
 * The determinant, by fraction-free elimination.
 *
 * Bareiss rather than ordinary LU because every division it performs comes out
 * exact: a matrix of whole numbers gives a whole number back, so a determinant
 * of 6 is 6 and not 5.999999999999998. That matters on a calculator whose
 * whole point is that the answer is the answer.
 */
export function determinant(matrix: Matrix): number {
  const { rows, columns } = shape(matrix);
  if (rows !== columns) throw new Error("Only a square matrix has a determinant");
  if (rows === 0) throw new Error("Only a square matrix has a determinant");

  const working = copy(matrix);
  let sign = 1;
  let previous = 1;

  for (let pivot = 0; pivot < rows - 1; pivot += 1) {
    if ((working[pivot]?.[pivot] ?? 0) === 0) {
      const swap = working.findIndex(
        (row, index) => index > pivot && (row[pivot] ?? 0) !== 0
      );
      // A column of zeros below the pivot leaves the determinant at zero.
      if (swap === -1) return 0;

      const here = working[pivot];
      const there = working[swap];
      if (here !== undefined && there !== undefined) {
        working[pivot] = there;
        working[swap] = here;
      }
      sign = -sign;
    }

    for (let row = pivot + 1; row < rows; row += 1) {
      for (let column = pivot + 1; column < columns; column += 1) {
        const value =
          (at(working, row, column) * at(working, pivot, pivot) -
            at(working, row, pivot) * at(working, pivot, column)) /
          previous;
        const target = working[row];
        if (target !== undefined) target[column] = value;
      }
    }
    previous = at(working, pivot, pivot);
  }

  const value = sign * at(working, rows - 1, columns - 1);
  // A sign flip on a zero leaves -0, which would print as "-0".
  return value === 0 ? 0 : value;
}

/**
 * The inverse, by Gauss-Jordan elimination with partial pivoting.
 *
 * A pivot is treated as zero when it is negligible beside the largest entry
 * the matrix started with. An absolute threshold would call a matrix of
 * millionths singular, and a matrix of millions invertible when it is not.
 */
export function inverse(matrix: Matrix): Matrix {
  const { rows, columns } = shape(matrix);
  if (rows !== columns) throw new Error("Only a square matrix has an inverse");
  if (rows === 0) throw new Error("Only a square matrix has an inverse");

  const working = copy(matrix);
  const result = copy(identity(rows));

  // No floor under this. Clamping the scale to 1 would make the threshold
  // absolute for every matrix of entries smaller than 1 -- which is the exact
  // thing it exists to avoid. A matrix of zeros gives a scale of zero, and a
  // pivot of zero is still caught, because zero is not greater than zero.
  for (let pivot = 0; pivot < rows; pivot += 1) {
    // Pivot on the largest remaining entry in the column, which keeps the
    // division from magnifying whatever error is already there.
    let best = pivot;
    for (let row = pivot + 1; row < rows; row += 1) {
      if (Math.abs(at(working, row, pivot)) > Math.abs(at(working, best, pivot))) {
        best = row;
      }
    }

    if (best !== pivot) {
      for (const grid of [working, result]) {
        const here = grid[pivot];
        const there = grid[best];
        if (here !== undefined && there !== undefined) {
          grid[pivot] = there;
          grid[best] = here;
        }
      }
    }

    // Measured against the pivot's own row, not against the whole matrix.
    // Comparing with the largest entry anywhere turns [[1e12, 0], [0, 1]]
    // away as singular -- a matrix whose inverse is exactly representable,
    // and whose determinant this same module reports as 1e12. A row of zeros
    // gives a scale of zero, and a pivot of zero is still caught, because
    // zero is not greater than zero.
    const rowScale = Math.max(
      ...(working[pivot] ?? []).map((value) => Math.abs(value))
    );
    if (Math.abs(at(working, pivot, pivot)) <= rowScale * 1e-12) {
      throw new Error("Matrix is singular, so it has no inverse");
    }

    const divisor = at(working, pivot, pivot);
    for (let column = 0; column < columns; column += 1) {
      const left = working[pivot];
      const right = result[pivot];
      if (left !== undefined) left[column] = at(working, pivot, column) / divisor;
      if (right !== undefined) right[column] = at(result, pivot, column) / divisor;
    }

    for (let row = 0; row < rows; row += 1) {
      if (row === pivot) continue;
      const factor = at(working, row, pivot);
      if (factor === 0) continue;

      for (let column = 0; column < columns; column += 1) {
        const left = working[row];
        const right = result[row];
        if (left !== undefined) {
          left[column] = at(working, row, column) - factor * at(working, pivot, column);
        }
        if (right !== undefined) {
          right[column] = at(result, row, column) - factor * at(result, pivot, column);
        }
      }
    }
  }

  return result;
}
