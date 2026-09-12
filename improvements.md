# Improvements

What the two reference calculators — the TI-30XB MultiView and the TI-84 — do
that this one does not yet. Written after the phases that closed the main gap,
so everything here is what is genuinely left rather than a wish list.

Each entry says where it would go, because the parts that matter are already
split: the arithmetic lives in DOM-free modules under `ts/`, and the panels
under `ts/ui/` only draw. Most of these are additions to the first kind.

---

## From the TI-30XB MultiView

### MathPrint display

The headline feature of the "MultiView", and the biggest thing you would
notice side by side. Fractions stacked one number above another with a bar
between, a real radical sign drawn over the whole radicand, exponents raised
into superscript.

Today `ts/format.ts` produces a single line of text and `ts/ui/display.ts`
writes it into a `div`. This would want the display to render a small tree
rather than a string — nested `span`s with CSS, or inline SVG/MathML — and a
caret that still lands in the right place inside it.

The largest job on this list, and the one that would change the most code.
`formatExpressionWithCursor` maps a raw offset to a formatted offset today;
that mapping would become a position in a tree.

### Mixed numbers (`Un/d`)

`n/d` shipped in phase 3; the mixed-number key did not, though the plan named
both. `2 1/3` as an entry, and answers shown as mixed numbers when they are
improper.

`ts/exact.ts` already holds values as `(num · √r · π^k)/den`, so the value side
needs nothing — only entry, and a display rule for when to prefer `2 1/3` over
`7/3`.

### `EE` key — scientific notation entry

There is no way to type `2.5ᴇ6` at the moment. The `e` key deliberately
inserts `(e)` so that `2e5` cannot be read as `2 × e × 5`, which is right, but
it leaves genuine scientific entry with nowhere to go. Needs a token of its own
in `ts/expression.ts` rather than reusing `e`.

### Display modes: `FIX`, `SCI`, `ENG`

A fixed number of decimal places, or forced scientific/engineering notation.
Today `roundResult` in `ts/format.ts` always gives 12 significant digits. This
is a setting threaded through `format.ts` and persisted alongside the angle
mode.

### `x√y` — nth root

Reachable as `x^(1/n)` but with no key. A `2nd` alternate on the `√` key.

---

## From the TI-84

The TI-84 is a programmable graphing calculator, so this list is long. Roughly
in order of how much they would add here.

### More regression types

Quadratic, cubic, exponential, power, logarithmic, logistic, sinusoidal.
`ts/stats.ts` does least-squares linear only. Polynomial fits are the same
normal equations over more terms; exponential and power fits are linear fits
of `ln y` against `x` or `ln x`. Logistic and sinusoidal need iteration and are
a different kind of job.

A picker beside the `plot & fit` chip, and the fitted curve still goes into a
free `Y` slot as it does now.

### Probability distributions

`normalpdf`, `normalcdf`, `invNorm`, `binompdf`, `binomcdf`, `poissonpdf` and
friends. A new `ts/distributions.ts`, and a decision about where they are
reached from: they take several arguments, and the expression engine has no
multi-argument functions on purpose (that is what made `nCr` and `nPr` infix).
Most likely their own panel section, like the statistics figures.

### `L1`–`L6`, and more than two matrices

Both stores are built for a fixed pair: `ts/stat-lists.ts` holds rows of
`{L1, L2}` and `ts/matrices.ts` holds `A` and `B`. Widening them is mostly
mechanical, but the editors would need a way to choose which list or matrix is
on screen rather than showing them all at once.

### More matrix operations

`rref`, `rank`, `augment`, raising a matrix to a power, and solving `Ax = b`.
`ts/matrix.ts` has the elimination machinery already — `rref` is the
Gauss-Jordan loop from `inverse` without the identity alongside it.

### Equation solver

Give it `x² - 5 = 0` and a starting guess, get a root. `ts/analysis.ts` already
finds roots of a curve over a range, so the numeric half exists; what is
missing is the interface for "solve this expression for this variable".

### Parametric, polar and sequence graphing

`ts/graph.ts` samples `y` against `x`. Parametric needs two functions of `t`
and polar needs `r(θ)`, both of which are a different sampling loop feeding the
same drawing code. Sequence mode is further away.

### Complex numbers

Would reach into everything: `Token`, `evaluateRpn`, the exact-value type, the
display. The most invasive item here, and the one most likely to destabilise
what already works.

### Programming (TI-BASIC), the finance app, the catalog

Whole subsystems rather than features. Listed for completeness; each is a
larger project than any single phase so far.

### Smaller graphing conveniences

- Per-equation on/off toggles in the ƒ(x) tab, so a curve can be kept without
  being drawn.
- The fuller zoom menu: `ZSquare`, `ZDecimal`, `ZoomFit`. `ZoomStat` is
  effectively what the `plot & fit` chip already does.
- A `yMin`/`yMax` window, rather than the y-range always being chosen
  automatically.

### `DMS` — degrees, minutes and seconds

Entering and displaying angles as `32°14'6"`. A display format and an entry
key; the angle-mode plumbing it would sit beside already exists.

---

## Suggested order

If the goal is the most noticeable improvement per unit of work:

1. **Mixed numbers** and the **`EE` key** — both small, both fill visible holes.
2. **More regression types** — moderate, and `ts/stats.ts` is shaped for it.
3. **MathPrint** — large, and the one that changes how the calculator looks.
4. Everything else, by appetite.

*`dy/dx` and `∫f(x)dx` were the first item here and are now done.*
