import { describe, it, expect } from "vitest";
import {
  add, subtract, multiply, transpose, identity, determinant, inverse, shape,
} from "@/matrix.ts";
import type { Matrix } from "@/types/matrix.ts";

/** Compare allowing for the float error elimination leaves behind. */
const expectClose = (actual: Matrix, expected: Matrix): void => {
  expect(shape(actual)).toEqual(shape(expected));
  actual.forEach((row, index) => {
    row.forEach((value, column) => {
      expect(value).toBeCloseTo(expected[index]?.[column] ?? NaN, 9);
    });
  });
};

describe("shape", () => {
  it("measures a rectangle", () => {
    expect(shape([[1, 2, 3], [4, 5, 6]])).toEqual({ rows: 2, columns: 3 });
  });

  it("measures nothing as nothing", () => {
    expect(shape([])).toEqual({ rows: 0, columns: 0 });
  });
});

describe("add and subtract", () => {
  it("adds entry by entry", () => {
    expect(add([[1, 2], [3, 4]], [[10, 20], [30, 40]])).toEqual([[11, 22], [33, 44]]);
  });

  it("subtracts entry by entry", () => {
    expect(subtract([[10, 20], [30, 40]], [[1, 2], [3, 4]])).toEqual([[9, 18], [27, 36]]);
  });

  it("refuses matrices of different sizes", () => {
    expect(() => add([[1, 2]], [[1], [2]])).toThrow(/same size/);
    expect(() => subtract([[1, 2]], [[1, 2, 3]])).toThrow(/same size/);
  });
});

describe("multiply", () => {
  it("multiplies a row by a column", () => {
    expect(multiply([[1, 2, 3]], [[4], [5], [6]])).toEqual([[32]]);
  });

  it("works the textbook 2 by 2", () => {
    expect(multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]])).toEqual([[19, 22], [43, 50]]);
  });

  it("takes its height from A and its width from B", () => {
    // 3x2 times 2x4 is 3x4.
    const a = [[1, 2], [3, 4], [5, 6]];
    const b = [[1, 2, 3, 4], [5, 6, 7, 8]];
    expect(shape(multiply(a, b))).toEqual({ rows: 3, columns: 4 });
  });

  it("does not commute", () => {
    const a = [[1, 2], [3, 4]];
    const b = [[0, 1], [0, 0]];
    expect(multiply(a, b)).not.toEqual(multiply(b, a));
  });

  it("refuses a mismatch", () => {
    // 2x2 times 3x2 has nothing to pair up.
    expect(() => multiply([[1, 2], [3, 4]], [[1, 2], [3, 4], [5, 6]])).toThrow(/columns/);
  });

  it("leaves a matrix alone when multiplied by the identity", () => {
    const a = [[1, 2], [3, 4]];
    expect(multiply(a, identity(2))).toEqual(a);
    expect(multiply(identity(2), a)).toEqual(a);
  });
});

describe("transpose", () => {
  it("flips rows and columns", () => {
    expect(transpose([[1, 2, 3], [4, 5, 6]])).toEqual([[1, 4], [2, 5], [3, 6]]);
  });

  it("is its own undoing", () => {
    const a = [[1, 2, 3], [4, 5, 6]];
    expect(transpose(transpose(a))).toEqual(a);
  });
});

describe("determinant", () => {
  it("of a single entry is that entry", () => {
    expect(determinant([[7]])).toBe(7);
  });

  it("of a 2 by 2 is ad minus bc", () => {
    expect(determinant([[1, 2], [3, 4]])).toBe(-2);
  });

  it("of a 3 by 3 matches the worked answer", () => {
    // By cofactors along the top row:
    //   6(-2*7 - 5*8) - 1(4*7 - 5*2) + 1(4*8 - -2*2)
    // = 6(-54) - 18 + 36 = -306
    expect(determinant([[6, 1, 1], [4, -2, 5], [2, 8, 7]])).toBe(-306);
  });

  it("comes out whole for whole numbers", () => {
    // Fraction-free elimination, so no 5.999999999999998.
    expect(determinant([[2, 0, 0], [0, 3, 0], [0, 0, 1]])).toBe(6);
    expect(Number.isInteger(determinant([[4, 3, 2], [1, 5, 7], [9, 6, 8]]))).toBe(true);
  });

  it("of the identity is one", () => {
    expect(determinant(identity(4))).toBe(1);
  });

  it("is zero when a row repeats", () => {
    const repeated = determinant([[1, 2, 3], [1, 2, 3], [4, 5, 6]]);
    expect(repeated).toBe(0);
    // Not -0, which is what a sign flip on a zero leaves and what would then
    // be printed on the screen.
    expect(Object.is(repeated, -0)).toBe(false);
  });

  it("is zero when a column is all zeros", () => {
    expect(determinant([[0, 2], [0, 4]])).toBe(0);
  });

  it("survives a zero in the pivot position", () => {
    // The first pivot is 0, so a row has to be swapped in, which flips the sign.
    expect(determinant([[0, 1], [1, 0]])).toBe(-1);
  });

  it("refuses a matrix that is not square", () => {
    expect(() => determinant([[1, 2, 3], [4, 5, 6]])).toThrow(/square/);
    expect(() => determinant([])).toThrow(/square/);
  });
});

