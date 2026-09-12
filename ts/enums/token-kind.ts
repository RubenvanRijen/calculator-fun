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
  /** The previous result, as the Ans key inserts it. */
  Ans = "ans",
  /** A trailing "!", which applies to the value before it. */
  Factorial = "factorial",
  /** A stored value, named by a single letter. */
  Register = "register",
  /**
   * A named constant. Kept symbolic rather than turned into a float at
   * tokenize time, so the exact evaluator can tell π from 3.14159265358979.
   */
  Constant = "constant",
}
