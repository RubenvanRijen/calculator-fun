import { toRpn, tokenize } from "@/expression.ts";
import type { ParsedExpression } from "@/types/parsed-expression.ts";

/**
 * How many parses to keep.
 *
 * A bound on the memory, and deliberately not a promise about any particular
 * entry. Typing is what fills this: every keystroke asks about a string
 * nobody will ask about again -- a graph field parses what it now holds, and
 * the keypad parses the line so far, twice, once as typed and once with any
 * trailing operator taken off. So thirty-five characters typed on the keypad
 * pushes four plotted curves out of a cache this size.
 *
 * That is allowed to happen, and the numbers are why. A parse that misses
 * costs 12us, so the redraw that finds its four curves gone pays 0.05ms, once,
 * and only after someone has stopped typing on the keypad and gone back to
 * the chart. An entry is 916 bytes for a forty-character expression, so
 * holding enough of them to prevent that -- 256, say -- would spend about
 * 170KB to save a twentieth of a millisecond. The measurements are from this
 * machine and only have to be right to an order of magnitude to settle it.
 *
 * What the number does have to be is comfortably more than the few strings
 * that are hot at one moment, so that the readings that matter -- a redraw
 * re-reading its curves, an = re-reading the line just typed -- land on
 * something already here. Four curves and a line being typed is five.
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
 * Worth remembering because both halves of the app read the same text several
 * times over. A redraw re-reads every curve, the numeric searches compile one
 * each, and a fifty-row table over four functions asks four more. On the
 * keypad it is pressing = that repeats: the answer and its exact form are two
 * more readings of the line the preview has just read, so the press that
 * someone is actually waiting on parses nothing at all.
 *
 * Evicted least-recently-used, and it has to be: oldest-first would throw away
 * exactly the parses worth keeping. The four Y expressions are inserted once
 * and then only ever read, while every keystroke inserts a string that is
 * never asked for again -- so on insertion order the curves are the oldest
 * entries in the map, and even a short edit would take out the ones being
 * read on every redraw. Re-inserting on a hit costs a Map delete and add
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
