import { isOperation } from "../expression.js";
import type { Calculator } from "../calculator.js";
import type { AngleMode } from "../types/angle-mode.js";

/** How long a key flashes when driven from the keyboard. */
const FLASH_MS = 120;

/** deg -> rad -> grad -> deg, the order the mode key cycles through. */
function nextAngleMode(mode: AngleMode): AngleMode {
  if (mode === "deg") return "rad";
  if (mode === "rad") return "grad";
  return "deg";
}

/**
 * The keys, the 2nd shift layer and the keyboard.
 *
 * Every key declares `data-action` (plus an optional `data-arg`), so adding a
 * key is a markup change rather than another listener registration. A key may
 * also declare `data-action-alt`, reached through the `2nd` shift.
 */
export class Keypad {
  readonly #element: HTMLElement;
  readonly #calculator: Calculator;
  readonly #onChange: () => void;
  readonly #actions: Record<string, (arg: string | undefined) => void>;
  readonly #buttonsByLabel = new Map<string, HTMLElement>();
  readonly #secondKey: HTMLElement | null;

  #shifted = false;

  constructor(
    root: Document | HTMLElement,
    doc: Document,
    calculator: Calculator,
    signal: AbortSignal,
    onChange: () => void
  ) {
    const element = root.querySelector<HTMLElement>("[data-keypad]");
    // Every key is wired through this wrapper, so its absence would leave a
    // page where nothing responds and nothing explains why.
    if (!element) throw new Error("Calculator markup is missing [data-keypad].");

    this.#element = element;
    this.#calculator = calculator;
    this.#onChange = onChange;
    this.#secondKey = element.querySelector<HTMLElement>('[data-action="second"]');

    this.#actions = {
      number: (arg) => { if (arg) calculator.appendNumber(arg); },
      operation: (arg) => {
        if (arg !== undefined && isOperation(arg)) calculator.chooseOperation(arg);
      },
      // A missing data-arg is a markup mistake; doing nothing beats appending a
      // stray "(" or an empty constant.
      function: (arg) => { if (arg) calculator.appendFunction(arg); },
      constant: (arg) => { if (arg) calculator.appendConstant(arg); },
      insert: (arg) => { if (arg) calculator.insert(arg); },
      memory: (arg) => {
        switch (arg) {
          case "add": calculator.memoryAdd(); break;
          case "subtract": calculator.memorySubtract(); break;
          case "recall": calculator.memoryRecall(); break;
          case "clear": calculator.memoryClear(); break;
        }
      },
      equals: () => calculator.compute(),
      clear: () => calculator.clear(),
      delete: () => calculator.delete(),
      sign: () => calculator.toggleSign(),
      percent: () => calculator.percent(),
      square: () => calculator.square(),
      reciprocal: () => calculator.reciprocal(),
      "open-paren": () => calculator.openParen(),
      "close-paren": () => calculator.closeParen(),
      "clear-history": () => calculator.clearHistory(),
      "angle-mode": () => {
        calculator.angleMode = nextAngleMode(calculator.angleMode);
      },
      second: () => this.#setShift(!this.#shifted),
    };

    for (const button of root.querySelectorAll<HTMLElement>("button")) {
      // Keypad keys carry their primary label in .legend and an optional 2nd
      // label in .legend-alt; other buttons are plain text.
      const label = (button.querySelector(".legend") ?? button).textContent?.trim();
      if (label && !this.#buttonsByLabel.has(label)) {
        this.#buttonsByLabel.set(label, button);
      }
    }

    // Establish the resting state up front, so data-shift and aria-pressed are
    // both meaningful before the key is ever touched.
    this.#setShift(false);

    element.addEventListener("click", (event) => this.#handleClick(event), { signal });
    doc.addEventListener("keydown", (event) => this.#handleKeydown(event), { signal });
  }

  /** Every action name the markup may reference, for verification in tests. */
  get actionNames(): ReadonlySet<string> {
    return new Set(Object.keys(this.#actions));
  }

  /** Anything outside the keypad also spends a pending shift. */
  spendShift(): boolean {
    if (!this.#shifted) return false;
    this.#setShift(false);
    return true;
  }

  #setShift(value: boolean): void {
    this.#shifted = value;
    this.#element.dataset["shift"] = value ? "on" : "off";
    // The legend swap is purely visual, so the state has to be announced too.
    this.#secondKey?.setAttribute("aria-pressed", String(value));
  }

  #handleClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("button[data-action]")
      : null;

    if (!target || !this.#element.contains(target)) {
      // A click inside the keypad that missed a key -- the display, a gutter --
      // still spends a pending shift.
      if (this.spendShift()) this.#onChange();
      return;
    }

    // A real mouse click leaves focus on the key, so a following Enter would
    // re-activate that key instead of computing. Keyboard activation reports
    // detail 0 and must keep focus where it is, for tab order's sake.
    if (event instanceof MouseEvent && event.detail > 0) target.blur();

    const alt = target.dataset["actionAlt"];
    const useAlt = this.#shifted && alt !== undefined;
    const name = useAlt ? alt : target.dataset["action"] ?? "";
    const arg = useAlt ? target.dataset["argAlt"] : target.dataset["arg"];

    this.#actions[name]?.(arg);
    // The shift lasts for exactly one key, as it does on the hardware. This
    // runs even when the action is unknown, so a bad `data-action` cannot
    // leave the keypad latched in its alternate layer.
    if (name !== "second") this.#setShift(false);
    this.#onChange();
  }

  /** Map a keypress onto the same action a key performs. */
  #applyKey(key: string): string | null {
    const calculator = this.#calculator;
    if (/^[0-9]$/.test(key) || key === ".") {
      calculator.appendNumber(key);
      return key;
    }
    // "/" is what a keyboard offers; the button is labelled "÷".
    const operation = key === "/" ? "÷" : key;
    if (isOperation(operation)) {
      calculator.chooseOperation(operation);
      return operation === "^" ? "xⁿ" : operation;
    }
    switch (key) {
      case "Enter":
      case "=": calculator.compute(); return "=";
      case "Backspace": calculator.delete(); return "DEL";
      case "Escape": calculator.clear(); return "AC";
      case "%": calculator.percent(); return "%";
      case "(": calculator.openParen(); return "(";
      case ")": calculator.closeParen(); return ")";
      default: return null;
    }
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const active = this.#element.ownerDocument.activeElement;
    // Typing into the graph input must not drive the keypad.
    if (active instanceof HTMLInputElement) return;
    // A focused button handles Enter and Space itself; intercepting here would
    // fire the action twice.
    if ((event.key === "Enter" || event.key === " ") && active instanceof HTMLButtonElement) {
      return;
    }

    const label = this.#applyKey(event.key);
    if (label === null) return;

    event.preventDefault();
    // Typing is a keypress too, so it consumes a pending 2nd just as a click
    // would; otherwise the shift stays latched and catches the next click.
    this.#setShift(false);
    this.#flash(label);
    this.#onChange();
  }

  #flash(label: string): void {
    const button = this.#buttonsByLabel.get(label);
    if (!button) return;
    button.classList.add("is-pressed");
    setTimeout(() => button.classList.remove("is-pressed"), FLASH_MS);
  }
}
