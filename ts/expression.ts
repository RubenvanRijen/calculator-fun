import { TokenKind } from "@/enums/token-kind.ts";
import type { Token } from "@/types/token.ts";
import type { Operation } from "@/types/operation.ts";
import type { FunctionName } from "@/types/function-name.ts";
import type { ConstantName } from "@/types/constant-name.ts";
import type { RegisterName } from "@/types/register-name.ts";
import type { AngleMode } from "@/types/angle-mode.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";

/**
 * Binding strength. Higher binds tighter, so 2 + 3 * 4 is 14 rather than 20.
 * Unary minus sits below "^" on purpose: -2^2 is -4, as it is in mathematics.
 */
const PRECEDENCE: Record<Operation, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "÷": 2,
  // Between multiplication and a power, so "2 * 5 nCr 2" is 2 * (5 nCr 2) and
  // "5 nCr 2 ^ 2" is 5 nCr (2^2).
  nCr: 3,
  nPr: 3,
  "^": 5,
};

// Above the binary operators, so -5 * 2 is (-5) * 2, but below "^", so -2^2
// is -(2^2) as it is in mathematics.
const UNARY_MINUS_PRECEDENCE = 4;

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

const FUNCTION_NAMES = Object.keys(FUNCTIONS) as FunctionName[];

/** The spellings the tokenizer accepts, and which constant each names. */
const CONSTANT_NAMES: Readonly<Record<string, ConstantName>> = {
  pi: "pi",
  "π": "pi",
  e: "e",
};

/** What each constant is worth in floating point. */
const CONSTANT_VALUES: Readonly<Record<ConstantName, number>> = {
  pi: Math.PI,
  e: Math.E,
};

/**
 * Every operation, taken from the precedence table rather than listed again.
 *
 * PRECEDENCE is a Record over the union, so the compiler already insists it
 * is complete. Writing the names out a second time did not get that: the
 * `satisfies` on the old list checked that each name was an operation, not
 * that every operation was named, so one left out here would have been
 * rejected by isOperation and its key would have done nothing at all.
 */
const OPERATIONS: readonly Operation[] = Object.keys(PRECEDENCE) as Operation[];

/** The operator names the tokenizer reads as words rather than symbols. */
const WORD_OPERATORS: Readonly<Record<string, Operation>> = {
  ncr: "nCr",
  npr: "nPr",
};

/**
 * Every name the tokenizer recognises, longest first so that a short name can
 * never shadow a longer one that starts with it (e.g. "e" before "exp").
 */
const KNOWN_NAMES: readonly string[] = [
  ...FUNCTION_NAMES,
  ...Object.keys(CONSTANT_NAMES),
  ...Object.keys(WORD_OPERATORS),
  "x",
  "ans",
].sort((a, b) => b.length - a.length);

/** Narrow an arbitrary string to one of the supported operations. */
export function isOperation(value: string): value is Operation {
  return (OPERATIONS as readonly string[]).includes(value);
}

/** One piece of a letter run: a known name, or a single-letter register. */
type RunPiece = { readonly known: string } | { readonly register: RegisterName };

const REGISTERS: Readonly<Record<RegisterName, true>> = {
  A: true,
  B: true,
  C: true,
  D: true,
};

/**
 * Every letter a value can be stored under.
 *
 * Taken from the keys of a Record over the union, so a letter the calculator
 * gains cannot be left out of one of the places that enumerate them -- the
 * tokenizer, the panel that offers them, and the state that is saved. Missing
 * it here would make the letter unreadable in an expression; missing it in
 * storage.ts would make it work until the page was reloaded.
 */
export const REGISTER_NAMES: readonly RegisterName[] =
  Object.keys(REGISTERS) as RegisterName[];

function asRegister(letter: string): RegisterName | null {
  return REGISTER_NAMES.find((name) => name === letter) ?? null;
}

/**
 * Split a run of letters into known names and register letters, longest match
 * first, backtracking when a choice dead-ends. Returns null when any part of
 * the run is neither, so the caller can report the whole word rather than a
 * fragment of it.
 *
 * Known names are matched case-insensitively and win over registers, which is
 * why E and X are not register letters: they already mean Euler's constant
 * and the graph variable.
 */
