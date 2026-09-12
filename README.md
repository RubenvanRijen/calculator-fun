# calculator-fun

A small calculator in TypeScript, with keyboard support, memory keys, a
history panel, tests, type checking, Docker and CI.

![Example 1](examples/example-1.png)
![Example 2](examples/example-2.gif)

## Layout

```
ts/
  calculator.ts       state machine, no DOM
  index.ts            binds it to the buttons and the keyboard
  calculator.test.ts  logic tests
  index.test.ts       DOM-wiring tests (jsdom)
  types/              one type alias per file
    operation.ts        Operation
  interfaces/         one interface per file
    history-entry.ts     HistoryEntry
    calculator-handle.ts CalculatorHandle
  enums/              one enum per file (none yet)
docker/             Dockerfile + nginx config
index.html          the page
favicon.svg         icon
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

**Keyboard** — the whole calculator is usable without the mouse:

| Key | Action |
| --- | --- |
| `0`-`9` `.` | digits |
| `+` `-` `*` `/` | operators (`/` maps to the `÷` key) |
| `%` | percent |
| `Enter` or `=` | compute |
| `Backspace` | delete last character |
| `Escape` | clear |

The matching on-screen key flashes, so the mapping is visible. A focused button
keeps handling its own `Enter`, so nothing fires twice.

**Percent** behaves like a physical calculator: inside a pending `+` or `-` it
reads as "percent of the first operand", so `50 + 10 %` is `55`, not `50.1`.
Inside `*` or `÷` there is no sensible base, so it is a plain division by 100.

**Sign toggle** (`±`) flips the current operand, and digits stay appendable
afterwards.

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
npm test             # 117 tests
npm run test:watch
npm run coverage     # with thresholds
```

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
| `Typecheck & test · Node 20/22/24` | both typechecks, the suite, and the `dist/` build |
| `Coverage` | the suite with thresholds, uploads the report |
| `Docker image` | builds the image and smoke-tests the container |

## Notes on behaviour

Two things worth knowing, both covered by tests:

- **Division by zero** sets an `error` on the calculator rather than producing
  `Infinity`. The operands are left alone so `DEL` can fix the entry, and the
  DOM layer is what surfaces the message.
- **Pressing a second operator** is ignored — after `5 +`, pressing `*` leaves
  `+` selected, because there is no current operand to fold. This is the
  original behaviour, kept deliberately.
