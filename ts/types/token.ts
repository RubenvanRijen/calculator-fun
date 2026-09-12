import type { TokenKind } from "../enums/token-kind.js";
import type { Operation } from "./operation.js";
import type { FunctionName } from "./function-name.js";

/** One unit of a parsed expression. */
export type Token =
  | { readonly kind: TokenKind.Number; readonly value: number }
  | { readonly kind: TokenKind.Operator; readonly operator: Operation }
  | { readonly kind: TokenKind.UnaryMinus }
  | { readonly kind: TokenKind.Function; readonly name: FunctionName }
  | { readonly kind: TokenKind.LeftParen }
  | { readonly kind: TokenKind.RightParen }
  | { readonly kind: TokenKind.Variable };
