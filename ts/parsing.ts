import { toRpn, tokenize } from "@/expression.ts";
import type { ParsedExpression } from "@/types/parsed-expression.ts";

/**
 * How many parses to keep.
 *
 * Generous next to what is ever live -- four Y expressions is the most the UI
 * can hold -- and the surplus is what covers typing: every keystroke in a
 * graph field asks for a parse of a different string, and without the room to
 * spare those would evict the curves the chart is still drawing.
 */
const MAX_REMEMBERED = 64;

const remembered = new Map<string, ParsedExpression>();

/**
 * Read an expression into RPN, remembering the answer.
 *
 * Safe to remember because parsing depends on nothing but the text: tokenize
 * and toRpn take no context, so the same string gives the same RPN whatever
 * the angle mode, the registers or Ans happen to be. Those are read per
 * evaluation, not per parse, which is why a stored value changed between two
 * draws is still seen.
 *
 * Worth remembering because the chart parses far more often than it is typed
 * into: a redraw re-reads every curve, the numeric searches compile one each,
 * and a fifty-row table over four functions asks four more. All of that is the
 * same handful of strings over and over.
 *
 * Evicted least-recently-used, and it has to be: oldest-first would throw away
 * exactly the parses worth keeping. The four Y expressions are inserted once
 * and then only ever read, while every keystroke in a graph field inserts a
 * string that is never asked for again -- so on insertion order the curves are
 * the oldest entries in the map, and a long enough edit would evict the ones
 * the chart is still drawing. Re-inserting on a hit costs a Map delete and add
 * against a parse saved, which is not a close contest.
 */
export function parseExpression(expression: string): ParsedExpression {
  const already = remembered.get(expression);
  if (already !== undefined) {
    // Move it to the back of the queue: being read is what marks an entry as
    // still in use, and nothing else here does.
    remembered.delete(expression);
    remembered.set(expression, already);
    return already;
  }

  let parsed: ParsedExpression;
  try {
    parsed = { rpn: toRpn(tokenize(expression)), error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Invalid expression";
    parsed = { rpn: null, error: message };
  }

  remembered.set(expression, parsed);
  if (remembered.size > MAX_REMEMBERED) {
    const oldest = remembered.keys().next();
    if (!oldest.done) remembered.delete(oldest.value);
  }
  return parsed;
}
