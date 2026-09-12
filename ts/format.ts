/**
 * Turning numbers and expressions into the strings the display shows. Pure
 * functions with no state, kept apart from the calculator itself so both the
 * display and the history can format the same way.
 */

/**
 * Every way an operator can be written, longest first.
 *
 * nCr and nPr are the reason this exists: before them an operator was always
 * one character, and half the editing rules tested `text[text.length - 1]`
 * against a string of symbols. Everything that needs to know "does this end
 * with an operator" goes through trailingOperatorLength instead.
 */
export const OPERATOR_SPELLINGS: readonly string[] = [
  "nCr", "nPr", "+", "-", "*", "÷", "^",
];

/** How many characters the operator at the end of `text` takes, or 0. */
export function trailingOperatorLength(text: string): number {
  const lower = text.toLowerCase();
  for (const spelling of OPERATOR_SPELLINGS) {
    if (lower.endsWith(spelling.toLowerCase())) return spelling.length;
  }
  return 0;
}

/** The operator starting at `index`, or null. */
export function operatorAt(text: string, index: number): string | null {
  const lower = text.toLowerCase();
  for (const spelling of OPERATOR_SPELLINGS) {
    if (lower.startsWith(spelling.toLowerCase(), index)) {
      return text.slice(index, index + spelling.length);
    }
  }
  return null;
}

/**
 * Binary floating point makes 0.1 + 0.2 come out as 0.30000000000000004.
 * Twelve significant digits is well inside a double's ~15-17 digits of
 * precision, so this trims the noise without changing any honest result.
 */
export function roundResult(value: number): number {
  if (!Number.isFinite(value)) return value;
  return parseFloat(value.toPrecision(12));
}

/** True when a "-" appended to `text` would be a sign, not a subtraction. */
export function expectsOperand(text: string): boolean {
  if (text === "") return true;
  if (text.endsWith("(")) return true;
  return trailingOperatorLength(text) > 0;
}

/**
 * Space out binary operators so "12+3*4" reads as "12 + 3 * 4", and report
 * where a cursor in the raw text lands in the spaced text. The caret has to be
 * placed in the formatted string, so the two have to be worked out together
 * rather than re-derived from each other.
 */
export function formatExpressionWithCursor(
  expression: string,
  cursor: number
): { text: string; cursor: number } {
  let out = "";
  let mapped = 0;
  let index = 0;

  while (index <= expression.length) {
    // Checked before writing, so the caret lands before any space inserted
    // ahead of an operator: "12| + 3" rather than "12 |+ 3".
    if (index === cursor) mapped = out.length;
    if (index === expression.length) break;

    const operator = operatorAt(expression, index);
    if (operator !== null && !expectsOperand(expression.slice(0, index))) {
      if (out !== "" && !out.endsWith(" ")) out += " ";
      out += `${operator} `;
      index += operator.length;
      continue;
    }

    out += expression[index] ?? "";
    index += 1;
  }

  const text = out.trimEnd();
  return { text, cursor: Math.min(mapped, text.length) };
}

/** Close any parentheses left open, so "sqrt(9" still evaluates. */
export function balanceParentheses(text: string): string {
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
  }
  return depth > 0 ? text + ")".repeat(depth) : text;
}

/** Space out binary operators so "12+3*4" reads as "12 + 3 * 4". */
export function formatExpression(expression: string): string {
  return formatExpressionWithCursor(expression, expression.length).text;
}

/**
 * Format a result for display: group the integer part with thousands
 * separators while leaving the decimal part exactly as it is.
 */
export function formatOperand(operand: string): string {
  if (operand === "") return "";

  // Exponential form has no integer/decimal split to group, and grouping it
  // would render 1e-7 as "0". Show it as it is.
  if (/[eE]/.test(operand)) return operand;

  // noUncheckedIndexedAccess types both halves as `string | undefined`, which
  // is what lets the trailing-decimal case below be handled honestly.
  const [integerPart, decimalPart] = operand.split(".");
  const integerDigits = parseFloat(integerPart ?? "");
  const integerDisplay = isNaN(integerDigits)
    ? ""
    : integerDigits.toLocaleString("en", { maximumFractionDigits: 0 });

  return decimalPart === undefined
    ? integerDisplay
    : `${integerDisplay}.${decimalPart}`;
}

/** The trailing "+3" of an expression, so "=" can repeat it. */
export function trailingOperation(expression: string): string | null {
  let depth = 0;

  for (let index = expression.length - 1; index > 0; index -= 1) {
    const character = expression[index] ?? "";
    if (character === ")") {
      depth += 1;
      continue;
    }
    if (character === "(") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;

    const operator = operatorAt(expression, index);
    if (operator === null) continue;
    // Skip a sign rather than a genuine binary operator.
    if (expectsOperand(expression.slice(0, index))) continue;
    return expression.slice(index);
  }

  return null;
}
