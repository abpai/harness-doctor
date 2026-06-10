# Harness Doctor docs

This directory is the system of record. [`AGENTS.md`](../AGENTS.md) at the repo
root is the map — a short orientation that points in here for the detail. If
you're extending Harness Doctor, this is where the depth lives.

Harness Doctor checks a repository with deterministic **structural checks** —
checks _about_ the repository: a file's existence, length, or layout. If you
could answer the question with `ls` and `wc -l`, it's a check. To add one, read
[**How to write a check**](./HOW_TO_WRITE_A_CHECK.md).

## The guides

| Guide                                             | What it covers                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Documentation index](./INDEX.md)                 | Top-level map for the repo docs.                                                                                         |
| [Architecture](./ARCHITECTURE.md)                 | Current package map and scan flow.                                                                                       |
| [Glossary](./GLOSSARY.md)                         | Canonical Harness Doctor terms.                                                                                          |
| [Tooling](./TOOLING.md)                           | Local and CI command entry points, plus Vite Plus configuration notes.                                                   |
| [How to write a check](./HOW_TO_WRITE_A_CHECK.md) | Authoring a structural check that reads files off disk and emits diagnostics. Worked example: the docs-structure checks. |
| [Check fix recipes](./CHECK_FIX_RECIPES.md)       | The longer-form remediation an agent follows when a structural check fires — one recipe per finding.                     |
| [Todo specs](./todos/INDEX.md)                    | Durable follow-up queue.                                                                                                 |

## A few things worth knowing first

**Every finding is a `message` plus a `help`.** The `message` says what's wrong
and why it matters; the `help` says how to fix it. Together they're the entire
contract a coding agent acts on, so the guide treats them as the most important
thing you write — not an afterthought.

**Thresholds are never inlined.** Any magic number — a line limit, a penalty
weight — lives in [`packages/core/src/constants.ts`](../packages/core/src/constants.ts)
as a `SCREAMING_SNAKE_CASE` constant with a unit suffix, and is imported where
it's used.

**The score is local and deterministic.** Findings subtract from a perfect 100:
two points per error, one per warning, clamped to zero. No network, no model —
run it twice on the same tree and you get the same number. That property is the
whole point, so nothing in the guide is allowed to break it.

**JSON output is versioned.** `--json` currently emits `schemaVersion: 1`.
Diagnostics carry `filePath`, `plugin`, `rule`, `severity`, `message`, `help`,
`line`, `column`, and `category`; consumers should key automations off
`plugin/rule` and the schema version.
