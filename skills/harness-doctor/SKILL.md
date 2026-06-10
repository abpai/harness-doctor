---
name: harness-doctor
description: Use when finishing a feature, fixing a bug, before committing code, or when the user types `/doctor`, asks to scan, triage, or clean up diagnostics. Harness Doctor runs deterministic checks for good agent-harness practices (AST rules + structural checks) and reports a 0–100 health score. Includes a regression check and a full local-triage workflow.
version: "2.0.0"
---

# Harness Doctor

Scans a repository for good agent-harness practices using deterministic checks
(AST rules + structural checks) and outputs a 0–100 health score. Framework-
agnostic and offline: the same repo always produces the same score.

## After making code changes

Run the scan in diff mode and confirm the score did not regress:

```bash
npx @andypai/harness-doctor@latest --verbose --diff
```

If the score dropped, fix the regressions before committing. The score is
deterministic and local, so a clean diff always reproduces the same number.

## For general cleanup

Run a full-codebase scan and fix issues by severity — errors first, then
warnings:

```bash
npx @andypai/harness-doctor@latest --verbose
```

## /doctor — local triage workflow

When the user types `/doctor`, says "run harness doctor", or asks for a full
triage / cleanup pass (not just a regression check), follow this loop. It edits
the working tree directly — it never commits and never opens PRs.

1. **Scan.** Run `npx @andypai/harness-doctor@latest --verbose` and read the full output:
   the score, the top errors, and the per-rule / per-check groupings.
2. **Filter.** Pick the highest-value findings first: errors before warnings,
   and within a severity, the rules the report ranks highest.
3. **Triage.** For each finding, read the `message` and `help` text on the
   diagnostic — they state the problem and the fix. Open the cited file at the
   reported line before editing.
4. **Fix.** Apply the narrowest change that resolves the finding. For structural
   checks (e.g. a missing `docs/` directory or an over-long entry-point file),
   the fix is usually editing or splitting docs, not source code.
5. **Validate.** Re-run `npx @andypai/harness-doctor@latest --verbose --diff` and confirm
   the score went up (or at least did not regress) and that no new findings
   appeared. Repeat from step 1 until the score is acceptable.

Never let the score regress relative to where you started.

## Configuring or explaining rules

When the user wants to understand a rule, disagrees with one, or wants to
disable / tune which checks run (not fix code), use the `doctor-explain` skill
(alias `/doctor-config`). Start with
`npx @andypai/harness-doctor@latest rules explain <rule>`, then apply the narrowest
control via `npx @andypai/harness-doctor@latest rules disable|set|category|ignore-tag …`,
which edits your `harness.config.*` (or `package.json#harnessDoctor`).

## Command reference

```bash
npx @andypai/harness-doctor@latest --verbose --diff
```

| Flag        | Purpose                                       |
| ----------- | --------------------------------------------- |
| `.`         | Scan current directory                        |
| `--verbose` | Show affected files and line numbers per rule |
| `--diff`    | Only scan changed files vs base branch        |
| `--score`   | Output only the numeric score                 |
