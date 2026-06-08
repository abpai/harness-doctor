# Check fix recipes

When a structural check fires, the diagnostic already tells you the essentials:
a one-line `message` (what's wrong and why) and a `help` (the fix). This file is
the longer version — the recipe a coding agent follows when it sees the finding
and needs more than a sentence. The recipes are generic: they apply to any
repository Harness Doctor scans, not just this one.

One thing holds across all of them: **the fix is almost always editing or
splitting markdown, never touching source code.** These checks are about how a
repository explains itself, so the repair happens in its docs.

## The idea behind docs-structure

The docs-structure checks enforce a single principle: **progressive
disclosure**. An agent should be routed to the one document it needs, not handed
a monolith to re-read from the top every time.

That implies a shape. There's an **entry-point** — `AGENTS.md`, or failing that
`CLAUDE.md` or `.cursorrules` — and it's a short _map_: what the project is, its
conventions, its layout, and pointers onward. The depth lives in **`docs/`**,
the _system of record_, where each topic gets its own file an agent can fetch in
isolation. The checks below each guard one part of that shape.

## docs-structure/entry-point-exists

**What fired:** there's no agent entry-point file at the repo root, so every
agent that arrives starts by guessing the project's conventions.

**The fix:** create an `AGENTS.md` at the root. Keep it a map, not a manual — a
paragraph on what the project is, a _conventions_ section, a _layout_ section,
and links into `docs/` for anything that needs real depth. Resist pasting full
guides into it; that just trades this finding for `entry-point-is-a-map`.

## docs-structure/entry-point-is-a-map

**What fired:** the entry-point is longer than `ENTRY_POINT_MAX_LINES` non-blank
lines. It has crossed the line from map to manual.

**The fix:** move the detail out into focused files under `docs/`, and leave a
one-line pointer behind. A long "how to write a rule" section becomes
`docs/HOW_TO_WRITE_A_RULE.md`, and the entry-point keeps just
`See docs/HOW_TO_WRITE_A_RULE.md`. Re-run the scan; the line count should fall
back under the threshold. (This fix and the next two tend to travel together —
shortening the entry-point usually means you're filling out `docs/`.)

## docs-structure/docs-directory-exists

**What fired:** there's no `docs/` directory, or it exists but holds no markdown
file. There's nowhere for the detail to live.

**The fix:** create `docs/` at the root with at least one `.md` file carrying
the conventions the entry-point should delegate to. If that detail is currently
crammed inside the entry-point, this is its new home — do this fix and
`entry-point-is-a-map` in one pass.

## docs-structure/entry-point-links-into-docs

**What fired:** the entry-point never references `docs/`. The map and the system
of record both exist, but nothing connects them, so an agent reading the
entry-point never learns the depth is there.

**The fix:** add at least `ENTRY_POINT_MIN_DOCS_LINKS` reference from the
entry-point into `docs/`. A markdown link to a real docs file or a bare relative
path such as `docs/INDEX.md` both count. Point at the documents an agent will
reach for most.

## docs-structure/no-monolithic-instruction-file

**What fired:** a markdown instruction file — under `docs/` or at the repo root,
excluding the entry-point — runs past `MONOLITHIC_DOC_MAX_LINES` non-blank
lines. One document has quietly become the thing progressive disclosure exists
to prevent.

**The fix:** split it into smaller, topic-scoped documents an agent can fetch
one at a time, and cross-link them. A 600-line `docs/GUIDE.md` becomes
`docs/guide/setup.md`, `docs/guide/testing.md`, and so on — or a few flat files,
whatever keeps each one under the threshold.

## docs-structure/docs-index-exists

**What fired:** `docs/` exists but has no `INDEX.md`, so there is no stable table
of contents.

**The fix:** add `docs/INDEX.md` and link to the major docs areas that actually
exist: architecture, glossary, engineering, design, todos, and domains. Keep it
as a route map, not a second manual.

## docs-structure/architecture-map-exists

**What fired:** `docs/ARCHITECTURE.md` is missing. Agents need one current map
of the system before touching shared behavior.

**The fix:** add a compact architecture map that names package boundaries,
major domains, and where deeper docs live. Keep historical decisions elsewhere
unless they describe current structure.

## docs-structure/canonical-glossary-exists

**What fired:** no canonical glossary was found.

**The fix:** add `docs/GLOSSARY.md`, or keep one existing convention such as
`UBIQUITOUS_LANGUAGE.md` or `docs/reference/glossary.md`. Link it from
`docs/INDEX.md`. Add only terms that prevent confusion or shorten repeated
project-specific language.

## docs-structure/single-canonical-glossary

**What fired:** more than one canonical glossary candidate exists.

**The fix:** choose one vocabulary file as the source of truth. Turn the others
into links to it or remove them after moving any unique terms across.

## docs-structure/todos-index-exists

**What fired:** the repo opted into the Harness docs contract, or already has
`docs/todos/`, but the todo-spec index is missing.

**The fix:** add `docs/todos/INDEX.md` with a table of open durable follow-up
specs. If the repo intentionally does not keep durable todo specs, remove the
empty `docs/todos/` directory or leave `docsContract` unset/false.

## docs-structure/domain-docs-complete

**What fired:** a `docs/domains/<domain>/` folder is missing one of the required
files: `INDEX.md`, `code-map.md`, `invariants.md`, or `test-map.md`.

**The fix:** add the missing files. Keep them boring and consistent: ownership
in `INDEX.md`, task-to-code routes in `code-map.md`, current constraints in
`invariants.md`, and validation paths in `test-map.md`.

## docs-structure/no-banned-long-lived-path

**What fired:** a path reserved for temporary or external harness material is
committed as a long-lived repo default.

**The fix:** remove the path, move durable knowledge into the smallest relevant
doc, or keep generated scanner output and agent utility tooling outside the
product repo. The default banned list includes `.agent/`, `scripts/agent/`,
`.cursor/rules/`, `docs/adr/`, `docs/product-specs/`, `docs/exec-plans/`,
`docs/references/vendor-docs/`, and `feature-registry.json`.

## docs-structure/markdown-link-target-exists

**What fired:** a markdown link points to a local file or directory that does
not exist.

**The fix:** update the link to the current repo path, create the missing target
if it is a real route, or remove the stale reference.

## docs-structure/todo-spec-has-required-sections

**What fired:** a durable todo spec under `docs/todos/` lacks the sections that
make it pick-up-ready for the next agent.

**The fix:** add status, scope, start points, invariants, validation, and close
condition sections. If the note cannot name those, it probably belongs in an
issue, PR note, or branch-local scratch file instead of `docs/todos/`.

## Tuning, or turning a check off

The thresholds — `ENTRY_POINT_MAX_LINES`, `ENTRY_POINT_MIN_DOCS_LINKS`,
`MONOLITHIC_DOC_MAX_LINES` — all live in
[`packages/core/src/constants.ts`](../packages/core/src/constants.ts). Adjust
them there if your project's conventions genuinely differ.

If you'd rather silence a check than satisfy it, set its severity to `"off"` in
your `doctor.config.*` under `rules`. The key is the fully qualified rule name:

```jsonc
{
  "rules": {
    "harness-doctor/docs-structure/entry-point-is-a-map": "off",
  },
}
```
