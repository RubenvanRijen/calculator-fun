import { TokenKind } from "./enums/token-kind.js";
import type { Token } from "./types/token.js";
import type { Operation } from "./types/operation.js";
import type { FunctionName } from "./types/function-name.js";
import type { AngleMode } from "./types/angle-mode.js";
import type { EvalContext } from "./interfaces/eval-context.js";

/**
 * Binding strength. Higher binds tighter, so 2 + 3 * 4 is 14 rather than 20.
 * Unary minus sits below "^" on purpose: -2^2 is -4, as it is in mathematics.
 */
const PRECEDENCE: Record<Operation, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "÷": 2,
  "^": 4,
};

const UNARY_MINUS_PRECEDENCE = 3;

/** "^" is the only right-associative operator: 2^3^2 is 2^9, not 8^2. */
const RIGHT_ASSOCIATIVE: ReadonlySet<Operation> = new Set<Operation>(["^"]);

/** Radians per unit of each angle mode. */
const RADIANS_PER_UNIT: Record<AngleMode, number> = {
  rad: 1,
  deg: Math.PI / 180,
  grad: Math.PI / 200,
};

function toRadians(value: number, mode: AngleMode): number {
  return value * RADIANS_PER_UNIT[mode];
}

function fromRadians(value: number, mode: AngleMode): number {
  return value / RADIANS_PER_UNIT[mode];
}

/**
 * Each function receives the resolved context, so the three circular functions
 * can read their argument in the active angle mode and their three inverses can
 * report a result in it. Everything else ignores it.
 */
const FUNCTIONS: Record<FunctionName, (value: number, angleMode: AngleMode) => number> = {
  sin: (value, mode) => Math.sin(toRadians(value, mode)),
  cos: (value, mode) => Math.cos(toRadians(value, mode)),
  tan: (value, mode) => Math.tan(toRadians(value, mode)),
  asin: (value, mode) => fromRadians(Math.asin(value), mode),
  acos: (value, mode) => fromRadians(Math.acos(value), mode),
  atan: (value, mode) => fromRadians(Math.atan(value), mode),
  sinh: (value) => Math.sinh(value),
  cosh: (value) => Math.cosh(value),
  tanh: (value) => Math.tanh(value),
  sqrt: (value) => Math.sqrt(value),
  abs: (value) => Math.abs(value),
  ln: (value) => Math.log(value),
  log: (value) => Math.log10(value),
  exp: (value) => Math.exp(value),
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS) as FunctionName[];

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  "π": Math.PI,
  e: Math.E,
};

const OPERATIONS = ["+", "-", "*", "÷", "^"] as const satisfies readonly Operation[];

/**
 * Every name the tokenizer recognises, longest first so that a short name can
 * never shadow a longer one that starts with it (e.g. "e" before "exp").
 */
const KNOWN_NAMES: readonly string[] = [
  ...FUNCTION_NAMES,
  ...Object.keys(CONSTANTS),
  "x",
  "ans",
].sort((a, b) => b.length - a.length);

/** Narrow an arbitrary string to one of the supported operations. */
export function isOperation(value: string): value is Operation {
  return (OPERATIONS as readonly string[]).includes(value);
}

/**
 * Split a run of letters into known names, longest match first. Returns null
 * when any part of the run is not a name, so the caller can report the whole
 * word instead of a fragment of it.
 */
function splitIntoNames(run: string): string[] | null {
  const lower = run.toLowerCase();

  // Backtracking, because committing to the longest prefix can dead-end on a
  // run that does decompose: "expi" is e, x, pi, but a greedy pass takes
  // "exp"... and then gives up on "i". Runs are a handful of characters, so
  // the search space is trivial.
  const from = (start: number): string[] | null => {
    if (start === lower.length) return [];
    for (const candidate of KNOWN_NAMES) {
      if (!lower.startsWith(candidate, start)) continue;
      const rest = from(start + candidate.length);
      if (rest !== null) return [candidate, ...rest];
    }
    return null;
  };

  return from(0);
}

