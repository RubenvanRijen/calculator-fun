import type { Calculator } from "@/calculator.ts";
import type { RegisterName } from "@/types/register-name.ts";
import { REGISTER_NAMES as NAMES } from "@/expression.ts";

/**
 * The Vars tab: one row per letter, showing what is stored and offering to
 * store the displayed value or use the letter in an expression.
 *
 * A panel rather than keypad keys, because storing needs a letter to be picked
 * and the keypad has no letters -- and because seeing all four at once is more
 * use than a sequence of keystrokes.
 */
export class RegisterPanel {
  readonly #list: HTMLElement | null;
  readonly #doc: Document;
  readonly #calculator: Calculator;
  readonly #onChange: () => void;

  constructor(
    root: Document | HTMLElement,
    doc: Document,
    signal: AbortSignal,
    calculator: Calculator,
    onChange: () => void
  ) {
    this.#list = root.querySelector<HTMLElement>("[data-register-list]");
    this.#doc = doc;
    this.#calculator = calculator;
    this.#onChange = onChange;

    // One listener on the list, not one per button: the rows are rebuilt on
    // every keystroke, and per-button listeners bound to a page-lifetime
    // signal would accumulate for as long as the session lasts.
    this.#list?.addEventListener("click", (event) => this.#handleClick(event), {
      signal,
    });
  }

  #handleClick(event: Event): void {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLElement>("button[data-register-action]")
      : null;
    if (button === null) return;

    const name = button.dataset["registerName"];
    const register = NAMES.find((candidate) => candidate === name);
    if (register === undefined) return;

    switch (button.dataset["registerAction"]) {
      case "set": this.#calculator.store(register); break;
      case "use": this.#calculator.appendRegister(register); break;
      case "clear": this.#calculator.clearRegister(register); break;
      default: return;
    }
    this.#onChange();
  }

  render(): void {
    if (!this.#list) return;
    this.#list.replaceChildren(...NAMES.map((name) => this.#renderRow(name)));
  }

  #renderRow(name: RegisterName): HTMLElement {
    const stored = this.#calculator.registers[name];

    const row = this.#doc.createElement("li");
    row.className = "register-row";
    row.dataset["register"] = name;

    const letter = this.#doc.createElement("span");
    letter.className = "register-letter";
    letter.textContent = name;

    const value = this.#doc.createElement("span");
    value.className = "register-value";
    value.textContent = stored === undefined ? "empty" : String(stored);
    if (stored === undefined) value.classList.add("muted");

    row.append(
      letter,
      value,
      this.#button(name, "set", "Set", `Store the display in ${name}`),
      this.#button(name, "use", "Use", `Insert ${name}`)
    );

    if (stored !== undefined) {
      row.append(this.#button(name, "clear", "Clear", `Empty ${name}`));
    }

    return row;
  }

  #button(
    name: RegisterName,
    action: string,
    label: string,
    description: string
  ): HTMLElement {
    const button = this.#doc.createElement("button");
    button.type = "button";
    button.className = "link-button";
    button.textContent = label;
    button.setAttribute("aria-label", description);
    button.dataset["registerAction"] = action;
    button.dataset["registerName"] = name;
    return button;
  }
}
