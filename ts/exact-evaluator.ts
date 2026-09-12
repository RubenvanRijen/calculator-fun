import { TokenKind } from "@/enums/token-kind.ts";
import * as Exact from "@/exact.ts";
import type { Token } from "@/types/token.ts";
import type { ExactValue } from "@/interfaces/exact-value.ts";
import type { Operation } from "@/types/operation.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";
import type { AngleMode } from "@/types/angle-mode.ts";

/**
 * A second, best-effort evaluator that works in exact values rather than
 * floating point.
 *
 * It runs *beside* the float evaluator, never instead of it: anything it
 * cannot represent returns null and the decimal result stands. That is what
 * keeps ln 5 and sin 1 working while 1/3 + 1/6 comes out as exactly 1/2.
 */

/** sin at k·π, for the k where the answer is exact. Keyed "num/den". */
const SINE_TABLE: Readonly<Record<string, ExactValue | undefined>> = {
  "0/1": Exact.ZERO,
  "1/6": make(1n, 2n),
  "1/4": make(1n, 2n, 2n),
  "1/3": make(1n, 2n, 3n),
  "1/2": Exact.ONE,
  "2/3": make(1n, 2n, 3n),
  "3/4": make(1n, 2n, 2n),
  "5/6": make(1n, 2n),
  "1/1": Exact.ZERO,
  "7/6": make(-1n, 2n),
  "5/4": make(-1n, 2n, 2n),
  "4/3": make(-1n, 2n, 3n),
  "3/2": make(-1n, 1n),
  "5/3": make(-1n, 2n, 3n),
  "7/4": make(-1n, 2n, 2n),
  "11/6": make(-1n, 2n),
};

/**
 * A constant of this module, built once while the module loads.
 *
 * Every caller passes literals, so the throw says something about this file
 * rather than about any input: if it ever fires it fires on import, taking
 * the whole app down at startup where the tests will see it, rather than part
 * way through someone's calculation.
 */
function make(num: bigint, den = 1n, radicand = 1n): ExactValue {
  const value = Exact.normalise({ num, den, radicand, piPower: 0 });
  if (value === null) throw new Error("unreachable: table entry is normalisable");
  return value;
}

/**
 * What one unit of each mode is, as a fraction of a radian.
 *
 * The exact twin of RADIANS_PER_UNIT in expression.ts, in bigints. A Record
 * over the union rather than a chain ending in `return Exact.ONE`, because
 * that fallback meant a mode added to the union would have been read as
 * radians here while the float path read it correctly -- the two lines of the
 * display disagreeing, with the exact one wrong.
 *
 * Three values, not three functions returning them. They are constants and
 * were being rebuilt on every trigonometric evaluation; sharing one instance
 * each is safe because every field of an ExactValue is readonly, which is how
 * SINE_TABLE above has always held its entries.
 */
const TURN_FRACTION: Readonly<Record<AngleMode, ExactValue>> = {
  rad: Exact.ONE,
  deg: make(1n, 180n),
  grad: make(1n, 200n),
};

/** A quarter turn, for the cosine shift below. */
const QUARTER_TURN = make(1n, 2n);

/** How many radians one unit of the active mode is, as an exact value. */
function turnFraction(mode: AngleMode): ExactValue {
  return TURN_FRACTION[mode];
}

/** The argument as a multiple of π, when it is one. */
function asMultipleOfPi(value: ExactValue, mode: AngleMode): ExactValue | null {
  if (mode === "rad") {
    // Already in radians, so it has to carry the π itself.
    return value.piPower === 1 && value.radicand === 1n
      ? Exact.normalise({ ...value, piPower: 0 })
      : Exact.isZero(value)
        ? Exact.ZERO
        : null;
  }

  // In degrees or gradians the argument is a plain number of units.
  if (value.piPower !== 0 || value.radicand !== 1n) return null;
  return Exact.multiply(value, turnFraction(mode));
}

/** Reduce k to [0, 2) so the table only needs one turn. */
function reduceTurn(k: ExactValue): ExactValue | null {
  if (k.radicand !== 1n || k.piPower !== 0) return null;
  const twice = k.den * 2n;
  let num = k.num % twice;
  if (num < 0n) num += twice;
  return Exact.normalise({ num, den: k.den, radicand: 1n, piPower: 0 });
}

function lookupSine(k: ExactValue): ExactValue | null {
  const reduced = reduceTurn(k);
  if (reduced === null) return null;
  return SINE_TABLE[`${reduced.num}/${reduced.den}`] ?? null;
}