/**
 * Turn an expression such as "2*x^2 - sin(x)" into tokens. Accepts "/" and
 * "÷" interchangeably, implies multiplication in "2x" and "3(x+1)", and
 * resolves a "-" in operand position to a unary minus.
 *
 * Throws on anything it cannot read, so callers evaluate inside a try.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  /** Whether the token just pushed came from digits rather than a name. */
  let lastWasLiteral = false;

  /** True when the next "-" would be unary, i.e. nothing to subtract from. */
  const expectsOperand = (): boolean => {
    const last = tokens[tokens.length - 1];
    if (last === undefined) return true;
    return (
      last.kind === TokenKind.Operator ||
      last.kind === TokenKind.UnaryMinus ||
      last.kind === TokenKind.LeftParen ||
      last.kind === TokenKind.Function
    );
  };

  /** "2x", "2(", ")(" and "2 sin(x)" all imply a multiplication. */
  const implyMultiplication = (): void => {
    const last = tokens[tokens.length - 1];
    if (last === undefined) return;
    if (
      last.kind === TokenKind.Number ||
      last.kind === TokenKind.Variable ||
      last.kind === TokenKind.Ans ||
      last.kind === TokenKind.RightParen
    ) {
      tokens.push({ kind: TokenKind.Operator, operator: "*" });
    }
  };

  while (index < input.length) {
    const char = input[index] ?? "";

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      // The exponent part matters because results round-trip through text:
      // 1e-7 and 9.9999999998e+21 must read back as one number, not as a
      // mantissa multiplied by Euler's constant.
      const match = /^[0-9]*\.?[0-9]*(?:[eE][+-]?[0-9]+)?/.exec(input.slice(index));
      const literal = match?.[0] ?? "";
      const value = parseFloat(literal);
      if (isNaN(value)) throw new Error(`Cannot read "${literal}"`);

      // Two *literals* in a row is never an implied multiplication -- it
      // means something like "1.2.3", which should be rejected rather than
      // guessed at. A constant beside a literal is fine: "π5" is a product,
      // exactly as "2π" and "2x" are.
      if (lastWasLiteral) {
        throw new Error("Unexpected number");
      }

      implyMultiplication();
      tokens.push({ kind: TokenKind.Number, value });
      lastWasLiteral = true;
      index += literal.length;
      continue;
    }

    if (char === "(") {
      implyMultiplication();
      tokens.push({ kind: TokenKind.LeftParen });
      lastWasLiteral = false;
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: TokenKind.RightParen });
      lastWasLiteral = false;
      index += 1;
      continue;
    }

    if (char === "-" && expectsOperand()) {
      tokens.push({ kind: TokenKind.UnaryMinus });
      lastWasLiteral = false;
      index += 1;
      continue;
    }

    // "/" is what a keyboard offers; the button is labelled "÷".
    const operator = char === "/" ? "÷" : char;
    if (isOperation(operator)) {
      tokens.push({ kind: TokenKind.Operator, operator });
      lastWasLiteral = false;
      index += 1;
      continue;
    }

    // Take the whole run of letters, then try to split it into known names.
    // Splitting lets "ππ" and "eπ" read as two constants side by side; taking
    // the whole run first means a failure can name the word the user actually
    // typed ("sinh") rather than the leftover fragment ("h").
    const run = /^[a-zA-Zπ]+/.exec(input.slice(index))?.[0] ?? "";
    if (run !== "") {
      const names = splitIntoNames(run);
      if (names === null) throw new Error(`Unknown name "${run}"`);

      // A function owns the bracket that follows it, so it has to be the last
      // name in the run and that bracket has to be there. Without this check a
      // typo that happens to decompose -- "cose(x)" -> cos, e -- would quietly
      // evaluate as cos(e)*x instead of being rejected.
      const functionAt = names.findIndex((name) =>
        (FUNCTION_NAMES as readonly string[]).includes(name)
      );
      if (functionAt !== -1) {
        const name = names[functionAt] ?? "";
        if (functionAt !== names.length - 1) {
          throw new Error(`Unknown name "${run}"`);
        }
        // Skip whitespace: "sin (x)" is a bracket one space away, not a
        // missing one.
        if (!/^\s*\(/.test(input.slice(index + run.length))) {
          throw new Error(`Expected ( after "${name}"`);
        }
      }

      for (const name of names) {
        implyMultiplication();
        const functionName = FUNCTION_NAMES.find((candidate) => candidate === name);
        if (functionName !== undefined) {
          tokens.push({ kind: TokenKind.Function, name: functionName });
          continue;
        }
        if (name === "x") {
          tokens.push({ kind: TokenKind.Variable });
          continue;
        }
        if (name === "ans") {
          tokens.push({ kind: TokenKind.Ans });
          continue;
        }
        const constant = CONSTANTS[name];
        // KNOWN_NAMES is built from these three sources, so this is
        // unreachable -- but a throw beats silently evaluating to zero.
        if (constant === undefined) throw new Error(`Unknown name "${name}"`);
        tokens.push({ kind: TokenKind.Number, value: constant });
      }

      lastWasLiteral = false;
      index += run.length;
      continue;
    }

    throw new Error(`Unexpected character "${char}"`);
  }

  return tokens;
}

