import { applyMatrixOp, isMatrixOp } from "@/ui/matrix-operations.ts";
import { MATRIX_NAMES, MAX_SIZE } from "@/matrices.ts";
import { readNumber } from "@/ui/read-number.ts";
import { queryIn } from "@/ui/query.ts";
import type { MatrixStore } from "@/matrices.ts";
import type { Matrix } from "@/types/matrix.ts";
import type { MatrixOp } from "@/types/matrix-op.ts";
import type { MatrixName } from "@/types/matrix-name.ts";

/**
 * Enough digits for an inverse, few enough to fit four to a row.
 *
 * Whole numbers are printed whole however long they are. Eight significant
 * digits is a reasonable cap on a messy fraction, but a determinant of
 * -137266786 is not messy -- it is the exact answer, worked out by an
 * algorithm chosen for giving exact answers, and rounding it to -137266790
 * on the way to the screen throws that away.
 */
function figure(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
    return String(value);
  }
  return parseFloat(value.toPrecision(8)).toString();
}

/**
 * The Matrix tab: two grids, and the things that can be done to them.
 *
 * Matrices stay out of the expression engine -- there is nowhere in "2 + 3"
 * for a grid to go -- so everything happens here and the answer is shown here.
 */
export function setupMatrixPanel(
  root: Document | HTMLElement,
  doc: Document,
  signal: AbortSignal,
  store: MatrixStore
): { render: () => void } {
  const query = queryIn(root);

  const panel = query('[data-panel="matrix"]');
  const result = query("[data-matrix-result]");
  const errorElement = query("[data-matrix-error]");

  /** Which operation is on screen, so editing a cell brings the answer with it. */
  let showing: MatrixOp | null = null;

  function grid(name: MatrixName): HTMLElement | null {
    return query(`[data-matrix-grid="${name}"]`);
  }

  /** Rebuild one grid's inputs. Only when its shape changes, never on a keystroke. */
  function renderGrid(name: MatrixName): void {
    const host = grid(name);
    if (host === null) return;

    const { rows, columns } = store.size(name);
    const values = store.get(name);
    host.replaceChildren();
    host.style.setProperty("--columns", String(columns));

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const input = doc.createElement("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.className = "cell-input matrix-cell";
        input.value = String(values[row]?.[column] ?? 0);
        input.setAttribute("data-matrix-cell", name);
        input.setAttribute("data-matrix-row", String(row));
        input.setAttribute("data-matrix-column", String(column));
        input.setAttribute("aria-label", `${name} row ${row + 1} column ${column + 1}`);
        host.append(input);
      }
    }
  }

  function renderGrids(): void {
    for (const name of MATRIX_NAMES) {
      renderGrid(name);
      const rows = query<HTMLInputElement>(`[data-matrix-rows="${name}"]`);
      const columns = query<HTMLInputElement>(`[data-matrix-columns="${name}"]`);
      const size = store.size(name);

      // The ceiling is set from the constant the store actually enforces, so
      // the two cannot drift into a spinner that stops at 4 while the store
      // would have taken 5.
      for (const [input, value] of [[rows, size.rows], [columns, size.columns]] as const) {
        if (input === null) continue;
        input.max = String(MAX_SIZE);
        input.value = String(value);
      }
    }
  }

  function showMatrix(value: Matrix): void {
    if (result === null) return;
    const table = doc.createElement("table");
    table.className = "value-table matrix-result";

    const body = doc.createElement("tbody");
    for (const row of value) {
      const tr = doc.createElement("tr");
      for (const entry of row) {
        const td = doc.createElement("td");
        td.textContent = figure(entry);
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
    result.replaceChildren(table);
  }

  function showScalar(label: string, value: number): void {
    if (result === null) return;
    const line = doc.createElement("p");
    line.className = "fit-line";
    line.textContent = `${label} = ${figure(value)}`;
    result.replaceChildren(line);
  }

  /** Work out whatever is on screen again, and say so if it cannot be done. */
  function renderResult(): void {
    if (result === null) return;
    if (showing === null) {
      result.replaceChildren();
      if (errorElement) errorElement.hidden = true;
      return;
    }

    try {
      const outcome = applyMatrixOp(showing, { A: store.get("A"), B: store.get("B") });
      if (outcome.kind === "matrix") showMatrix(outcome.value);
      else showScalar(outcome.label, outcome.value);

      if (errorElement) errorElement.hidden = true;
    } catch (cause) {
      // The message says which rule was broken -- sizes, squareness, or a
      // matrix with no inverse -- and the old answer goes, because it is no
      // longer the answer to anything on screen.
      result.replaceChildren();
      if (errorElement) {
        errorElement.textContent = cause instanceof Error ? cause.message : "Cannot do that";
        errorElement.hidden = false;
      }
    }
  }

  function render(): void {
    // Tabs unhide the panel before asking it to render.
    if (panel?.hidden === true) return;
    renderGrids();
    renderResult();
  }

  // --- wiring ---------------------------------------------------------------
  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const cell = input.dataset["matrixCell"];
    if (cell === "A" || cell === "B") {
      const text = input.value.trim();
      store.set(
        cell,
        Number(input.dataset["matrixRow"]),
        Number(input.dataset["matrixColumn"]),
        text === "" ? 0 : Number(text)
      );
    }

  }, { signal });

  /**
   * Resizing waits for the field to settle, rather than following every key.
   *
   * On "input", typing 12 into a 4-row matrix passes through 1 on the way --
   * which resizes to one row, throwing the other three away, and growing back
   * cannot bring them back. "change" arrives on blur or Enter, once.
   */
  root.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const name = input.dataset["matrixRows"] ?? input.dataset["matrixColumns"];
    if (name !== "A" && name !== "B") return;

    const current = store.size(name);
    store.resize(
      name,
      readNumber(query<HTMLInputElement>(`[data-matrix-rows="${name}"]`), current.rows),
      readNumber(query<HTMLInputElement>(`[data-matrix-columns="${name}"]`), current.columns)
    );

    // A size the store clamped leaves the field showing what was typed, since
    // nothing changed shape and nothing was redrawn.
    renderGrids();
  }, { signal });

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-matrix-do]")
      : null;
    if (button === null) return;

    // Narrowed here rather than compared against nine strings further in: an
    // unknown name used to fall through every branch and leave the previous
    // answer on screen with the error cleared, so a broken button looked
    // exactly like a working one.
    const name = button.dataset["matrixDo"];
    if (!isMatrixOp(name)) return;

    showing = name;
    renderResult();
  }, { signal });

  /** A key that changes when either grid changes shape, and not otherwise. */
  const shapesNow = (): string =>
    MATRIX_NAMES.map((name) => {
      const size = store.size(name);
      return `${name}${size.rows}x${size.columns}`;
    }).join("|");

  let knownShapes = shapesNow();

  store.onChange(() => {
    if (panel?.hidden === true) return;

    // Only a change of shape rebuilds the inputs. Rebuilding them for a value
    // would replace the very element being typed into, losing the caret --
    // and the focus with it -- on every keystroke.
    const shapes = shapesNow();
    if (shapes !== knownShapes) {
      knownShapes = shapes;
      renderGrids();
    }
    renderResult();
  }, signal);

  return { render };
}
