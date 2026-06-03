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

All five docs-structure checks enforce a single principle: **progressive
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
entry-point into `docs/`. A markdown link (`See [the guide](docs/guide.md)`) or
a bare relative path (`docs/guide.md`) both count. Point at the documents an
agent will reach for most.

## docs-structure/no-monolithic-instruction-file

**What fired:** a markdown instruction file — under `docs/` or at the repo root,
excluding the entry-point — runs past `MONOLITHIC_DOC_MAX_LINES` non-blank
lines. One document has quietly become the thing progressive disclosure exists
to prevent.

**The fix:** split it into smaller, topic-scoped documents an agent can fetch
one at a time, and cross-link them. A 600-line `docs/GUIDE.md` becomes
`docs/guide/setup.md`, `docs/guide/testing.md`, and so on — or a few flat files,
whatever keeps each one under the threshold.

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
