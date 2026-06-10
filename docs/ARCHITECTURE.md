# Architecture

Harness Doctor is a deterministic scanner. It reads a repo, emits diagnostics,
and turns those diagnostics into local reports, JSON output, CI annotations, and
scores. It does not call a model and does not reach the network during a scan.

## Packages

| Package                   | Owns                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`           | Project discovery, config loading, structural checks, dead-code orchestration, scoring, JSON report shape, and shared types. |
| `packages/harness-doctor` | CLI commands, terminal rendering, install flows, GitHub Action support, and the published binary.                            |
| `packages/api`            | Programmatic `diagnose()` API for consumers that need Harness Doctor results inside another tool.                            |

## Scan Flow

1. Resolve `harness.config.*` and any `rootDir`.
2. Discover the project and monorepo shape.
3. Run structural checks such as docs structure and pnpm hardening.
4. Run dead-code analysis when enabled and applicable.
5. Filter diagnostics through config, ignores, surfaces, and inline disables.
6. Compute the deterministic local score and build reports.

## Boundaries

- Structural checks live in `packages/core/src/checks`.
- Rule metadata (categories, tags, recommendations) lives in
  `packages/core/src/rule-catalog.ts`.
- Config validation lives in `packages/core/src/validate-config-types.ts`.
- JSON report shape lives in `packages/core/src/schemas.ts` and the matching
  TypeScript types under `packages/core/src/types`.

## Invariants

- A scan must be deterministic for the same repository tree and config.
- Structural checks may read files but must not write files, call the network,
  or depend on wall-clock time.
- Diagnostics must include a concrete `message` and actionable `help`.
- New checks need temp-directory tests that cover clean, violated, and
  non-applicable layouts.
