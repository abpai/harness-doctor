# Glossary

This is the canonical vocabulary file for Harness Doctor.

| Term             | Definition                                                                                                                                                   | Aliases to avoid                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Agent harness    | The repository structure, docs, commands, checks, and validation paths that help coding agents work safely and quickly.                                      | agent docs only, prompt pack           |
| Diagnostic       | One scanner finding with file path, rule id, severity, message, help, and optional location.                                                                 | issue when referring to scanner output |
| Structural check | A deterministic filesystem check about repo shape, docs, manifests, or config.                                                                               | rule when no AST is involved           |
| AST rule         | A source-code rule that inspects parsed JavaScript or TypeScript through oxlint.                                                                             | check when syntax parsing is required  |
| Docs contract    | The stable documentation shape Harness Doctor can verify: short entry point, indexed docs, architecture map, glossary, todos, and domain docs where present. | doc vibes, guidance blob               |
| Surface          | A diagnostic output channel such as CLI, PR comment, score, or CI failure.                                                                                   | sink, destination                      |

## Relationships

- Structural checks and AST rules both emit diagnostics.
- The docs contract is one part of the broader agent harness.
- Surfaces decide where diagnostics appear after filtering.
