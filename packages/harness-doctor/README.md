# Harness Doctor

Deterministic checks that keep your agent harness healthy.

**[Website](https://abpai.github.io/harness-doctor/)** ·
[npm](https://www.npmjs.com/package/@andypai/harness-doctor) ·
[Docs](../../docs/README.md)

A coding agent is only as good as the repository it works in. If conventions
live in one developer's head, if there's no entry-point file, if the one that
exists is a 600-line wall of text — every agent starts from zero and guesses.
Harness Doctor scans for the structure that prevents that, reports what's
missing, and scores the repo 0–100 so you can watch it improve.

It's framework-agnostic and runs entirely offline. The same repository always
produces the same diagnostics and the same score: no model calls, no network,
nothing to flake.

## What it checks

- **Structural checks** read your repository off disk — its files, layout, and
  docs. Does an agent entry-point exist? Is it a short map or a sprawling
  manual? Is there a `docs/` directory, and does the entry-point actually point
  into it? Is your pnpm setup hardened against supply-chain attacks? These
  checks are how Harness Doctor reasons about the harness itself, not the code
  inside it.
- **Dead-code analysis** finds unused files, unused exports, unused
  dependencies, and circular imports — the cruft that misleads an agent reading
  your codebase.

Every finding comes with a one-line explanation of what's wrong and a concrete
fix — written to be read by a human or handed straight to a coding agent.

## Quick start

Requires Bun 1.3.14 or newer.

From the root of any project:

```bash
bunx --bun @andypai/harness-doctor@latest
```

You'll get an audit and a score. Add `--verbose` to see every finding with file
and line numbers.

To inspect the deterministic command surface without running any checks:

```bash
bunx --bun @andypai/harness-doctor@latest signals
```

This prints the signals menu as JSON: package scripts from the root and
workspace packages, `.github/workflows/*.yml|*.yaml` `run:` commands grouped by
workflow/job, Makefile targets, and just recipes. Discovery only reads files; it
does not execute validation commands.

## Install for agents

Wire Harness Doctor into your agent's workflow so it reads the findings, fixes
them, and keeps the score from sliding on the next change:

```bash
bunx --bun @andypai/harness-doctor@latest install
```

Works with Claude Code, Cursor, Codex, OpenCode, and others.

## Run in CI

Scan every pull request and leave findings inline:

```yaml
name: Harness Doctor

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  harness-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: abpai/harness-doctor@v1
```

For hardened CI, pin `@v1` to a full commit SHA and let Dependabot or Renovate
bump it.

## Configure

Drop a `harness.config.ts` at your project root. Harness Doctor loads the first
matching config in this order: `harness.config.ts`, `.mts`, `.cts`, `.js`,
`.mjs`, `.cjs`, `.json`, `.jsonc`; or a `harnessDoctor` object in
`package.json`.

```ts
// harness.config.ts
import type { HarnessDoctorConfig } from "@andypai/harness-doctor/api";

export default {
  deadCode: false,
  docsContract: true,
  baselineCheck: true,
  rules: {
    "harness-doctor/docs-structure/spec-contract-exists": "error",
    "knip/unused-file": "off",
  },
} satisfies HarnessDoctorConfig;
```

Set `docsContract: true` when a repo has opted into the Harness docs structure
and should keep a durable `docs/todos/INDEX.md` queue even before open todo
specs exist. Set `deadCode: false` to skip the heuristic dead-code family on
first run; dead-code diagnostics are useful, but dynamically loaded fixtures can
be false positives. Set `baselineCheck: true` after adopting the behavior
baseline workflow so local runs and CI require the inventory and ledger. The
external [`harness` skills plugin](https://github.com/abpai/skills) creates
these artifacts through `/harness baseline`. The
`--baseline-check` flag remains available for one-off enforcement.

Dead-code analysis runs the bundled Knip CLI as an isolated subprocess. Knip
automatically reads repository-owned `knip.json`, `knip.jsonc`, `.knip.json`,
`.knip.jsonc`, `knip.js`, `knip.ts`, `knip.config.js`, `knip.config.ts`, or
`package.json#knip`; use that
configuration for dynamic entry points, generated code, framework plugins, and
workspace layout. Knip configuration hints are forwarded to stderr. Harness
Doctor reports Knip findings as `knip/<rule>` keys for severity and
suppression configuration. This is a breaking rename from the former
`deslop/<rule>` namespace.

Config shape:

```ts
interface HarnessDoctorConfig {
  $schema?: string;
  deadCode?: boolean;
  docsContract?: boolean;
  baselineCheck?: boolean;
  verbose?: boolean;
  warnings?: boolean;
  diff?: boolean | string;
  failOn?: "error" | "warning" | "none";
  share?: boolean;
  noScore?: boolean;
  rootDir?: string;
  respectInlineDisables?: boolean;
  ignore?: {
    rules?: string[];
    files?: string[];
    tags?: string[];
    overrides?: Array<{ files: string[]; rules?: string[] }>;
  };
  surfaces?: Partial<
    Record<
      "cli" | "prComment" | "score" | "ciFailure",
      {
        includeTags?: string[];
        excludeTags?: string[];
        includeCategories?: string[];
        excludeCategories?: string[];
        includeRules?: string[];
        excludeRules?: string[];
      }
    >
  >;
  rules?: Record<string, "off" | "warn" | "error">;
  categories?: Record<
    "Security" | "Bugs" | "Performance" | "Accessibility" | "Maintainability",
    "off" | "warn" | "error"
  >;
}
```

Rule keys in `rules`, `ignore.rules`, `surfaces.*.includeRules`, and
`surfaces.*.excludeRules` must be plugin-prefixed. Use
`harness-doctor/docs-structure/<rule>` for docs-structure checks,
`harness-doctor/require-pnpm-hardening` for pnpm hardening, and
`knip/<rule>` for dead-code checks. For example,
`"docs-structure/spec-contract-exists": "off"` is not a valid override key;
use `"harness-doctor/docs-structure/spec-contract-exists": "off"`.

## JSON contract

`--json` emits a versioned report with `schemaVersion: 1`. Each finding is a
diagnostic with `filePath`, `plugin`, `rule`, `severity`, `message`, `help`,
`line`, `column`, and `category`. Consumers should key behavior off
`plugin/rule` and `schemaVersion`, not prose. Reports also include top-level
`signals`, the same deterministic command menu printed by `harness-doctor
signals`.

The docs-structure rule
`harness-doctor/docs-structure/proof-menu-command-exists` verifies the
`docs/SPEC_CONTRACT.md` proof-menu table statically. Its `Validation command`
cells must contain only backtick-wrapped commands, and each command must resolve
to an existing package script, Makefile target, or just recipe discovered in the
signals menu.

## Docs

The guides in [`docs/`](../../docs/) are the system of record:

- [**docs/README.md**](../../docs/README.md) — start here.
- [**How to write a check**](../../docs/HOW_TO_WRITE_A_CHECK.md) — author a structural
  check.
- [**Check fix recipes**](../../docs/CHECK_FIX_RECIPES.md) — how an agent remediates
  each structural finding.
- [**Documentation index**](../../docs/INDEX.md) — full docs map.

## Contributing

Bugs and ideas are welcome — open an
[issue](https://github.com/abpai/harness-doctor/issues).

MIT-licensed.

## Acknowledgments

Inspired by react-doctor by Aiden Bai — I loved it and wanted a similar system
for repo prep in harness engineering. Harness Doctor is an independent project
and is not affiliated with or endorsed by react-doctor or its authors.
