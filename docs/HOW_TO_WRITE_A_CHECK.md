# How to Write a Structural Check

A **structural check** is a non-AST diagnostic. Where an oxlint rule walks a
parsed source file's AST, a structural check reads files off disk directly —
package manifests, lockfiles, the `docs/` tree, the agent entry-point file — and
emits `Diagnostic[]`. The docs-structure checks (does an entry-point file exist,
is it a map not a manual, does `docs/` exist) are structural checks, and so is
the supply-chain check.

The canonical template is
[`packages/core/src/checks/pnpm-hardening.ts`](../packages/core/src/checks/pnpm-hardening.ts).
Read it before writing a new one — this guide describes its shape.

## When to write a structural check (not an AST rule)

Write a structural check when the thing you are checking is **not inside a
source file**:

- It is about a file's *existence*, *location*, or *length* (e.g. "an
  `AGENTS.md` must exist at the repo root", "`docs/` must contain a markdown
  file").
- It reads a config / manifest / lockfile format that is not JS/TS
  (`pnpm-workspace.yaml`, `package.json` as data, a markdown file's line count).
- It reasons about the repository as a whole rather than one parsed module.

If the check needs to understand JavaScript or TypeScript *syntax*, write an AST
rule instead — see [HOW_TO_WRITE_A_RULE.md](./HOW_TO_WRITE_A_RULE.md).

## The contract

A check is a single exported arrow function:

```ts
export const checkSomething = (rootDirectory: string): Diagnostic[] => { ... };
```

- **Input:** the absolute path to the scan root.
- **Output:** an array of `Diagnostic`. Return `[]` when there is nothing to
  report — including when the check does not apply to this repo (e.g.
  `pnpm-hardening` returns `[]` for a non-pnpm project). A check must never
  throw; catch IO errors and degrade to `[]`.
- **Pure-ish:** the only side effect is reading files. No network, no writes.

## The `Diagnostic` shape

Build each diagnostic through a small local factory so every diagnostic from
the check shares the same `plugin` / `rule` / `category`. Mirror the
`buildHardeningDiagnostic` helper in the template:

```ts
const buildDiagnostic = (input: BuildDiagnosticInput): Diagnostic => ({
  filePath: ENTRY_POINT_FILE,        // path relative to the scan root
  plugin: "harness-doctor",
  rule: "entry-point-exists",        // the rule key, kebab-case
  severity: "warning",               // "warning" | "error"
  message: input.message,            // what is wrong, in one sentence
  help: input.help,                  // how to fix it
  line: input.line ?? 0,             // 0 when the finding is file-level
  column: input.column ?? 0,
  category: "Maintainability",       // MUST be a DIAGNOSTIC_CATEGORY_BUCKETS member
});
```

### Category must be one of the closed set

`category` must be one of `DIAGNOSTIC_CATEGORY_BUCKETS` in
`packages/core/src/constants.ts`:

```
Security · Bugs · Performance · Accessibility · Maintainability
```

`rule-metadata.test.ts` asserts this set is exhaustive — introducing a new
category there will fail the test. Docs-structure checks map to
`"Maintainability"`; supply-chain (`pnpm-hardening`) maps to `"Security"`.

### message and help

The `message` and `help` are the entire user-facing contract — the agent skill
reads them to decide what to do. Write them as a pair:

- `message` — *what* is wrong and *why it matters*, in one sentence. State the
  consequence ("an agent harness with no top-level instructions file forces
  every agent to rediscover conventions from scratch").
- `help` — the concrete fix ("Add an `AGENTS.md` at the repo root that maps the
  project and links into `docs/`").

### line / column

Use `0` for a file-level finding ("this file is missing", "this file is too
long"). When you can point at the exact offending location — the template
reports the line/column of a weak `trustPolicy:` value — include it so the CLI
can render a code frame.

## Magic numbers go in constants.ts

Any threshold lives in `packages/core/src/constants.ts` as
`SCREAMING_SNAKE_CASE` with a unit suffix, and is imported — never inlined. The
docs-structure thresholds, for example:

```ts
export const ENTRY_POINT_MAX_LINES = 150;
export const ENTRY_POINT_MIN_DOCS_LINKS = 1;
export const MONOLITHIC_DOC_MAX_LINES = 400;
```

## Reading files safely

Use `node:fs` directly (the template does) and the `isFile` helper from
`project-info` to gate before reading. Wrap parses in `try/catch` and return
`[]` (or skip that finding) on failure — a malformed file is not a crash:

```ts
import fs from "node:fs";
import path from "node:path";
import { isFile } from "../project-info/index.js";

if (!isFile(path.join(rootDirectory, ENTRY_POINT_FILE))) {
  return [buildDiagnostic({ message: "...", help: "..." })];
}
```

## Wiring the check into the pipeline

Three steps, all small:

1. **Author** `packages/core/src/checks/<name>.ts` following the shape above.
2. **Re-export** it from `packages/core/src/index.ts` (add an
   `export * from "./checks/<name>.js";` line) so consumers can import it.
3. **Register** it in `run-inspect.ts`'s environment-diagnostics block. This is
   the extension point — the block is skipped in diff mode and otherwise spreads
   each check's output into the per-element pipeline:

```ts
const environmentDiagnostics: ReadonlyArray<Diagnostic> = isDiffMode
  ? []
  : [...checkPnpmHardening(scanDirectory), ...checkDocsStructure(scanDirectory)];
```

Keep the `isDiffMode ? []` skip and the
`applyPerElementPipeline(Stream.fromIterable(...))` wiring verbatim — only the
array contents change.

## Testing

Co-locate a test in `packages/core/tests/<name>.test.ts` (see
`pnpm-hardening.test.ts`). Drive the check against a temporary directory tree
you build per case, and assert on the returned `Diagnostic[]`:

- **Applies + clean** → returns `[]` (e.g. an entry-point file that exists and
  is short).
- **Applies + violated** → returns the expected diagnostic(s) with the right
  `rule`, `severity`, and `category`.
- **Does not apply** → returns `[]` (e.g. the structural precondition is absent).
- **Malformed input** → returns `[]` rather than throwing.

Build the fixtures in a real temp dir (`fs.mkdtempSync`) so the check exercises
the same `node:fs` path it uses in production.

## Checklist

- [ ] One exported arrow function `(rootDirectory: string) => Diagnostic[]`.
- [ ] Returns `[]` when the check does not apply, and never throws.
- [ ] Each diagnostic built through a local factory with a stable `rule` key.
- [ ] `category` is a `DIAGNOSTIC_CATEGORY_BUCKETS` member.
- [ ] `message` states the problem + consequence; `help` states the fix.
- [ ] Thresholds live in `constants.ts` as `SCREAMING_SNAKE_CASE` with units.
- [ ] Re-exported from `core/src/index.ts` and wired into `run-inspect.ts`.
- [ ] Co-located test covers apply/clean, apply/violated, not-applicable, and
      malformed-input cases.