/** cos x = sin(x + π/2). */
function lookupCosine(k: ExactValue): ExactValue | null {
  const shifted = Exact.add(k, QUARTER_TURN);
  return shifted === null ? null : lookupSine(shifted);
}

function lookupTangent(k: ExactValue): ExactValue | null {
  const sine = lookupSine(k);
  const cosine = lookupCosine(k);
  if (sine === null || cosine === null) return null;
  // Undefined at the poles, so leave it to the float evaluator to report.
  if (Exact.isZero(cosine)) return null;
  return Exact.divide(sine, cosine);
}

/** Apply a function exactly, or give up. */
function applyFunction(
  name: string,
  argument: ExactValue,
  angleMode: AngleMode
): ExactValue | null {
  if (name === "sqrt") return Exact.squareRoot(argument);
  if (name === "abs") {
    return argument.num < 0n ? Exact.negate(argument) : argument;
  }

  if (name === "sin" || name === "cos" || name === "tan") {
    const k = asMultipleOfPi(argument, angleMode);
    if (k === null) return null;
    if (name === "sin") return lookupSine(k);
    if (name === "cos") return lookupCosine(k);
    return lookupTangent(k);
  }

  // ln, log, exp and the inverse and hyperbolic functions are transcendental
  // at almost every argument, so there is nothing exact to return.
  return null;
}

/**
 * How each operator is worked out exactly, where it can be.
 *
 * A Record over the operations rather than a chain ending in a fallback: the
 * chain ended `: Exact.power(left, right)`, so an operator added to the union
 * and forgotten here would have been exponentiated -- silently, and only on
 * the exact line, with the float line beside it showing the right answer.
 *
 * Combinations are whole numbers, so the float path is already exact and
 * there is nothing for this evaluator to add; they say so by returning null,
 * which is how everything else here declines as well.
 */
const EXACTLY: Readonly<
  Record<Operation, (left: ExactValue, right: ExactValue) => ExactValue | null>
> = {
  "+": Exact.add,
  "-": Exact.subtract,
  "*": Exact.multiply,
  "÷": Exact.divide,
  "^": Exact.power,
  nCr: () => null,
  nPr: () => null,
};

/**
 * Evaluate postfix tokens exactly. Returns null the moment the result would
 * leave the exact form, which is the caller's signal to use the decimal.
 */
export function evaluateExactRpn(
  rpn: readonly Token[],
  context: EvalContext = {}
): ExactValue | null {
  const angleMode = context.angleMode ?? "rad";
  const stack: ExactValue[] = [];

  const pop = (): ExactValue | null => stack.pop() ?? null;

  for (const token of rpn) {
    switch (token.kind) {
      case TokenKind.Number: {
        // A literal that is not a short decimal (an exponential result fed
        // back in, say) has no exact reading.
        const value = Exact.fromNumber(token.value);
        if (value === null) return null;
        stack.push(value);
        break;
      }

      case TokenKind.Variable:
      case TokenKind.Ans: {
        const supplied = token.kind === TokenKind.Variable ? context.x : context.ans;
        if (supplied === undefined) return null;
        const value = Exact.fromNumber(supplied);
        if (value === null) return null;
        stack.push(value);
        break;
      }

      case TokenKind.Constant: {
        // e is transcendental, so only π has an exact form here.
        if (token.name !== "pi") return null;
        stack.push(Exact.PI);
        break;
      }

      case TokenKind.Register: {
        const stored = context.registers?.[token.name];
        if (stored === undefined) return null;
        const value = Exact.fromNumber(stored);
        if (value === null) return null;
        stack.push(value);
        break;
      }

      case TokenKind.UnaryMinus: {
        const value = pop();
        if (value === null) return null;
        stack.push(Exact.negate(value));
        break;
      }

      case TokenKind.Function: {
        const argument = pop();
        if (argument === null) return null;
        const result = applyFunction(token.name, argument, angleMode);
        if (result === null) return null;
        stack.push(result);
        break;
      }

      case TokenKind.Operator: {
        const right = pop();
        const left = pop();
        if (right === null || left === null) return null;

        const result = EXACTLY[token.operator](left, right);
        if (result === null) return null;
        stack.push(result);
        break;
      }

      default:
        return null;
    }
  }

  const result = pop();
  return stack.length === 0 ? result : null;
}
