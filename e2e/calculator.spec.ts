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

    await press(page, "AC", "4", "1/x", "=");
    await expect(result(page)).toHaveText("0.25");

    await press(page, "AC", "√", "9", "=");
    await expect(result(page)).toHaveText("3");

    await press(page, "AC", "π", "=");
    await expect(result(page)).toHaveText("3.14159265359");
  });

  test("raises to a power", async ({ page }) => {
    await press(page, "2", "xⁿ", "1", "0", "=");
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
    await expect(result(page)).toHaveText("0.5");
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

  test("plots an example when its chip is clicked", async ({ page }) => {
    await page.locator('[data-graph-example="sin(x)"]').click();
    await expect(page.locator("[data-graph-input]")).toHaveValue("sin(x)");
    await expect(page.locator("[data-graph-svg] path.plot-line")).toHaveCount(1);
  });

  test("breaks a discontinuous function into several curves", async ({ page }) => {
    await page.locator('[data-graph-example="1/x"]').click();
    const paths = page.locator("[data-graph-svg] path.plot-line");
    expect(await paths.count()).toBeGreaterThanOrEqual(2);
  });

  test("reports an unparseable expression", async ({ page }) => {
    await page.locator("[data-graph-input]").fill("x^^2");
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
    await expect(page.locator("[data-graph-readout]")).toContainText("ƒ(x) =");
    await expect(page.locator("[data-graph-marker]")).toHaveAttribute("visibility", "visible");
  });

  test("typing in the graph input does not drive the keypad", async ({ page }) => {
    await page.locator("[data-graph-input]").fill("x+5");
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
