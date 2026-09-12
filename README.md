# calculator-fun

A calculator in TypeScript: real operator precedence, a ƒ(x) grapher,
keyboard support, memory keys, a persistent history panel, light/dark themes,
tests, type checking, Docker and CI.

![Example 1](examples/example-1.png)
![Example 2](examples/example-2.gif)

## Layout

```
ts/
  expression.ts       tokenizer, shunting-yard, RPN evaluator
  calculator.ts       state machine, no DOM
  graph.ts            samples a function across a range
  storage.ts          localStorage, guarded
  theme.ts            light/dark
  index.ts            binds it all to the page
  *.test.ts           unit tests
  types/              one type alias per file
  interfaces/         one interface per file
  enums/              one enum per file
e2e/                Playwright specs (real browser)
docker/             Dockerfile + nginx config
index.html          the page
```

Types, interfaces and enums each live in their own directory, one declaration
per file. No type or interface is declared anywhere else — `calculator.ts` and
`index.ts` import theirs with `import type`, which `verbatimModuleSyntax`
erases entirely, so nothing extra is loaded at runtime.

The calculator logic is kept free of the DOM, so it can be tested without a
browser; `ts/index.ts` is the only part that touches elements and listeners.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173 -- hot reload, no build needed
```

For a production-style build:

```bash
npm run build        # tsc -> dist/, then serve the folder
```

`tsc` emits plain ES modules with their `.js` import extensions intact, so the
browser loads `dist/index.js` directly. There is no bundler in the output —
Vite is used only as the dev server.

## Features

**Operator precedence and parentheses.** `2 + 3 * 4` is `14`, not `20`.
Expressions are tokenized and ordered with the shunting-yard algorithm, then
evaluated as postfix, so `2^3^2` is `512` (right-associative) and `-2^2` is
`-4`. `(` and `)` keys override precedence, a badge shows how many are open,
and any left open are closed for you when you press `=`.

**Live preview.** The upper line shows the expression as typed; the lower line
shows its value as soon as it is valid, so precedence is visible as you go.

**ƒ(x) grapher.** The second tab plots a function of `x` as inline SVG — no
charting library. Supports `sin cos tan sqrt abs ln log`, `π`, `e`, implied
multiplication (`2x`, `3(x+1)`), and adjustable range. Discontinuous functions
such as `1/x` and `tan(x)` are drawn as separate curves rather than joined by
vertical streaks. Hover, or drag a finger, to trace the curve and read off
`x` and `ƒ(x)`.

**Repeat equals.** `5 + 3 =` gives 8; press `=` again for 11, and again for 14.

**Themes.** Light and dark, toggled in the header and remembered.

**Everything persists.** History, memory and theme survive a reload via
`localStorage`, guarded so a private window or a full quota degrades to "no
saved state" rather than breaking.

**Keyboard** — the whole calculator is usable without the mouse:

| Key | Action |
| --- | --- |
| `0`-`9` `.` | digits |
| `+` `-` `*` `/` | operators (`/` maps to the `÷` key) |
| `^` | power |
| `(` `)` | parentheses |
| `%` | percent |
| `Enter` or `=` | compute |
| `Backspace` | delete last character |
| `Escape` | clear |

The matching on-screen key flashes, so the mapping is visible. A focused button
keeps handling its own `Enter`, so nothing fires twice.

**Percent** behaves like a physical calculator: inside a pending `+` or `-` it
reads as "percent of the first operand", so `50 + 10 %` is `55`, not `50.1`.
Inside `*` or `÷` there is no sensible base, so it is a plain division by 100.

**Scientific keys**: `√`, `x²`, `1/x`, `xⁿ`, `π`, plus `±` to flip a sign.

**Memory** (`MC` `MR` `M+` `M-`) with an `M` indicator on the display while
memory holds a non-zero value. Memory survives `AC`.

**History** lists completed sums, newest first, capped at 50. Click an entry to
load its result back into the display. History survives `AC` and has its own
Clear button. A failed sum is not recorded.

**Results are rounded** to 12 significant digits, so `0.1 + 0.2` shows `0.3`
rather than `0.30000000000000004`. That is well inside a double's precision, so
no honest result is changed.

**Errors are inline** — dividing by zero writes a message into the display
rather than opening a browser `alert()`. It clears on the next keypress, and
the operands are left alone so `DEL` can fix the entry.

## Tests

[Vitest](https://vitest.dev). Logic tests run in Node; the tests that exercise
the button wiring opt into jsdom per file.

```bash
npm test             # 221 unit tests
npm run test:watch
npm run coverage     # with thresholds
npm run test:e2e     # Playwright, real browser, desktop + mobile
npm run test:e2e:ui  # the same, in Playwright's UI mode
```

The unit tests run in Node and jsdom. The E2E suite builds `dist/`, serves it
statically and drives a real Chromium — so it exercises the same files the
Docker image ships, catching what jsdom cannot: real rendering, focus, true key
events and pointer tracing.

## Type checking

| Command | Config | Covers |
| --- | --- | --- |
| `npm run typecheck:src` | `tsconfig.json` | `ts/` sources |
| `npm run typecheck:tests` | `tsconfig.test.json` | tests + `vite`/`vitest` configs |

`npm run typecheck` runs both; `npm run check` runs those plus the tests.

Beyond `strict`, the config turns on `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
`noPropertyAccessFromIndexSignature` and `verbatimModuleSyntax`.

## Docker

```bash
docker compose up --build                    # http://localhost:8080  (prod)
docker compose --profile dev up --build dev  # http://localhost:5173  (hot reload)
```

Stages: `base` (node + deps) → `dev` (Vite dev server, source bind-mounted) →
`build` (`tsc` → `dist/`) → `prod` (nginx serving static files, no node).

The image deliberately does **not** run the test suite — that belongs in
`npm test` and in CI, where the docker job waits on the test job. Keeping tests
out means `docker compose up --build` is a few seconds rather than a minute.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | What it does |
| --- | --- |
| `Typecheck & unit tests · Node 20/22/24` | both typechecks, the suite, and the `dist/` build |
| `Coverage` | the suite with thresholds, uploads the report |
| `E2E (real browser)` | Playwright against the built output, desktop + mobile |
| `Docker image` | builds the image and smoke-tests the container |

## Notes on behaviour

Two things worth knowing, both covered by tests:

- **Division by zero** sets an `error` on the calculator rather than producing
  `Infinity`. The operands are left alone so `DEL` can fix the entry, and the
  DOM layer is what surfaces the message.
- **Pressing a second operator** replaces the first: after `5 +`, pressing `*`
  leaves `5*`.
- **Results are rounded** to 12 significant digits, so `0.1 + 0.2` shows `0.3`
  rather than `0.30000000000000004`. That is well inside a double's precision,
  so no honest result is changed — `1 ÷ 3` still gives `0.333333333333`.
