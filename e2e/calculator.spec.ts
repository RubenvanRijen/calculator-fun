import { test, expect, type Page } from "@playwright/test";

/**
 * Click keypad buttons by their label, as a user would. Scoped to the keypad,
 * because some labels (1/x) also appear as graph example chips.
 */
async function press(page: Page, ...labels: string[]): Promise<void> {
  const keypad = page.locator(".calculator-grid");
  for (const label of labels) {
    await keypad.getByRole("button", { name: label, exact: true }).click();
  }
}

const result = (page: Page) => page.locator("[data-result]");
const expression = (page: Page) => page.locator("[data-expression]");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  // Start every test from a clean slate, since state now persists.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe("arithmetic", () => {
  test("respects operator precedence", async ({ page }) => {
    await press(page, "2", "+", "3", "*", "4", "=");
    await expect(result(page)).toHaveText("14");
  });

  test("parentheses override precedence", async ({ page }) => {
    await press(page, "(", "2", "+", "3", ")", "*", "4", "=");
    await expect(result(page)).toHaveText("20");
  });

  test("previews the result live while typing", async ({ page }) => {
    await press(page, "2", "+", "3");
    await expect(expression(page)).toHaveText("2 + 3");
    await expect(result(page)).toHaveText("5");
  });

  test("groups thousands", async ({ page }) => {
    await press(page, "1", "0", "0", "0", "*", "1", "0", "=");
    await expect(result(page)).toHaveText("10,000");
  });

  test("trims floating point noise", async ({ page }) => {
    await press(page, "0", ".", "1", "+", "0", ".", "2", "=");
    await expect(result(page)).toHaveText("0.3");
  });

  test("repeats the last operation on a second =", async ({ page }) => {
    await press(page, "5", "+", "3", "=");
    await expect(result(page)).toHaveText("8");
    await press(page, "=");
    await expect(result(page)).toHaveText("11");
  });

  test("shows a divide-by-zero error in the page, not a dialog", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (dialog) => { dialogs += 1; void dialog.dismiss(); });
    await press(page, "5", "÷", "0", "=");
    await expect(page.locator("[data-error]")).toHaveText("Cannot divide by zero");
    expect(dialogs).toBe(0);
  });
});

test.describe("scientific keys", () => {
  test("squares, reciprocates, roots and knows pi", async ({ page }) => {
    await press(page, "5", "x²", "=");
    await expect(result(page)).toHaveText("25");

    // Exact by default: the question had no decimal point in it.
    await press(page, "AC", "4", "1/x", "=");
    await expect(result(page)).toHaveText("1/4");

    await press(page, "AC", "√", "9", "=");
    await expect(result(page)).toHaveText("3");

    await press(page, "AC", "π", "=");
    await expect(result(page)).toHaveText("π");
  });

  test("raises to a power through 2nd", async ({ page }) => {
    await press(page, "2", "2nd");
    await page.locator('[data-keypad] [data-action="square"]').click();
    await press(page, "1", "0", "=");
    await expect(result(page)).toHaveText("1,024");
  });

  test("percent reads as 'percent of' in an addition", async ({ page }) => {
    await press(page, "5", "0", "+", "1", "0", "%", "=");
    await expect(result(page)).toHaveText("55");
  });
});

