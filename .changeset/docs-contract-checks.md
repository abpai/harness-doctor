---
"harness-doctor": minor
---

Add deterministic docs-contract checks (the `docs-structure/*` rule family, 19 rules) and a `docsContract` config option. The scanner now verifies the Harness docs contract: entry point exists, is a map, and links into `docs/` (with a `CLAUDE.md` shim importing `AGENTS.md`); `docs/SPEC_CONTRACT.md`, `docs/INDEX.md`, and an architecture map exist with their required sections; todo specs have required sections and `docs/todos/` carries an index; markdown links resolve to real targets; combined `AGENTS.md` size stays within the byte budget; and anti-patterns are flagged (monolithic instruction files, `STRUCTURE.md`, banned long-lived paths, duplicate glossaries, incomplete domain docs). Docs-only directories now scan successfully instead of failing with a missing-`package.json` error.
