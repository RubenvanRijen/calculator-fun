import { evaluateString, toRpn, tokenize } from "@/expression.ts";
import { evaluateExactRpn } from "@/exact-evaluator.ts";
import { roundResult } from "@/format.ts";
import type { AngleMode } from "@/types/angle-mode.ts";
import type { EvalContext } from "@/interfaces/eval-context.ts";
import type { ExactValue } from "@/interfaces/exact-value.ts";
import type { RegisterName } from "@/types/register-name.ts";

/**
 * What an expression means beyond its own tokens.
 *
 * The angle mode, the previous answer and the stored letters are three
 * different-looking things that share one rule: the same text evaluates to a
 * different number when any of them changes. They share a second rule too,
 * which is what makes them one object rather than three fields -- they all
 * survive AC, while everything else about a calculation does not.
 *
 * It does the evaluating as well, which is the point. The context those three
 * make up was being spelled out at every call site, so the way to stop
 * spelling it three times is to keep it where it is read.
 *
 * There is deliberately no clear(): AC does not reach in here. A method named
 * for it would invite exactly the wiring that would make it.
 */
export class Environment {
  #angleMode: AngleMode = "rad";
  #lastAnswer: number | null = null;
  #registers: Partial<Record<RegisterName, number>> = {};

  /** How trigonometry reads its arguments. */
  get angleMode(): AngleMode {
    return this.#angleMode;
  }

  set angleMode(mode: AngleMode) {
    this.#angleMode = mode;
  }

  /** What Ans refers to, or null before anything has been computed. */
  get lastAnswer(): number | null {
    return this.#lastAnswer;
  }

  /** Keep an answer for Ans, rounded as everything on the display is. */
  remember(value: number): void {
    this.#lastAnswer = roundResult(value);
  }

  /** The values stored under A, B, C and D. */
  get registers(): Readonly<Partial<Record<RegisterName, number>>> {
    return this.#registers;
  }

  /**
   * Put a value under a letter.
   *
   * A fresh object rather than a mutation, because callers hold on to what the
   * getter handed them and compare it against what comes next.
   */
  store(name: RegisterName, value: number): void {
    this.#registers = { ...this.#registers, [name]: value };
  }

  clearRegister(name: RegisterName): void {
    const next = { ...this.#registers };
    delete next[name];
    this.#registers = next;
  }

  /** Everything an expression needs to know that is not in the expression. */
  get context(): EvalContext {
    return {
      angleMode: this.#angleMode,
      ans: this.#lastAnswer ?? undefined,
      registers: this.#registers,
    };
  }

  /** Work out what an expression comes to. Throws what the parser throws. */
  evaluate(expression: string): number {
    return evaluateString(expression, this.context);
  }

  /**
   * The same, rounded for the display, or null if it does not work out.
   *
   * For the live preview, where a half-typed expression is the normal case and
   * not an error worth reporting.
   */
  tryEvaluate(expression: string): string | null {
    if (expression === "") return null;
    try {
      const value = this.evaluate(expression);
      return Number.isFinite(value) ? roundResult(value).toString() : null;
    } catch {
      return null;
    }
  }

  /** The exact reading of an expression, where it has one. */
  exactValueOf(expression: string): ExactValue | null {
    try {
      return evaluateExactRpn(toRpn(tokenize(expression)), this.context);
    } catch {
      return null;
    }
  }

  /** Bring back what survived the last visit. */
  restore(state: {
    lastAnswer?: number | null | undefined;
    registers?: Readonly<Partial<Record<RegisterName, number>>> | undefined;
  }): void {
    this.#lastAnswer = state.lastAnswer ?? null;
    this.#registers = { ...(state.registers ?? {}) };
  }
}
