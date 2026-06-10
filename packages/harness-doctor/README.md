# Harness Doctor

Deterministic checks that keep your agent harness healthy.

A coding agent is only as good as the repository it works in. If conventions
live in one developer's head, if there's no entry-point file, if the one that
exists is a 600-line wall of text — every agent starts from zero and guesses.
Harness Doctor scans for the structure that prevents that, reports what's
missing, and scores the repo 0–100 so you can watch it improve.

It's framework-agnostic and runs entirely offline. The same repository always
produces the same diagnostics and the same score: no model calls, no network,
nothing to flake.

## What it checks

Two kinds of thing, because problems live in two places:

- **AST rules** read your source code. Each rule catches one clearly named
  pattern — the bundled template, `security/no-eval`, flags `eval()` and its
  string-executing cousins. Rules run through an [oxlint](https://oxc.rs)
  plugin, so they're fast.
- **Structural checks** read your repository off disk — its files, layout, and
  docs. Does an agent entry-point exist? Is it a short map or a sprawling
  manual? Is there a `docs/` directory, and does the entry-point actually point
  into it? These checks are how Harness Doctor reasons about the harness itself,
  not just the code inside it.

Every finding comes with a one-line explanation of what's wrong and a concrete
fix — written to be read by a human or handed straight to a coding agent.

## Quick start

From the root of any project:

```bash
npx @andypai/harness-doctor@latest
```

You'll get an audit and a score. Add `--verbose` to see every finding with file
and line numbers.

## Install for agents

Wire Harness Doctor into your agent's workflow so it reads the findings, fixes
them, and keeps the score from sliding on the next change:

```bash
npx @andypai/harness-doctor@latest install
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

Drop a `doctor.config.ts` (or `.js`, `.mjs`, `.cjs`, `.json`, `.jsonc`) at your
project root. Turn rules up, down, or off:

```ts
// doctor.config.ts
import type { HarnessDoctorConfig } from "harness-doctor/api";

export default {
  lint: true,
  docsContract: true,
  rules: {
    "harness-doctor/no-eval": "error",
  },
} satisfies HarnessDoctorConfig;
```

Set `docsContract: true` when a repo has opted into the Harness docs structure
and should keep a durable `docs/todos/INDEX.md` queue even before open todo
specs exist.

## JSON contract

`--json` emits a versioned report with `schemaVersion: 1`. Each finding is a
diagnostic with `filePath`, `plugin`, `rule`, `severity`, `message`, `help`,
`line`, `column`, and `category`. Consumers should key behavior off
`plugin/rule` and `schemaVersion`, not prose.

## Docs

The guides in [`docs/`](../../docs/) are the system of record:

- [**docs/README.md**](../../docs/README.md) — start here.
- [**How to write a rule**](../../docs/HOW_TO_WRITE_A_RULE.md) — author an AST rule.
- [**How to write a check**](../../docs/HOW_TO_WRITE_A_CHECK.md) — author a structural
  check.
- [**Check fix recipes**](../../docs/CHECK_FIX_RECIPES.md) — how an agent remediates
  each structural finding.
- [**Documentation index**](../../docs/INDEX.md) — full docs map.

## Contributing

Bugs and ideas are welcome — open an
[issue](https://github.com/abpai/harness-doctor/issues).

MIT-licensed.
