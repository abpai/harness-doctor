# Harness Doctor

A framework-agnostic **agent-harness doctor**: it scans a repository for good
agent-harness practices using deterministic checks, scores the result 0–100,
and feeds the findings to coding agents so they fix them. No network, no model
calls — the same repo always produces the same diagnostics and the same score.

This file is a **map, not a manual**. It points into `docs/` (the system of
record) for detail. Keep it short and let `docs/` carry the depth.

## What it checks

- **AST rules** (oxlint plugin) — one violation, one clearly named rule, one
  co-located test. The template rule is `security/no-eval`.
- **Structural checks** (core) — non-AST checks that read files off disk and
  emit `Diagnostic[]`. The template is `checks/pnpm-hardening.ts`. The first
  real group is the docs-structure checks (does the harness have an entry-point
  file, is it a map not a manual, does `docs/` exist, etc.).

See `docs/` for how to add either:

- `docs/HOW_TO_WRITE_A_RULE.md` — authoring an AST rule.
- `docs/HOW_TO_WRITE_A_CHECK.md` — authoring a structural check.

## Conventions

- **Files:** kebab-case.
- **Functions:** arrow functions over declarations; one small utility per file
  in `utils/`.
- **Types:** TypeScript `interface` over `type` for object shapes.
- **Constants:** magic numbers live in `constants.ts` as `SCREAMING_SNAKE_CASE`
  with unit suffixes (`_MS`, `_PX`, `_POINTS`, `_MINUTES`).
- **Comments:** none unless the code is a hack — prefix those with `// HACK:`.
- **Booleans:** `Boolean(x)` over `!!x`; descriptive boolean names
  (`didPositionChange`, not `moved`).
- **No casual type casts** (`as`) unless unavoidable. Remove dead code; don't
  repeat yourself.

## Package layout

```
packages/
  core/                          PRIVATE  the diagnostic engine (Effect v4)
    src/
      types/                     shared cross-package TS types (no runtime code)
      project-info/              project discovery (framework detection, monorepo walk)
      checks/                    structural (non-AST) checks → Diagnostic[]
      run-inspect.ts             streaming orchestrator (the heart)
      calculate-local-score.ts   deterministic offline score (the default)
      services/                  Context.Service classes (Files, Git, Project,
                                 Config, Linter, DeadCode, Score, Reporter, …)
  api/                           PRIVATE    programmatic diagnose()
  harness-doctor/                PUBLISHED  CLI + public inspect() + bin
  oxlint-plugin-harness-doctor/  PUBLISHED  the AST rules (template: no-eval)
  eslint-plugin-harness-doctor/  PUBLISHED  ESLint mirror of the oxlint plugin
```

## Scoring

The default score is **local and deterministic** (`calculateLocalScore`):
errors cost `LOCAL_SCORE_ERROR_PENALTY_POINTS`, warnings cost
`LOCAL_SCORE_WARNING_PENALTY_POINTS`, clamped to `[0, PERFECT_SCORE]`. There is
no dependency on a hosted score API — `Score.layerLocal` is the default layer.
`Score.layerHttp` (POSTing to `SCORE_API_URL`) remains as an opt-in for
integrators who host their own scoring service.

## Effect v4

Built on `effect@4.0.0-beta.70`. Conventions:

- Per-module imports: `import * as Effect from "effect/Effect"` — never the
  umbrella `import { Effect } from "effect"`.
- Every fallible service fails with `HarnessDoctorError` (a tagged-error union);
  renderers dispatch on `error.reason._tag`, never on `error.message`.
- Services are `Context.Service<Self, Interface>()("harness-doctor/Name", …)`.
  Layers: `layerNode` (production), `layerOf(value)` (test), `layerNoop`
  (void-return), implementation-specific names (`layerOxlint`, `layerLocal`,
  `layerHttp`).
- Never `try/catch` inside `Effect.gen`; wrap sync throws in `Effect.try` and
  recover with `Effect.catch`.

## Testing

Tests live in each package's `tests/` directory and run on `vite-plus/test`.
Run checks before committing:

```bash
pnpm test         # all packages
pnpm lint
pnpm typecheck
pnpm format       # format:check to verify only
```
