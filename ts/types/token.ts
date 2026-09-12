import type { TokenKind } from "@/enums/token-kind.ts";
import type { Operation } from "@/types/operation.ts";
import type { FunctionName } from "@/types/function-name.ts";
import type { ConstantName } from "@/types/constant-name.ts";

/** One unit of a parsed expression. */
export type Token =
  | { readonly kind: TokenKind.Number; readonly value: number }
  | { readonly kind: TokenKind.Operator; readonly operator: Operation }
  | { readonly kind: TokenKind.UnaryMinus }
  | { readonly kind: TokenKind.Function; readonly name: FunctionName }
  | { readonly kind: TokenKind.LeftParen }
  | { readonly kind: TokenKind.RightParen }
  | { readonly kind: TokenKind.Variable }
  | { readonly kind: TokenKind.Ans }
  | { readonly kind: TokenKind.Constant; readonly name: ConstantName };
