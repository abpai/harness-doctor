# How to write a check

A structural check asks a question about the repository instead of about the
code inside it. Does an agent entry-point file exist? Is it short enough to be a
map rather than a manual? Does a `docs/` directory exist, and does the
entry-point link into it? None of those can be answered by parsing a source
file — they're answered by looking at the files themselves: their names, their
locations, their lengths.

A check reads the filesystem directly — package manifests, lockfiles, the
`docs/` tree, the entry-point file — and returns a list of diagnostics. The
docs-structure checks are structural checks. So is the supply-chain check that
inspects pnpm hardening.

The template is
[`packages/core/src/checks/pnpm-hardening.ts`](../packages/core/src/checks/pnpm-hardening.ts).
Read it first; this guide walks through its shape.

## Is it a check?

The line is sharp, so use it. If you could answer your question from a shell
prompt with `ls`, `wc -l`, or by reading a config file as plain data, it's a
check. "Is there an `AGENTS.md`?" and "is it under 150 lines?" are checks.
Questions that require parsing JavaScript or TypeScript syntax are out of scope
— Harness Doctor doesn't ship an AST engine.

## The contract

A check is a single exported arrow function. That's the entire interface:

```ts
export const checkSomething = (rootDirectory: string): Diagnostic[] => { ... };
```

- **In:** the absolute path to the scan root.
- **Out:** an array of `Diagnostic`. Return `[]` when there's nothing to report.
- **Returns `[]` when the check doesn't apply, too.** A pnpm-hardening check has
  nothing to say about a non-pnpm project, so it returns `[]` rather than
  inventing a finding. "Not applicable" and "clean" look the same to the engine,
  and that's correct.
- **Never throws.** A malformed lockfile is a fact about the repo, not a reason
  to crash the scan. Catch your IO and parse errors and degrade to `[]`.
- **No surprises.** The only side effect a check may have is reading files. No
  writes, no network.

That last constraint isn't bureaucracy. The whole tool's promise is that the
same repository always yields the same score; a check that reached the network
or depended on wall-clock time would quietly break it.

## Build diagnostics through a small factory

Every diagnostic from a check shares the same `plugin`, `rule`, and `category`,
so don't repeat those at each call site. Mirror `buildHardeningDiagnostic` in
the template — one local factory, one source of truth:

```ts
const buildDiagnostic = (input: BuildDiagnosticInput): Diagnostic => ({
  filePath: ENTRY_POINT_FILE, // path relative to the scan root
  plugin: "harness-doctor",
  rule: "entry-point-exists", // the rule key, kebab-case
  severity: "warning", // "warning" | "error"
  message: input.message, // what is wrong, and why
  help: input.help, // how to fix it
  line: input.line ?? 0, // 0 for a file-level finding
  column: input.column ?? 0,
  category: "Maintainability", // must be a known category — see below
});
```

### Category is a closed set

`category` must be one of the buckets in
[`packages/core/src/constants.ts`](../packages/core/src/constants.ts):

```
Security · Bugs · Performance · Accessibility · Maintainability
```

This set is deliberately small and enforced by a test — you can't quietly
introduce a sixth bucket; you'd break the assertion that the set is exhaustive.
The docs-structure checks are `"Maintainability"`; pnpm-hardening is
`"Security"`.

### message and help are the product

The `message` and `help` are not metadata around the real work — they _are_ the
work. They're what a person reads in the report and what a coding agent acts on,
and nothing downstream can compensate for a vague pair. Write them deliberately:

- **`message`** — what is wrong and _why it matters_, in one sentence. State the
  consequence, not just the fact: "an agent harness with no top-level
  instructions file forces every agent to rediscover the project's conventions
  from scratch" beats "no `AGENTS.md` found."
- **`help`** — the concrete fix: "Add an `AGENTS.md` at the repo root that maps
  the project and links into `docs/`."

### Point at the exact spot when you can

Use `line: 0` for a finding about a whole file — it's missing, or it's too long.
But when you can name the offending location — the template reports the exact
line and column of a weak `trustPolicy` value in `pnpm-workspace.yaml` — include
it, and the CLI will render a code frame around it.

