import type { Theme } from "./types/theme.js";

/** The theme the operating system asks for, when the user has no preference. */
export function preferredTheme(view: Window = globalThis.window): Theme {
  try {
    return view.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Stamp the theme on the document root, which is what the CSS keys off. */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  root.dataset["theme"] = theme;
}

/** The other one. */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