test.describe("the 2nd shift layer", () => {
  const keypad = (page: Page) => page.locator("[data-keypad]");

  test("reveals the alternate legend and hides the primary", async ({ page }) => {
    const root = page.locator('[data-keypad] button[data-arg="\u03c0"]');
    // The accessible name, not textContent: the inactive legend is display:none
    // so it stays out of the accessibility tree, which is what keeps
    // getByRole("button", { name }) unambiguous.
    await expect(root).toHaveAccessibleName("\u03c0");
    await expect(root.locator(".legend-alt")).toBeHidden();

    await press(page, "2nd");
    await expect(keypad(page)).toHaveAttribute("data-shift", "on");
    await expect(root).toHaveAccessibleName("e");
    await expect(root.locator(".legend")).toBeHidden();
  });

  test("runs the alternate action, then drops the shift", async ({ page }) => {
    await press(page, "2nd");
    await page.locator('[data-keypad] button[data-arg="\u03c0"]').click();
    await expect(expression(page)).toHaveText("(e)");
    await expect(keypad(page)).not.toHaveAttribute("data-shift", "on");
  });

  test("2nd pressed twice cancels", async ({ page }) => {
    await press(page, "2nd", "2nd");
    await expect(keypad(page)).not.toHaveAttribute("data-shift", "on");
  });

  test("reaches abs through 2nd on the root key", async ({ page }) => {
    await press(page, "2nd");
    await page.locator('[data-keypad] button[data-arg="sqrt"]').click();
    await press(page, "5", "\u00b1", ")", "=");
    await expect(result(page)).toHaveText("5");
  });

  test("reaches clear-history through 2nd on MC", async ({ page }) => {
    await press(page, "1", "+", "1", "=");
    await expect(page.locator(".history-entry")).toHaveCount(1);
    await press(page, "2nd");
    await page.locator('[data-keypad] button[data-arg="clear"]').click();
    await expect(page.locator(".history-entry")).toHaveCount(0);
  });
});

test.describe("trigonometry and angle modes", () => {
  const angle = (page: Page) => page.locator("[data-angle-indicator]");

  test("starts in radians and cycles with the mode key", async ({ page }) => {
    await expect(angle(page)).toHaveText("RAD");
    await press(page, "mode");
    await expect(angle(page)).toHaveText("GRAD");
    await press(page, "mode");
    await expect(angle(page)).toHaveText("DEG");
    await press(page, "mode");
    await expect(angle(page)).toHaveText("RAD");
  });

  test("cos(60) is 0.5 in degrees", async ({ page }) => {
    await press(page, "mode", "mode"); // rad -> grad -> deg
    await expect(angle(page)).toHaveText("DEG");
    await press(page, "cos", "6", "0", ")", "=");
    await expect(result(page)).toHaveText("1/2");
  });

  test("the same keys mean something else in radians", async ({ page }) => {
    await press(page, "cos", "6", "0", ")", "=");
    await expect(result(page)).toHaveText("-0.952412980415");
  });

  test("reaches inverse trig through 2nd", async ({ page }) => {
    await press(page, "mode", "mode");
    await press(page, "2nd");
    await page.locator('[data-keypad] button[data-arg="sin"]').click();
    await press(page, "1", ")", "=");
    await expect(result(page)).toHaveText("90");
  });

  test("wires up log and ln", async ({ page }) => {
    await press(page, "log", "1", "0", "0", "0", ")", "=");
    await expect(result(page)).toHaveText("3");
    await press(page, "AC", "ln", "1", ")", "=");
    await expect(result(page)).toHaveText("0");
  });

  test("reaches 10^ and e^ through 2nd", async ({ page }) => {
    await press(page, "2nd");
    await page.locator('[data-keypad] button[data-arg="log"]').click();
    await press(page, "3", ")", "=");
    await expect(result(page)).toHaveText("1,000");

    await press(page, "AC", "2nd");
    await page.locator('[data-keypad] button[data-arg="ln"]').click();
    await press(page, "0", ")", "=");
    await expect(result(page)).toHaveText("1");
  });

  test("remembers the angle mode across a reload", async ({ page }) => {
    await press(page, "mode", "mode");
    await expect(angle(page)).toHaveText("DEG");
    await page.reload();
    await expect(angle(page)).toHaveText("DEG");
  });
});

