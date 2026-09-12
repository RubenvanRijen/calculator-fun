/** The sorts of token an expression can be made of. */
export enum TokenKind {
  Number = "number",
  Operator = "operator",
  /** A leading minus, as in -5 or 2^-3. Distinct from the binary operator. */
  UnaryMinus = "unary-minus",
  Function = "function",
  LeftParen = "left-paren",
  RightParen = "right-paren",
  /** The free variable, used by the grapher. */
  Variable = "variable",
}
