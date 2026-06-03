# Harness Doctor docs

This directory is the system of record. [`AGENTS.md`](../AGENTS.md) at the repo
root is the map — a short orientation that points in here for the detail. If
you're extending Harness Doctor, this is where the depth lives.

Harness Doctor checks a repository in two ways, and which guide you want depends
on what you're adding:

- **Adding an AST rule?** You want to flag a pattern _inside_ source code —
  something a parser can see. Read [**How to write a
  rule**](./HOW_TO_WRITE_A_RULE.md).
- **Adding a structural check?** You want to check something _about_ the
  repository — a file's existence, length, or layout. Read [**How to write a
  check**](./HOW_TO_WRITE_A_CHECK.md).

Not sure which? The dividing line is simple: if answering the question requires
parsing JavaScript or TypeScript, it's a rule. If you could answer it with `ls`
and `wc -l`, it's a check.

## The guides

| Guide                                             | What it covers                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [How to write a rule](./HOW_TO_WRITE_A_RULE.md)   | Authoring an AST rule, from the one-sentence definition through an adversarial test suite. Worked example: `no-eval`.    |
| [How to write a check](./HOW_TO_WRITE_A_CHECK.md) | Authoring a structural check that reads files off disk and emits diagnostics. Worked example: the docs-structure checks. |
| [Check fix recipes](./CHECK_FIX_RECIPES.md)       | The longer-form remediation an agent follows when a structural check fires — one recipe per finding.                     |

## A few things worth knowing first

**Every finding is a `message` plus a `help`.** The `message` says what's wrong
and why it matters; the `help` says how to fix it. Together they're the entire
contract a coding agent acts on, so both guides treat them as the most important
thing you write — not an afterthought.

**Thresholds are never inlined.** Any magic number — a line limit, a penalty
weight — lives in [`packages/core/src/constants.ts`](../packages/core/src/constants.ts)
as a `SCREAMING_SNAKE_CASE` constant with a unit suffix, and is imported where
it's used.

**The score is local and deterministic.** Findings subtract from a perfect 100:
two points per error, one per warning, clamped to zero. No network, no model —
run it twice on the same tree and you get the same number. That property is the
whole point, so nothing in either guide is allowed to break it.