test.describe("exact answers", () => {
  test("shows a fraction rather than a decimal", async ({ page }) => {
    await press(page, "1", "÷", "3", "=");
    await expect(result(page)).toHaveText("1/3");
    await expect(page.locator("[data-exact-indicator]")).toBeVisible();
  });

  test("shows a surd", async ({ page }) => {
    await press(page, "√", "8", ")", "=");
    await expect(result(page)).toHaveText("2√2");
  });

  test("shows an exact trig value", async ({ page }) => {
    await press(page, "mode", "mode"); // rad -> grad -> deg
    await press(page, "sin", "4", "5", ")", "=");
    await expect(result(page)).toHaveText("√2/2");
  });

  test("F<->D swaps to the decimal and back", async ({ page }) => {
    await press(page, "1", "÷", "3", "=", "2nd");
    await page.locator('[data-keypad] [data-action="fraction"]').click();
    await expect(result(page)).toHaveText("0.333333333333");
    await expect(page.locator("[data-exact-indicator]")).toBeHidden();
  });

  test("a decimal question keeps a decimal answer", async ({ page }) => {
    await press(page, "0", ".", "1", "+", "0", ".", "2", "=");
    await expect(result(page)).toHaveText("0.3");
    await expect(page.locator("[data-exact-indicator]")).toBeHidden();
  });

  test("carries the exact value into the next calculation", async ({ page }) => {
    await press(page, "1", "÷", "3", "=");
    await expect(result(page)).toHaveText("1/3");
    await press(page, "*", "3", "=");
    // Not 0.999999999999.
    await expect(result(page)).toHaveText("1");
  });

  test("wires up n/d entry", async ({ page }) => {
    await page.locator('[data-keypad] [data-action="fraction"]').click();
    await press(page, "3");
    await page.locator('[data-keypad] [data-action="cursor-right"]').click();
    await press(page, "4", "=");
    await expect(result(page)).toHaveText("3/4");
  });
});

test.describe("stored values and probability", () => {
  test("stores a value and uses it", async ({ page }) => {
    await page.locator('[data-tab="vars"]').click();
    await press(page, "4", "2");
    await page.locator('[data-register="A"] button', { hasText: "Set" }).click();
    await expect(page.locator('[data-register="A"] .register-value')).toHaveText("42");

    await press(page, "AC");
    await page.locator('[data-register="A"] button', { hasText: "Use" }).click();
    await press(page, "+", "8", "=");
    await expect(result(page)).toHaveText("50");
  });

  test("remembers stored values across a reload", async ({ page }) => {
    await page.locator('[data-tab="vars"]').click();
    await press(page, "7");
    await page.locator('[data-register="B"] button', { hasText: "Set" }).click();

    await page.reload();
    await page.locator('[data-tab="vars"]').click();
    await expect(page.locator('[data-register="B"] .register-value')).toHaveText("7");
  });

  test("computes combinations through 2nd", async ({ page }) => {
    await press(page, "5", "2", "2nd");
    await page.locator('[data-keypad] [data-arg-alt="nCr"]').click();
    await press(page, "5", "=");
    await expect(result(page)).toHaveText("2,598,960");
  });

  test("computes a factorial", async ({ page }) => {
    await page.keyboard.type("5!");
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("120");
  });

  test("reports a factorial of something that is not a whole number", async ({ page }) => {
    await page.keyboard.type("2.5!");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-error]")).toContainText("whole number");
  });
});

test.describe("cursor, recall and Ans", () => {
  test("shows a blinking caret while typing", async ({ page }) => {
    await press(page, "1", "2");
    await expect(page.locator("[data-caret]")).toBeAttached();
    await press(page, "+", "1", "=");
    await expect(page.locator("[data-caret]")).toHaveCount(0);
  });

  test("fixes a typo in the middle with the arrow keys", async ({ page }) => {
    await page.keyboard.type("1+99");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("1");
    await expect(expression(page)).toHaveText("1 + 19");
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("20");
  });

  test("moves the caret with the on-screen arrows", async ({ page }) => {
    await press(page, "1", "3");
    await page.locator('[data-action="cursor-left"]').click();
    await press(page, "2");
    await expect(expression(page)).toHaveText("123");
  });

  test("recalls a previous entry with the up arrow", async ({ page }) => {
    await page.keyboard.type("12*12");
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("144");
    await page.keyboard.press("Escape");

    await page.keyboard.press("ArrowUp");
    await expect(expression(page)).toHaveText("12 * 12");
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("144");
  });

  test("Ans carries the last result forward", async ({ page }) => {
    await press(page, "5", "*", "7", "=");
    await expect(result(page)).toHaveText("35");
    await press(page, "Ans", "+", "1", "=");
    await expect(result(page)).toHaveText("36");
  });

  test("says so when there is no previous answer", async ({ page }) => {
    await press(page, "Ans", "=");
    await expect(page.locator("[data-error]")).toHaveText("No previous answer");
  });
});

