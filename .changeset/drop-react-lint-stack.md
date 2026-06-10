---
"@andypai/harness-doctor": minor
---

Drop the React lint rule stack — harness-doctor is now a framework-agnostic agent-harness readiness scanner.

Removed:

- The `oxlint-plugin-harness-doctor` and `eslint-plugin-harness-doctor` packages and every React/JSX AST rule they shipped.
- The oxlint runner: scans no longer spawn oxlint, so the `lint` config option, `--lint`/`--no-lint`/`--no-parallel`/`--framework` flags, Node-version gating for oxlint, `.oxlintrc` adoption (`adoptExistingLintConfig`), and `customRulesOnly` are gone.
- React-specific project detection (React/Tailwind/Zod/Expo version parsing); `ProjectInfo` now reports `rootDirectory`, `projectName`, `framework`, `hasTypeScript`, and `sourceFileCount`.

What remains (and works as before): the `docs-structure/*` docs-contract checks, pnpm supply-chain hardening, dead-code analysis (deslop), deterministic 0–100 readiness scoring, diff/staged modes (docs and manifest checks now run there too, narrowed to changed files), the `rules` config CLI (`list`/`explain`/`set`/`disable`/`category`/`ignore-tag`), `install`, and the GitHub action.
