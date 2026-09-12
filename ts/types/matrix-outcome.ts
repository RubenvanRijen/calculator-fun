import type { Matrix } from "@/types/matrix.ts";

/**
 * What a matrix operation came back with: a grid, or a single number that
 * needs saying what it is.
 */
export type MatrixOutcome =
  | { readonly kind: "matrix"; readonly value: Matrix }
  | { readonly kind: "scalar"; readonly label: string; readonly value: number };