/**
 * Shunting-yard: reorder infix tokens into postfix, so that precedence and
 * parentheses are resolved once rather than at evaluation time.
 */
export function toRpn(tokens: readonly Token[]): Token[] {
  const output: Token[] = [];
  const stack: Token[] = [];

  const precedenceOf = (token: Token): number => {
    if (token.kind === TokenKind.Operator) return PRECEDENCE[token.operator];
    if (token.kind === TokenKind.UnaryMinus) return UNARY_MINUS_PRECEDENCE;
    // A function binds tighter than any operator: sqrt(9)+1 is 4, not sqrt(10).
    if (token.kind === TokenKind.Function) return Infinity;
    return 0;
  };

  for (const token of tokens) {
    switch (token.kind) {
      case TokenKind.Number:
      case TokenKind.Variable:
      case TokenKind.Ans:
        output.push(token);
        break;

      case TokenKind.Function:
      // A unary minus is right-associative and binds only what follows, so it
      // is pushed without displacing anything already on the stack.
      case TokenKind.UnaryMinus:
        stack.push(token);
        break;

      case TokenKind.Operator: {
        const rightAssociative = RIGHT_ASSOCIATIVE.has(token.operator);
        for (;;) {
          const top = stack[stack.length - 1];
          if (top === undefined || top.kind === TokenKind.LeftParen) break;
          const topPrecedence = precedenceOf(top);
          const tokenPrecedence = PRECEDENCE[token.operator];
          const shouldPop = rightAssociative
            ? topPrecedence > tokenPrecedence
            : topPrecedence >= tokenPrecedence;
          if (!shouldPop) break;
          output.push(top);
          stack.pop();
        }
        stack.push(token);
        break;
      }

      case TokenKind.LeftParen:
        stack.push(token);
        break;

      case TokenKind.RightParen: {
        let matched = false;
        while (stack.length > 0) {
          const top = stack.pop();
          if (top === undefined) break;
          if (top.kind === TokenKind.LeftParen) {
            matched = true;
            break;
          }
          output.push(top);
        }
        if (!matched) throw new Error("Unmatched )");
        // The function that owns this bracket is complete, so it belongs in
        // the output now rather than lingering to swallow what follows.
        const owner = stack[stack.length - 1];
        if (owner !== undefined && owner.kind === TokenKind.Function) {
          output.push(owner);
          stack.pop();
        }
        break;
      }
    }
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top === undefined) break;
    if (top.kind === TokenKind.LeftParen) throw new Error("Unmatched (");
    output.push(top);
  }

  return output;
}

/**
 * Evaluate postfix tokens. `x` supplies the free variable for the grapher;
 * an expression that uses it without one is an error.
 */
export function evaluateRpn(rpn: readonly Token[], context: EvalContext = {}): number {
  const angleMode = context.angleMode ?? "rad";
  const x = context.x;
  const ans = context.ans;
  const stack: number[] = [];

  const pop = (): number => {
    const value = stack.pop();
    if (value === undefined) throw new Error("Invalid expression");
    return value;
  };

  for (const token of rpn) {
    switch (token.kind) {
      case TokenKind.Number:
        stack.push(token.value);
        break;

      case TokenKind.Variable:
        if (x === undefined) throw new Error("Unknown name \"x\"");
        stack.push(x);
        break;

      case TokenKind.Ans:
        if (ans === undefined) throw new Error("No previous answer");
        stack.push(ans);
        break;

      case TokenKind.UnaryMinus:
        stack.push(-pop());
        break;

      case TokenKind.Function:
        stack.push(FUNCTIONS[token.name](pop(), angleMode));
        break;

      case TokenKind.Operator: {
        const right = pop();
        const left = pop();
        switch (token.operator) {
          case "+":
            stack.push(left + right);
            break;
          case "-":
            stack.push(left - right);
            break;
          case "*":
            stack.push(left * right);
            break;
          case "÷":
            if (right === 0) throw new Error("Cannot divide by zero");
            stack.push(left / right);
            break;
          case "^":
            stack.push(left ** right);
            break;
        }
        break;
      }

      default:
        throw new Error("Invalid expression");
    }
  }

  const result = pop();
  if (stack.length > 0) throw new Error("Invalid expression");
  return result;
}

/** Tokenize, order and evaluate in one go. Throws with a readable message. */
export function evaluate(tokens: readonly Token[], context: EvalContext = {}): number {
  return evaluateRpn(toRpn(tokens), context);
}

/** Evaluate an expression written as text, as the grapher's input is. */
export function evaluateString(input: string, context: EvalContext = {}): number {
  return evaluate(tokenize(input), context);
}