## Thresholds live in constants.ts

Any number a check compares against is a tuning knob, and tuning knobs belong in
one place. Put them in
[`constants.ts`](../packages/core/src/constants.ts) as `SCREAMING_SNAKE_CASE`
with a unit suffix, and import them — never inline the literal. The
docs-structure thresholds, for instance:

```ts
export const ENTRY_POINT_MAX_LINES = 150;
export const ENTRY_POINT_MIN_DOCS_LINKS = 1;
export const MONOLITHIC_DOC_MAX_LINES = 400;
```

A reviewer who wants to know "how long is too long?" should find the answer by
name in one file, not by grepping for a bare `150` across the codebase.

## Read files safely

Use `node:fs` directly, and gate every read behind the `isFile` helper from
`project-info` so a missing file is a clean negative, not an exception:

```ts
import fs from "node:fs";
import path from "node:path";
import { isFile } from "../project-info/index.js";

if (!isFile(path.join(rootDirectory, ENTRY_POINT_FILE))) {
  return [buildDiagnostic({ message: "...", help: "..." })];
}
```

Wrap any parse in `try/catch` and fall back to `[]` (or just skip that one
finding). A check that throws on a malformed file takes the whole scan down with
it — which is a worse outcome than the finding it would have produced.

## Wire it into the pipeline

Three small steps:

1. **Author** `packages/core/src/checks/<name>.ts` in the shape above.
2. **Re-export** it from
   [`packages/core/src/index.ts`](../packages/core/src/index.ts) with an
   `export * from "./checks/<name>.js";` line, so consumers can import it.
3. **Register** it in `run-inspect.ts`. The extension point is the
   environment-diagnostics block — it spreads each check's output into the
   pipeline and, in diff mode, narrows the findings to the changed files:

```ts
const environmentDiagnostics: ReadonlyArray<Diagnostic> = [
  ...checkPnpmHardening(scanDirectory),
  ...checkDocsStructure(scanDirectory, { ... }),
].filter(
  (diagnostic) =>
    changedFileSet === null || changedFileSet.has(toPosixPath(diagnostic.filePath)),
);
```

Add your check to that array. Leave the `changedFileSet` filter and the
surrounding `applyPerElementPipeline(Stream.fromIterable(...))` wiring alone —
only the array contents change.

4. **Catalog** the rule in
   [`packages/core/src/rule-catalog.ts`](../packages/core/src/rule-catalog.ts)
   so `harness-doctor rules list / explain / disable / ignore-tag` know its
   category, tags, and recommendation.

## Test against a real temp directory

Co-locate a test in `packages/core/tests/<name>.test.ts` (see
`pnpm-hardening.test.ts`). Build a small directory tree per case with
`fs.mkdtempSync` and run the check against it, so it exercises the same
`node:fs` path it'll use in production — not a mock that can drift from reality.

Cover four situations:

- **Applies, clean** → `[]`. An entry-point that exists and is short.
- **Applies, violated** → the expected diagnostic(s), with the right `rule`,
  `severity`, and `category`.
- **Doesn't apply** → `[]`. The precondition isn't met.
- **Malformed input** → `[]`, not a thrown error.

## Checklist

- [ ] One exported arrow function `(rootDirectory: string) => Diagnostic[]`.
- [ ] Returns `[]` when it doesn't apply, and never throws.
- [ ] Diagnostics built through one local factory with a stable `rule` key.
- [ ] `category` is one of the five known buckets.
- [ ] `message` states the problem and its consequence; `help` states the fix.
- [ ] Thresholds live in `constants.ts`, named with units, and imported.
- [ ] Re-exported from `core/src/index.ts` and added to the `run-inspect.ts`
      environment-diagnostics array.
- [ ] Cataloged in `core/src/rule-catalog.ts` with category, tags, and a
      recommendation.
- [ ] Co-located test covers applies-clean, applies-violated, not-applicable,
      and malformed input — all against a real temp directory.
