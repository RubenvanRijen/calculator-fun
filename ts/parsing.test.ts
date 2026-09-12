import { describe, it, expect } from "vitest";
import { parseExpression } from "@/parsing.ts";
import { compileCurve } from "@/graph.ts";

describe("parseExpression", () => {
  it("gives the same text the same parse back", () => {
    const first = parseExpression("sin(x)+2*x");
    const second = parseExpression("sin(x)+2*x");
    expect(second).toBe(first);
  });

  it("tells different texts apart, however alike they read", () => {
    const spaced = parseExpression("x + 1");
    const tight = parseExpression("x+1");
    expect(tight).not.toBe(spaced);
    expect(tight.rpn).toEqual(spaced.rpn);
  });

  it("remembers why a parse failed, not just that it did", () => {
    const parsed = parseExpression("sin(x");
    expect(parsed.rpn).toBeNull();
    expect(parsed.error).toBe("Unmatched (");
    // Remembered like any other parse: a failing expression is re-read on
    // every keystroke and every redraw, which is when it matters most.
    expect(parseExpression("sin(x")).toBe(parsed);
  });

  it("forgets the oldest to stay bounded", () => {
    const first = parseExpression("x^9+1");
    // More than the cap, and each one unlike anything else in this file, so
    // the marker is pushed out whatever else the tests above left behind.
    for (let index = 0; index < 70; index += 1) parseExpression(`x+${index}.5`);

    const again = parseExpression("x^9+1");
    expect(again).not.toBe(first);
    expect(again.rpn).toEqual(first.rpn);
  });

  it("keeps what is still being read, not merely what arrived last", () => {
    const curve = parseExpression("x^7-2");
    // A full cap of newcomers, with the curve read once amongst them, the way
    // a redraw reads it while a Y field is being typed into.
    for (let index = 0; index < 70; index += 1) {
      parseExpression(`x-${index}.25`);
      parseExpression("x^7-2");
    }
    expect(parseExpression("x^7-2")).toBe(curve);
  });

  it("keeps a remembered parse usable after it has been evaluated", () => {
    const context = () => ({ registers: { A: 2 } }) as const;
    const first = compileCurve("A*x", context);
    expect(first?.(3)).toBe(6);

    // The same parse, handed out a second time, must still evaluate -- and
    // against whatever the context says now, not what it said when it was read.
    const later = compileCurve("A*x", () => ({ registers: { A: 10 } }));
    expect(later?.(3)).toBe(30);
    expect(first?.(3)).toBe(6);
  });
});
