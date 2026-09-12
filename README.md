# calculator-fun

A small calculator in TypeScript, with tests, type checking, Docker and CI.

![Example 1](examples/example-1.png)
![Example 2](examples/example-2.gif)

## Layout

```
ts/
  calculator.ts       state machine, no DOM
  index.ts            binds it to the buttons
  calculator.test.ts  logic tests
  index.test.ts       DOM-wiring tests (jsdom)
docker/             Dockerfile + nginx config
index.html          the page
favicon.svg         icon
```

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

## Tests

[Vitest](https://vitest.dev). Logic tests run in Node; the tests that exercise
the button wiring opt into jsdom per file.

```bash
npm test             # 60 tests
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