describe("rectangularity", () => {
  it("refuses a ragged matrix rather than answering anyway", () => {
    // Measuring only the first row makes these look like the same shape, and
    // the sum comes back ragged instead of throwing.
    expect(() => shape([[1, 2], [3]])).toThrow(/same length/);
    expect(() => add([[1, 2], [3]], [[1, 2], [3, 4]])).toThrow(/same length/);
    expect(() => multiply([[1], [2, 3]], [[1]])).toThrow(/same length/);
    expect(() => determinant([[1, 2], [3]])).toThrow(/same length/);
  });
});

describe("inverse", () => {
  it("of a 2 by 2 matches the worked answer", () => {
    expectClose(inverse([[4, 7], [2, 6]]), [[0.6, -0.7], [-0.2, 0.4]]);
  });

  it("of the identity is the identity", () => {
    expectClose(inverse(identity(3)), identity(3));
  });

  it("multiplies back to the identity", () => {
    const a = [[6, 1, 1], [4, -2, 5], [2, 8, 7]];
    expectClose(multiply(a, inverse(a)), identity(3));
    expectClose(multiply(inverse(a), a), identity(3));
  });

  it("undoes itself", () => {
    const a = [[4, 7], [2, 6]];
    expectClose(inverse(inverse(a)), a);
  });

  it("refuses a singular matrix", () => {
    // The second row is twice the first, so the determinant is zero.
    expect(() => inverse([[1, 2], [2, 4]])).toThrow(/singular/);
  });

  it("refuses a matrix of zeros", () => {
    expect(() => inverse([[0, 0], [0, 0]])).toThrow(/singular/);
  });

  it("refuses a matrix that is not square", () => {
    expect(() => inverse([[1, 2, 3], [4, 5, 6]])).toThrow(/square/);
  });

  it("inverts a matrix whose entries span many orders of magnitude", () => {
    // The inverse is [[1e-12, 0], [0, 1]], exactly representable. Measuring
    // the second pivot against the largest entry anywhere in the matrix calls
    // this singular -- while determinant() reports 1e12 for the same input.
    const spread = [[1e12, 0], [0, 1]];
    expect(determinant(spread)).toBe(1e12);
    expectClose(inverse(spread), [[1e-12, 0], [0, 1]]);
  });

  it("inverts a diagonal matrix of wildly different scales", () => {
    const spread = [[1000, 0, 0], [0, 1e-10, 0], [0, 0, 1]];
    const product = multiply(spread, inverse(spread));
    expectClose(product, identity(3));
  });

  it("inverts a matrix of very small numbers", () => {
    // Every entry is below the 1e-12 that a fixed threshold would use, so an
    // absolute one would call this perfectly good matrix singular.
    const tiny = [[2e-13, 0], [0, 4e-13]];
    const inverted = inverse(tiny);
    expect(inverted[0]?.[0]).toBeCloseTo(5e12, 0);
    // Multiplying back is the real check, and it has to be the identity.
    const product = multiply(tiny, inverted);
    expect(product[0]?.[0]).toBeCloseTo(1, 9);
    expect(product[1]?.[1]).toBeCloseTo(1, 9);
  });

  it("still refuses a singular matrix of very large numbers", () => {
    const large = [[1e9, 2e9], [2e9, 4e9]];
    expect(() => inverse(large)).toThrow(/singular/);
  });

  it("works when the first pivot is zero", () => {
    const a = [[0, 1], [1, 0]];
    expectClose(inverse(a), [[0, 1], [1, 0]]);
  });
});
