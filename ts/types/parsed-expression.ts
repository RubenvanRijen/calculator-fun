import type { Token } from "@/types/token.ts";

/**
 * The outcome of reading an expression: the RPN it came to, or the message
 * saying why it did not.
 *
 * Both halves are worth keeping. A caller that only wanted the RPN could make
 * do with `Token[] | null`, but the grapher puts the parse error on screen --
 * "Unbalanced brackets" rather than a blank chart -- so a remembered parse has
 * to remember the failure just as exactly as the success.
 */
export type ParsedExpression =
  | { readonly rpn: readonly Token[]; readonly error: null }
  | { readonly rpn: null; readonly error: string };
