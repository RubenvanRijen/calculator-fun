/**
 * What one of the graph's searches came back with.
 *
 * Three shapes, because the searches answer in three ways: something to say,
 * a point to put the marker on, or an area -- which is both, and in a fixed
 * order, since shading it means a redraw and a redraw can rewrite the readout.
 */
export type SearchOutcome =
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "trace"; readonly x: number; readonly y: number }
  | { readonly kind: "area"; readonly shade: boolean; readonly text: string };
