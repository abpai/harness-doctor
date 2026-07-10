# Tooling

Harness Doctor uses Vite Plus for repository-level formatting, linting,
type-checking, packing, and test orchestration.

## Configuration

The shared Vite Plus configuration lives in [`vite.config.mjs`](../vite.config.mjs).
Keep this file as plain JavaScript rather than TypeScript: `vp lint` forwards the
config to oxlint, and the current oxlint config loader handles JavaScript
configs more reliably across the Node versions supported by this repository.

The root scripts are the canonical local and CI entry points:

```bash
bun run test
bun run lint
bun run typecheck
bun run format:check
```

Run the relevant command after each key code change, and run the full set before
committing CI or release work.
