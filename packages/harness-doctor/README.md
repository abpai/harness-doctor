<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/harness-doctor-readme-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./assets/harness-doctor-readme-logo-light.svg">
  <img alt="Harness Doctor" src="./assets/harness-doctor-readme-logo-light.svg" width="134" height="36">
</picture>

[![version](https://img.shields.io/npm/v/harness-doctor?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/harness-doctor)
[![downloads](https://img.shields.io/npm/dt/harness-doctor.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/harness-doctor)

Deterministic checks that keep your agent harness healthy.

Harness Doctor scans a repository for good **agent-harness practices** —
the conventions and structure that let coding agents work reliably — and
reports findings with a 0–100 health score. It is framework-agnostic and
offline: the same repo always produces the same diagnostics and the same
score, with no model calls and no network dependency.

It checks two kinds of thing:

- **AST rules** (via an oxlint plugin) — one clearly named problem per rule.
- **Structural checks** — non-AST checks that read your repo off disk: does it
  have an agent entry-point file, is that file a short map rather than a
  monolithic manual, does a `docs/` system-of-record exist and link back, and
  so on.

[Docs →](https://harness.doctor/docs)

## Quick start

Run this at your project root to get an audit:

```bash
npx harness-doctor@latest
```

## Install for agents

Install the skill so your coding agent can read the findings and fix them,
then keep the score from regressing on every change:

```bash
npx harness-doctor@latest install
```

Works with Claude Code, Cursor, Codex, OpenCode, and many more.

## Run in CI (GitHub Actions)

Add the reusable Action to scan every pull request and leave inline findings:

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
      - uses: millionco/harness-doctor@v1
```

For hardened CI, pin to a full commit SHA instead of `@v1` and let Dependabot
or Renovate keep it current.

## Configure rules

Configure with a `doctor.config.ts` (or `.js`, `.mjs`, `.cjs`, `.json`,
`.jsonc`) in your project root:

```ts
// doctor.config.ts
import type { HarnessDoctorConfig } from "harness-doctor/api";

export default {
  lint: true,
  rules: {
    "harness-doctor/no-eval": "error",
  },
} satisfies HarnessDoctorConfig;
```

## Learn more

- [Docs](https://harness.doctor/docs) — full reference and configuration.
- `docs/HOW_TO_WRITE_A_RULE.md` — author a new AST rule.
- `docs/HOW_TO_WRITE_A_CHECK.md` — author a new structural check.

## Contributing

[Issues welcome!](https://github.com/millionco/harness-doctor/issues)

MIT-licensed
