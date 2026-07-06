---
"@andypai/harness-doctor": minor
---

Add deterministic signals-menu discovery and static proof-menu command verification (Phase 4).

- New `signals` command and `discoverSignalsMenu` API surface the repo's runnable command inventory (package scripts, `.github/workflows` `run:` steps, Makefile targets, justfile recipes) as structured JSON. Discovery is read-only — it never executes validation commands.
- New `docs-structure/proof-menu-command-exists` check statically verifies a machine-readable `## Proof menu` table: required columns, `Lane` ∈ fast/full, `Sufficiency` ∈ auto/human-gate, backtick-only command cells, and that each referenced command resolves against the discovered signals menu. The rule only engages when the proof menu is a real table, so free-form menus stay untouched.