function splitIntoNames(run: string): RunPiece[] | null {
  const lower = run.toLowerCase();

  const from = (start: number): RunPiece[] | null => {
    if (start === run.length) return [];

    // An uppercase register letter is tried first, because names are matched
    // case-insensitively and "asin" would otherwise swallow the A: "Asin(30)"
    // has to read as A x sin(30), not asin(30). Function names are lowercase
    // everywhere the keypad writes them, so nothing is lost the other way.
    const register = asRegister(run[start] ?? "");
    if (register !== null) {
      const rest = from(start + 1);
      if (rest !== null) return [{ register }, ...rest];
    }

    for (const candidate of KNOWN_NAMES) {
      if (!lower.startsWith(candidate, start)) continue;
      const rest = from(start + candidate.length);
      if (rest !== null) return [{ known: candidate }, ...rest];
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
      last.kind === TokenKind.Constant ||
      last.kind === TokenKind.Register ||
      last.kind === TokenKind.Factorial ||
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

    if (char === "!") {
      tokens.push({ kind: TokenKind.Factorial });
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

    // A leading "+" says nothing about the value, so it is dropped rather
    // than rejected. It is how "(+1/2)" reads -- a mixed number whose whole
    // part was left out -- and "+5" is not a mistake worth refusing either.
    if (char === "+" && expectsOperand()) {
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
      const functionAt = names.findIndex(
        (piece) =>
          "known" in piece &&
          (FUNCTION_NAMES as readonly string[]).includes(piece.known)
      );
      if (functionAt !== -1) {
        const piece = names[functionAt];
        const name = piece !== undefined && "known" in piece ? piece.known : "";
        if (functionAt !== names.length - 1) {
          throw new Error(`Unknown name "${run}"`);
        }
        // Skip whitespace: "sin (x)" is a bracket one space away, not a
        // missing one.
        if (!/^\s*\(/.test(input.slice(index + run.length))) {
          throw new Error(`Expected ( after "${name}"`);
        }
      }

      for (const piece of names) {
        if ("register" in piece) {
          implyMultiplication();
          tokens.push({ kind: TokenKind.Register, name: piece.register });
          continue;
        }

        const name = piece.known;

        // An infix word operator is not a value, so it implies no product.
        const wordOperator = WORD_OPERATORS[name];
        if (wordOperator !== undefined) {
          tokens.push({ kind: TokenKind.Operator, operator: wordOperator });
          continue;
        }

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
        const constant = CONSTANT_NAMES[name];
        // KNOWN_NAMES is built from these sources, so this is unreachable --
        // but a throw beats silently evaluating to zero.
        if (constant === undefined) throw new Error(`Unknown name "${name}"`);
        tokens.push({ kind: TokenKind.Constant, name: constant });
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
      case TokenKind.Constant:
      case TokenKind.Register:
      // Postfix: it applies to the value already in the output, so it goes
      // straight there rather than waiting on the stack.
      case TokenKind.Factorial:
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
/** n!, for a whole number small enough to mean anything in a double. */
function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Factorial needs a whole number that is not negative");
  }
  if (value > 170) throw new Error("Result is too large");

  let result = 1;
  for (let i = 2; i <= value; i += 1) result *= i;
  return result;
}

/** nPr: the number of ordered selections of r from n. */
function permutations(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) {
    throw new Error("nPr needs whole numbers that are not negative");
  }
  if (r > n) return 0;

  let result = 1;
  for (let i = 0; i < r; i += 1) {
    result *= n - i;
    if (result > Number.MAX_SAFE_INTEGER) throw new Error("Result is too large");
  }
  return result;
}

/** nCr: the number of unordered selections of r from n. */
function combinations(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) {
    throw new Error("nCr needs whole numbers that are not negative");
  }
  if (r > n) return 0;

  // Multiply and divide in step, which keeps the running value small enough
  // to stay exact far longer than computing three factorials would.
  const take = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= take; i += 1) {
    result = (result * (n - take + i)) / i;
    // Past this the value is no longer a whole number in a double, so
    // rounding it would be claiming a precision that is not there.
    if (result > Number.MAX_SAFE_INTEGER) throw new Error("Result is too large");
  }
  return Math.round(result);
}

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

      case TokenKind.Constant:
        stack.push(CONSTANT_VALUES[token.name]);
        break;

      case TokenKind.Register: {
        const stored = context.registers?.[token.name];
        if (stored === undefined) throw new Error(`Nothing stored in ${token.name}`);
        stack.push(stored);
        break;
      }

      case TokenKind.Factorial:
        stack.push(factorial(pop()));
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
          case "nCr":
            stack.push(combinations(left, right));
            break;
          case "nPr":
            stack.push(permutations(left, right));
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
