import { TokenKind } from "./enums/token-kind.js";
import type { Token } from "./types/token.js";
import type { Operation } from "./types/operation.js";
import type { FunctionName } from "./types/function-name.js";

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

const FUNCTIONS: Record<FunctionName, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
};

const FUNCTION_NAMES = Object.keys(FUNCTIONS) as FunctionName[];

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  "π": Math.PI,
  e: Math.E,
};

const OPERATIONS = ["+", "-", "*", "÷", "^"] as const satisfies readonly Operation[];

/** Narrow an arbitrary string to one of the supported operations. */
export function isOperation(value: string): value is Operation {
  return (OPERATIONS as readonly string[]).includes(value);
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

      // Two numbers in a row is never an implied multiplication -- it means
      // something like "1.2.3", which should be rejected rather than guessed at.
      const previous = tokens[tokens.length - 1];
      if (previous?.kind === TokenKind.Number) {
        throw new Error("Unexpected number");
      }

      implyMultiplication();
      tokens.push({ kind: TokenKind.Number, value });
      index += literal.length;
      continue;
    }

    if (char === "(") {
      implyMultiplication();
      tokens.push({ kind: TokenKind.LeftParen });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: TokenKind.RightParen });
      index += 1;
      continue;
    }

    if (char === "-" && expectsOperand()) {
      tokens.push({ kind: TokenKind.UnaryMinus });
      index += 1;
      continue;
    }

    // "/" is what a keyboard offers; the button is labelled "÷".
    const operator = char === "/" ? "÷" : char;
    if (isOperation(operator)) {
      tokens.push({ kind: TokenKind.Operator, operator });
      index += 1;
      continue;
    }

    const word = /^[a-zA-Zπ]+/.exec(input.slice(index))?.[0] ?? "";
    if (word !== "") {
      const lower = word.toLowerCase();

      const functionName = FUNCTION_NAMES.find((name) => name === lower);
      if (functionName !== undefined) {
        implyMultiplication();
        tokens.push({ kind: TokenKind.Function, name: functionName });
        index += word.length;
        continue;
      }

      const constant = CONSTANTS[lower];
      if (constant !== undefined) {
        implyMultiplication();
        tokens.push({ kind: TokenKind.Number, value: constant });
        index += word.length;
        continue;
      }

      if (lower === "x") {
        implyMultiplication();
        tokens.push({ kind: TokenKind.Variable });
        index += word.length;
        continue;
      }

      throw new Error(`Unknown name "${word}"`);
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
export function evaluateRpn(rpn: readonly Token[], x?: number): number {
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

      case TokenKind.UnaryMinus:
        stack.push(-pop());
        break;

      case TokenKind.Function:
        stack.push(FUNCTIONS[token.name](pop()));
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
export function evaluate(tokens: readonly Token[], x?: number): number {
  return evaluateRpn(toRpn(tokens), x);
}

/** Evaluate an expression written as text, as the grapher's input is. */
export function evaluateString(input: string, x?: number): number {
  return evaluate(tokenize(input), x);
}