test.describe("keyboard", () => {
  test("drives the whole calculator", async ({ page }) => {
    await page.keyboard.type("12+3*4");
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("24");
  });

  test("maps / onto ÷", async ({ page }) => {
    await page.keyboard.type("8/2");
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("4");
  });

  test("Backspace deletes and Escape clears", async ({ page }) => {
    await page.keyboard.type("123");
    await page.keyboard.press("Backspace");
    await expect(expression(page)).toHaveText("12");
    await page.keyboard.press("Escape");
    await expect(expression(page)).toHaveText("");
  });

  test("does not fire twice when a button has focus", async ({ page }) => {
    await page.keyboard.type("2+3");
    await page.getByRole("button", { name: "=", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(result(page)).toHaveText("5");
  });
});

test.describe("memory", () => {
  test("stores, recalls and clears", async ({ page }) => {
    const indicator = page.locator("[data-memory-indicator]");
    await expect(indicator).toBeHidden();

    await press(page, "7", "M+");
    await expect(indicator).toBeVisible();

    await press(page, "AC", "MR");
    await expect(expression(page)).toHaveText("7");

    await press(page, "MC");
    await expect(indicator).toBeHidden();
  });
});

test.describe("history", () => {
  test("records sums and recalls them on click", async ({ page }) => {
    await press(page, "1", "2", "+", "3", "=");
    const entry = page.locator(".history-entry").first();
    await expect(entry).toContainText("12 + 3");

    await press(page, "AC");
    await entry.click();
    await expect(expression(page)).toHaveText("15");
  });

  test("clears", async ({ page }) => {
    await press(page, "1", "+", "1", "=");
    await expect(page.locator(".history-entry")).toHaveCount(1);
    await page.locator("[data-history-clear]").click();
    await expect(page.locator(".history-entry")).toHaveCount(0);
  });
});

test.describe("persistence", () => {
  test("survives a reload", async ({ page }) => {
    await press(page, "1", "2", "+", "3", "=");
    await press(page, "7", "M+");

    await page.reload();

    await expect(page.locator(".history-entry")).toHaveCount(1);
    await expect(page.locator("[data-memory-indicator]")).toBeVisible();
  });

  test("remembers the theme", async ({ page }) => {
    const before = await page.locator("html").getAttribute("data-theme");
    await page.locator("[data-theme-toggle]").click();
    const after = await page.locator("html").getAttribute("data-theme");
    expect(after).not.toBe(before);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", after ?? "");
  });
});

test.describe("graph", () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('[data-tab="graph"]').click();
  });

  test("plots the default function", async ({ page }) => {
    await expect(page.locator("[data-graph-svg] path.plot-line")).toHaveCount(1);
    await expect(page.locator("[data-graph-svg] line.plot-axis")).toHaveCount(2);
  });

  test("plots a second function in its own colour", async ({ page }) => {
    await page.locator('[data-graph-input="1"]').fill("x");
    await expect(page.locator('[data-graph-svg] path[data-series="1"]')).toHaveCount(1);
  });

  test("breaks a discontinuous function into several curves", async ({ page }) => {
    await page.locator('[data-graph-input="0"]').fill("1/x");
    const paths = page.locator("[data-graph-svg] path.plot-line");
    expect(await paths.count()).toBeGreaterThanOrEqual(2);
  });

  test("reports an unparseable expression", async ({ page }) => {
    await page.locator('[data-graph-input="0"]').fill("x^^2");
    await expect(page.locator("[data-graph-error]")).toBeVisible();
  });

  test("traces the curve on hover", async ({ page, isMobile }) => {
    // Hovering without pressing is not a gesture a touch device has.
    test.skip(isMobile === true, "pointer hover is not available on touch");
    const svg = page.locator("[data-graph-svg]");
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
    // The readout names which series is being traced, now there can be four.
    await expect(page.locator("[data-graph-readout]")).toContainText("Y1");
    await expect(page.locator("[data-graph-readout]")).toContainText("y =");
    await expect(page.locator("[data-graph-marker]")).toHaveAttribute("visibility", "visible");
  });

  test("zooms and resets the range", async ({ page }) => {
    await page.locator('[data-graph-zoom="in"]').click();
    await expect(page.locator("[data-graph-min]")).toHaveValue("-5");
    await page.locator('[data-graph-zoom="reset"]').click();
    await expect(page.locator("[data-graph-min]")).toHaveValue("-10");
  });

  test("traces with the on-screen arrows", async ({ page }) => {
    await page.locator('[data-graph-step="1"]').click();
    await expect(page.locator("[data-graph-readout]")).toContainText("Y1");
    await expect(page.locator("[data-graph-marker]")).toHaveAttribute("visibility", "visible");
  });

  test("finds a root of the default curve", async ({ page }) => {
    // Y1 is x^2-2, whose roots are the square roots of two.
    await page.locator('[data-graph-find="root"]').click();
    await expect(page.locator("[data-graph-readout]")).toContainText("1.414");
  });

  test("finds the vertex", async ({ page }) => {
    await page.locator('[data-graph-find="min"]').click();
    await expect(page.locator("[data-graph-readout]")).toContainText("x = 0");
    await expect(page.locator("[data-graph-readout]")).toContainText("y = -2");
  });

  test("finds where two curves cross", async ({ page }) => {
    await page.locator('[data-graph-input="1"]').fill("x");
    await page.locator('[data-graph-find="intersect"]').click();
    await expect(page.locator("[data-graph-readout]")).toContainText("x = -1");
  });

  test("names the field an error came from", async ({ page }) => {
    await page.locator('[data-graph-input="1"]').fill("wobble(x)");
    await expect(page.locator("[data-graph-error]")).toContainText("Y2:");
  });

  test("tabulates the same functions as the graph", async ({ page }) => {
    await page.locator('[data-graph-input="1"]').fill("2*x");
    await page.locator('[data-tab="table"]').click();

    const headers = page.locator("[data-table-head] th");
    await expect(headers).toHaveText(["x", "Y1", "Y2"]);

    // Y1 is x^2-2 and Y2 is 2x, from 0 in steps of 1.
    const secondRow = page.locator("[data-table-body] tr").nth(1);
    await expect(secondRow.locator("th, td")).toHaveText(["1", "-1", "2"]);
  });

  test("pages the table and follows the step", async ({ page }) => {
    await page.locator('[data-tab="table"]').click();
    await page.locator("[data-table-step]").fill("0.5");

    const firstCell = page.locator("[data-table-body] tr").first().locator("th");
    await expect(firstCell).toHaveText("0");

    await page.locator('[data-table-page="1"]').click();
    await expect(firstCell).toHaveText("10");
  });

  test("the table header stays put and stays readable while rows scroll", async ({ page }) => {
    await page.locator('[data-tab="table"]').click();
    const header = page.locator("[data-table-head] th").first();

    const before = await header.boundingBox();
    await page.locator('[data-panel="table"] .table-wrap').evaluate((box) => {
      box.scrollTop = 200;
    });
    const after = await header.boundingBox();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1);

    // Rows scroll underneath a sticky header, so a see-through one shows them
    // straight through the labels. An opaque colour computes as rgb(), not rgba().
    const background = await header.evaluate((cell) => getComputedStyle(cell).backgroundColor);
    expect(background).not.toContain("rgba");
  });

  test("summarises a list and fits a line to it", async ({ page }) => {
    await page.locator('[data-tab="stats"]').click();

    // y = 3x + 1, exactly.
    for (const [row, x] of [0, 1, 2, 3].entries()) {
      await page.locator(`[data-stats-cell="L1"][data-stats-row="${row}"]`).fill(String(x));
      await page.locator(`[data-stats-cell="L2"][data-stats-row="${row}"]`).fill(String(3 * x + 1));
    }

    const summary = page.locator("[data-stats-summary]");
    await expect(summary).toContainText("1.5");
    await expect(page.locator("[data-stats-fit]")).toContainText("y = 3x + 1");
    await expect(page.locator("[data-stats-fit]")).toContainText("r² = 1");
  });

  test("plots the scatter with its fitted line", async ({ page }) => {
    await page.locator('[data-tab="stats"]').click();
    for (const [row, x] of [1, 2, 3, 4].entries()) {
      await page.locator(`[data-stats-cell="L1"][data-stats-row="${row}"]`).fill(String(x));
      await page.locator(`[data-stats-cell="L2"][data-stats-row="${row}"]`).fill(String(2 * x));
    }
    await page.locator('[data-stats-action="plot"]').click();

    // It moves to the graph, draws a point per row, and shows the line in the
    // first free field rather than over the top of Y1.
    await expect(page.locator('[data-panel="graph"]')).toBeVisible();
    await expect(page.locator("[data-graph-point]")).toHaveCount(4);
    await expect(page.locator('[data-graph-input="1"]')).toHaveValue("2*x+0");
  });

  test("turns the scatter off from the graph", async ({ page }) => {
    await page.locator('[data-tab="stats"]').click();
    for (const [row, x] of [1, 2, 3].entries()) {
      await page.locator(`[data-stats-cell="L1"][data-stats-row="${row}"]`).fill(String(x));
      await page.locator(`[data-stats-cell="L2"][data-stats-row="${row}"]`).fill(String(2 * x));
    }
    await page.locator('[data-stats-action="plot"]').click();
    await expect(page.locator("[data-graph-point]")).toHaveCount(3);

    // Without a way off, an ordinary curve would go on being drawn against
    // the data's scale, far off the top of the box.
    await page.locator("[data-graph-scatter]").click();
    await expect(page.locator("[data-graph-point]")).toHaveCount(0);
    await expect(page.locator("[data-graph-scatter]")).toHaveAttribute("aria-pressed", "false");
  });

  test("keeps the lists across a reload", async ({ page }) => {
    await page.locator('[data-tab="stats"]').click();
    await page.locator('[data-stats-cell="L1"][data-stats-row="0"]').fill("42");

    await page.reload();
    await page.locator('[data-tab="stats"]').click();
    await expect(page.locator('[data-stats-cell="L1"][data-stats-row="0"]')).toHaveValue("42");
  });

  test("reports a slope and an area on the graph", async ({ page }) => {
    await page.locator('[data-graph-input="0"]').fill("x^2");
    const readout = page.locator("[data-graph-readout]");

    // The window is -10 to 10, so the middle is 0, where x^2 is flat.
    await page.locator('[data-graph-find="slope"]').click();
    await expect(readout).toContainText("dy/dx = 0");

    // x^2 over -10 to 10 is 2000/3.
    await page.locator('[data-graph-find="area"]').click();
    await expect(readout).toContainText("666.7");
    await expect(page.locator("[data-graph-area]").first()).toBeVisible();
  });

  test("enters a mixed number and gets one back", async ({ page }) => {
    // 2nd then 1/x reaches U n/d, which lays out a whole part and a fraction.
    await press(page, "2nd");
    await page.locator('[data-action-alt="mixed-fraction"]').click();
    await press(page, "2");
    await page.locator('[data-action="cursor-right"]').click();
    await press(page, "1");
    await page.locator('[data-action="cursor-right"]').click();
    await press(page, "3", "=");

    await expect(result(page)).toHaveText("2 1/3");
  });

  test("enters a number in scientific notation", async ({ page }) => {
    await press(page, "2", "2nd");
    await page.locator('[data-action-alt="exponent"]').click();
    await press(page, "5");

    // The exponent is part of the number, not a sum beside it.
    await expect(expression(page)).toContainText("2e5");
    await press(page, "=");
    await expect(result(page)).toHaveText("200,000");
  });

  test("keeps every tab inside the panel", async ({ page }) => {
    // Each new tab has squeezed this row, and the last one was cut off the
    // edge when the sixth arrived. Neither the unit suite nor the typechecker
    // can see a tab fall off a panel.
    const panel = await page.locator(".panel").boundingBox();
    const tabs = page.locator(".tab");

    for (let index = 0; index < (await tabs.count()); index += 1) {
      const box = await tabs.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x ?? 0).toBeGreaterThanOrEqual((panel?.x ?? 0) - 1);
      expect((box?.x ?? 0) + (box?.width ?? 0))
        .toBeLessThanOrEqual((panel?.x ?? 0) + (panel?.width ?? 0) + 1);
    }
  });

  test("multiplies two matrices", async ({ page }) => {
    await page.locator('[data-tab="matrix"]').click();

    const fill = async (name: string, grid: number[][]) => {
      for (const [row, values] of grid.entries()) {
        for (const [column, value] of values.entries()) {
          await page
            .locator(`[data-matrix-cell="${name}"][data-matrix-row="${row}"][data-matrix-column="${column}"]`)
            .fill(String(value));
        }
      }
    };
    await fill("A", [[1, 2], [3, 4]]);
    await fill("B", [[5, 6], [7, 8]]);
    await page.locator('[data-matrix-do="multiply"]').click();

    const cells = page.locator("[data-matrix-result] td");
    await expect(cells).toHaveText(["19", "22", "43", "50"]);
  });

  test("says why a matrix has no inverse", async ({ page }) => {
    await page.locator('[data-tab="matrix"]').click();
    // The second row is twice the first, so there is no inverse to find.
    await page.locator('[data-matrix-cell="A"][data-matrix-row="0"][data-matrix-column="0"]').fill("1");
    await page.locator('[data-matrix-cell="A"][data-matrix-row="0"][data-matrix-column="1"]').fill("2");
    await page.locator('[data-matrix-cell="A"][data-matrix-row="1"][data-matrix-column="0"]').fill("2");
    await page.locator('[data-matrix-cell="A"][data-matrix-row="1"][data-matrix-column="1"]').fill("4");

    await page.locator('[data-matrix-do="inverse-A"]').click();
    await expect(page.locator("[data-matrix-error]")).toContainText("singular");
  });

  test("keeps typing in a matrix cell from losing the caret", async ({ page }) => {
    await page.locator('[data-tab="matrix"]').click();
    const cell = page.locator('[data-matrix-cell="A"][data-matrix-row="0"][data-matrix-column="0"]');

    // Typed key by key, as a person does: a grid rebuilt on each keystroke
    // would replace this element and drop the rest of the number on the floor.
    await cell.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("123");
    await expect(cell).toHaveValue("123");
    await expect(cell).toBeFocused();
  });

  test("keeps the matrices across a reload", async ({ page }) => {
    await page.locator('[data-tab="matrix"]').click();
    await page.locator('[data-matrix-cell="B"][data-matrix-row="1"][data-matrix-column="1"]').fill("9");

    await page.reload();
    await page.locator('[data-tab="matrix"]').click();
    await expect(
      page.locator('[data-matrix-cell="B"][data-matrix-row="1"][data-matrix-column="1"]')
    ).toHaveValue("9");
  });

  test("typing in the graph input does not drive the keypad", async ({ page }) => {
    await page.locator('[data-graph-input="0"]').fill("x+5");
    await expect(expression(page)).toHaveText("");
  });
});

test("has no console errors on load", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/index.html");
  await press(page, "1", "+", "1", "=");

  expect(errors).toEqual([]);
});
