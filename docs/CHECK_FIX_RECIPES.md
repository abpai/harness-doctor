# Check Fix Recipes

Per-finding remediation recipes for structural checks. Each diagnostic already
carries a one-line `message` (what is wrong + why) and `help` (the fix); this
file is the longer-form recipe a coding agent follows when `/doctor` surfaces a
finding. Recipes are generic — they apply to any repository the harness scans,
not just this one.

The fix for a docs-structure finding is almost always editing or splitting
markdown, never source code.

## docs-structure

These checks enforce **progressive disclosure**: an agent should be routed to
the one document it needs, not handed a single monolith to re-read every time.
The entry-point (`AGENTS.md`, falling back to `CLAUDE.md` / `.cursorrules`) is a
short **map**; `docs/` is the **system of record** that carries the depth.

### docs-structure/entry-point-exists

**Finding:** no agent entry-point file exists at the repo root.

**Fix:** create an `AGENTS.md` at the repo root. Keep it a short map: one
paragraph on what the project is, a "conventions" section, a "package/dir
layout" section, and links into `docs/` for anything detailed. Do not paste
full guides into it — that trips `entry-point-is-a-map`.

### docs-structure/entry-point-is-a-map

**Finding:** the entry-point file exceeds `ENTRY_POINT_MAX_LINES` non-blank
lines — it has become a manual.

**Fix:** move detail out of the entry-point into focused files under `docs/`,
leaving behind a one-line pointer. For example, lift a long "how to write a
rule" section into `docs/HOW_TO_WRITE_A_RULE.md` and replace it in the
entry-point with `See docs/HOW_TO_WRITE_A_RULE.md`. Re-run the scan; the
entry-point should drop under the threshold.

### docs-structure/docs-directory-exists

**Finding:** there is no `docs/` directory, or it contains no markdown file.

**Fix:** create `docs/` at the repo root and add at least one `.md` file holding
the detailed conventions the entry-point should delegate to. If detail currently
lives inside the entry-point, this is the destination for it — pair this fix
with `entry-point-is-a-map`.

### docs-structure/entry-point-links-into-docs

**Finding:** the entry-point never references `docs/`, so the map and the system
of record are not wired together.

**Fix:** add at least `ENTRY_POINT_MIN_DOCS_LINKS` reference from the
entry-point into `docs/`. Either a markdown link (`See [the guide](docs/guide.md)`)
or a bare relative path (`docs/guide.md`) counts. Point at the specific docs an
agent will most often need.

### docs-structure/no-monolithic-instruction-file

**Finding:** a markdown instruction file (under `docs/` or at the repo root,
excluding the entry-point) exceeds `MONOLITHIC_DOC_MAX_LINES` non-blank lines.

**Fix:** split the oversized file into smaller, topic-scoped documents an agent
can fetch individually, and cross-link them. A 600-line `docs/GUIDE.md` becomes
`docs/guide/setup.md`, `docs/guide/testing.md`, etc., or several flat files —
whichever keeps each under the threshold.

## Tuning the thresholds

The line limits live in `packages/core/src/constants.ts`
(`ENTRY_POINT_MAX_LINES`, `MONOLITHIC_DOC_MAX_LINES`,
`ENTRY_POINT_MIN_DOCS_LINKS`). To silence a docs-structure rule rather than fix
it, set its severity to `"off"` in `doctor.config.*` under `rules`, e.g.
`{ "rules": { "harness-doctor/docs-structure/entry-point-is-a-map": "off" } }`.
