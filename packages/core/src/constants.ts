// SOURCE_FILE_PATTERN, GIT_LS_FILES_MAX_BUFFER_BYTES, and
// IGNORED_DIRECTORIES live in `./project-info/constants.js`
// (the project-discovery subtree). Re-exported here so core
// consumers don't have to know which subtree owns each constant.
export {
  GENERATED_BUNDLE_FILE_PATTERN,
  GIT_LS_FILES_MAX_BUFFER_BYTES,
  IGNORED_DIRECTORIES,
  MINIFIED_AVG_LINE_LENGTH_CHARS,
  MINIFIED_MAX_LINE_LENGTH_CHARS,
  MINIFIED_MIN_SIZE_BYTES,
  MINIFIED_SNIFF_BYTES,
  SOURCE_FILE_PATTERN,
} from "./project-info/constants.js";

// Whether `"warning"`-severity diagnostics surface when neither the
// caller (`--warnings` / `warnings:`) nor `config.warnings` decide.
// Warnings show by default — only `"error"` is too generous a bar for a
// health scan; users opt out with `--no-warnings` or `"warnings": false`.
export const DEFAULT_SHOW_WARNINGS = true;

export const MILLISECONDS_PER_SECOND = 1000;

export const ERROR_PREVIEW_LENGTH_CHARS = 200;

// Minimum length for the generic high-entropy token sweep in
// `redactSensitiveText`. Real API keys / tokens run 32+ chars; the
// known-format detectors catch shorter prefixed credentials, so this
// floor keeps the catch-all from masking ordinary long identifiers.
export const GENERIC_SECRET_MIN_LENGTH_CHARS = 32;

// Minimum Shannon entropy (bits/char) a long token must clear before the
// generic sweep in `redactSensitiveText` masks it. Random base64url/hex
// credentials sit ~4–6 bits/char; repetitive or word-like identifiers
// (e.g. `componentDisplayName2`, `aaaa…a1`) fall well below this, so the
// floor keeps the catch-all from masking ordinary long identifiers while
// still catching unknown-format secrets. 3.0 mirrors detect-secrets'
// hex-string threshold — low enough to avoid leaks, high enough to spare
// degenerate low-entropy strings.
export const GENERIC_SECRET_MIN_ENTROPY_BITS = 3.0;

export const PERFECT_SCORE = 100;

// Points deducted per diagnostic by the deterministic local score
// fallback (`calculateLocalScore`). Errors weigh twice a warning so the
// offline score still ranks an error-heavy repo below a warning-heavy
// one, mirroring the severity ordering the renderer uses. The local
// fallback is the default path so the boilerplate scores offline without
// depending on a hosted score API.
export const LOCAL_SCORE_ERROR_PENALTY_POINTS = 2;

export const LOCAL_SCORE_WARNING_PENALTY_POINTS = 1;

export const SCORE_GOOD_THRESHOLD = 75;

export const SCORE_OK_THRESHOLD = 50;

export const SCORE_BAR_WIDTH_CHARS = 50;

export const SCORE_API_URL = "https://www.harness.doctor/api/score";

export const ENTERPRISE_CONTACT_URL = "https://harness.doctor/enterprise";

export const SHARE_BASE_URL = "https://harness.doctor/share";

// Root of the documentation site. Guides for CI/CD setup, config files (to
// suppress rules), and diff/PR scanning live under it; the CLI links here
// from its closing "learn more" note.
export const DOCS_URL = "https://harness.doctor/docs";

// Base URL for the per-rule documentation pages. The canonical,
// human-readable fix recipe for one rule lives at `<base>/<plugin>/<rule>`
// (see `buildRuleDocsUrl`) — the CLI links here from its fix-recipe
// directive. The raw `.md` prompts the `/doctor` playbook fetches on demand
// live under `https://www.harness.doctor/prompts/rules/<plugin>/<rule>.md`.
export const DOCS_RULES_BASE_URL = `${DOCS_URL}/rules`;

// Canonical JSON Schema for `harness.config.json`. Stamped as the
// `$schema` field when the rule-config CLI creates a config file so
// editors get autocomplete + hover docs (matches the README guidance).
export const CONFIG_SCHEMA_URL = "https://harness.doctor/schema/config.json";

export const FETCH_TIMEOUT_MS = 10_000;

export const GITHUB_VIEWER_PERMISSION_TIMEOUT_MS = 2_000;

export const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export const GIT_SHOW_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Project-config files that `StagedFiles.materialize` copies into
 * the temp directory alongside staged sources so the scan resolves
 * `tsconfig` / `package.json` / doctor configs the same way it would
 * in the working tree. Hoisted out of the staged-files helper so
 * the constant lives next to the rest of the IO budget knobs.
 */
export const STAGED_FILES_PROJECT_CONFIG_FILENAMES = [
  "tsconfig.json",
  "tsconfig.base.json",
  "package.json",
  "harness.config.ts",
  "harness.config.mts",
  "harness.config.cts",
  "harness.config.js",
  "harness.config.mjs",
  "harness.config.cjs",
  "harness.config.json",
  "harness.config.jsonc",
] as const;

export const CANONICAL_GITHUB_URL = "https://github.com/abpai/harness-doctor";

export const CANONICAL_DISCORD_URL = "https://harness.doctor/discord";

export const SKILL_NAME = "harness-doctor";

export const DEAD_CODE_WORKER_TIMEOUT_MS = 120_000;

// HACK: lookahead cap for JSX opener-span scanning; bounds worst-case
// work on pathological files. Real openers stay well under this.
export const JSX_OPENER_SCAN_MAX_LINES = 32;

// HACK: lookback cap for stacked / near-miss disable-next-line scanning.
// Larger gaps stop being intentional suppressions and become noise.
export const SUPPRESSION_NEAR_MISS_MAX_LINES = 10;

// In the default human output, show several category sections like an
// audit report, but cap each section so one noisy category does not
// bury the rest of the scan.
export const MAX_CATEGORY_GROUPS_SHOWN_NON_VERBOSE = 5;

export const MAX_RULE_GROUPS_PER_CATEGORY_NON_VERBOSE = 3;

// `minimumReleaseAge` in `pnpm-workspace.yaml` is denominated in
// minutes. 7 days × 24 h × 60 min = 10080. Surfaced as the
// recommended starting point for the supply-chain hardening check.
export const RECOMMENDED_PNPM_MINIMUM_RELEASE_AGE_MINUTES = 10_080;

// Agent entry-point filenames the docs-structure checks look for at the
// repo root, in detection-priority order. AGENTS.md is the canonical,
// cross-tool convention; CLAUDE.md and .cursorrules are vendor-specific
// fallbacks. The first one that exists is treated as THE entry-point for
// the "map not a manual" and "links into docs/" checks — a repo only
// needs one. The set is the source of truth for both the check and its
// tests.
export const AGENT_ENTRY_POINT_FILENAMES = ["AGENTS.md", "CLAUDE.md", ".cursorrules"] as const;

// Directory that must hold the documentation system-of-record. Detailed
// guidance lives here so the entry-point can stay a short map instead of
// absorbing every convention.
export const DOCS_DIRECTORY_NAME = "docs";

// Max non-blank line count for the agent entry-point file before the
// "map not a manual" check fires. An entry-point longer than this has
// stopped being a short map that delegates to `docs/` and become a
// monolithic manual, which defeats progressive disclosure — every agent
// must read the whole thing instead of being routed to the one relevant
// doc. Kept tight on purpose; depth belongs in `docs/`.
export const ENTRY_POINT_MAX_LINES = 150;

// Minimum number of references from the entry-point that resolve under
// `docs/`. A map that never points into the system of record is a stub,
// not progressive disclosure, so at least one link must wire the two
// together.
export const ENTRY_POINT_MIN_DOCS_LINKS = 1;

// Max non-blank line count for any single markdown instruction file
// (under `docs/` or at the repo root) before the "no monolithic
// instruction file" check fires. Generalizes the entry-point's "map not
// a manual" limit to the whole docs corpus: an oversized doc should be
// split into focused, individually-disclosable files an agent can fetch
// on demand. Set above ENTRY_POINT_MAX_LINES because a system-of-record
// doc legitimately carries more depth than the top-level map.
export const MONOLITHIC_DOC_MAX_LINES = 400;

// Deterministic Harness docs-contract files. These stay deliberately
// structural: the scanner checks whether the routes exist, not whether their
// prose is wise.
export const DOCS_INDEX_FILENAME = "INDEX.md";

export const DOCS_ARCHITECTURE_FILENAME = "ARCHITECTURE.md";

// The spec contract: what a good SPEC.md looks like for this repo, so
// task intake produces specs the repo can verify. The scanner checks the
// route and section shape exist; whether the proof menu is wise stays a
// semantic judgment for the harness skill.
export const DOCS_SPEC_CONTRACT_FILENAME = "SPEC_CONTRACT.md";

export const DOCS_BEHAVIOR_INVENTORY_FILENAME = "BEHAVIOR_INVENTORY.md";

export const DOCS_BEHAVIOR_LEDGER_FILENAME = "BEHAVIOR_LEDGER.md";

// Heading names (lowercased) a spec contract must carry to be consumable
// by task intake: the generic quality bar, the change-type → validation
// proof menu, and the escalation boundaries.
export const SPEC_CONTRACT_REQUIRED_SECTIONS = [
  "quality bar",
  "proof menu",
  "escalation boundaries",
] as const;

// Header cells (lowercased) that mark the proof menu's grader-sufficiency
// column: per change type, whether the auto-grader is sufficient evidence
// for "done" (`auto`) or the change needs human sign-off (`human-gate`).
// A false-GREEN merges broken work in unattended loops, so opted-in repos
// must declare sufficiency. Only enforced under `docsContract: true`.
export const SPEC_CONTRACT_SUFFICIENCY_COLUMN_ALIASES = [
  "sufficiency",
  "grader sufficiency",
  "sign-off",
] as const;

// Engineering core docs the strict docs contract expects: canonical
// commands (validated by running them) and the change-type → validation
// map. Only enforced when `docsContract: true` — outside the contract,
// commands may legitimately live in README or the proof menu.
export const ENGINEERING_REQUIRED_DOC_PATHS = [
  "docs/engineering/commands.md",
  "docs/engineering/testing.md",
] as const;

// Non-canonical structure-map filename. The contract route is
// docs/ARCHITECTURE.md linked from docs/INDEX.md; a parallel root map
// drifts. Repos mid-migration disable `docs-structure/no-structure-md`.
export const STRUCTURE_MD_FILENAME = "STRUCTURE.md";

// Codex concatenates every AGENTS.md (root → leaf) and silently stops
// adding files once the combined size reaches `project_doc_max_bytes`
// (32 KiB by default) — guidance beyond the cap is dropped without
// warning, so the combined corpus must stay under it.
export const COMBINED_AGENTS_MD_MAX_BYTES = 32 * 1024;

export const CANONICAL_GLOSSARY_FILENAMES = [
  "docs/GLOSSARY.md",
  "UBIQUITOUS_LANGUAGE.md",
  "docs/reference/glossary.md",
] as const;

export const DOMAIN_DOC_REQUIRED_FILENAMES = [
  "INDEX.md",
  "code-map.md",
  "invariants.md",
  "test-map.md",
] as const;

// Sections a todo spec must carry to be pick-up-ready. `label` is the
// canonical name used in diagnostics; `aliases` are the lowercased heading
// names accepted as carrying that section.
export const TODO_SPEC_REQUIRED_SECTIONS = [
  { label: "Status", aliases: ["status"] },
  { label: "Scope", aliases: ["scope"] },
  { label: "Start here", aliases: ["start here", "start points"] },
  { label: "Invariants", aliases: ["invariants", "invariant"] },
  { label: "Validation", aliases: ["validation"] },
  { label: "Close when", aliases: ["close when", "close condition", "done when"] },
] as const;

// `docs/adr` is deliberately NOT banned: an existing maintained ADR
// convention is a legitimate architecture-history home the docs contract
// says to preserve and link from docs/INDEX.md.
export const BANNED_LONG_LIVED_HARNESS_PATHS = [
  ".agent",
  "scripts/agent",
  ".cursor/rules",
  "docs/product-specs",
  "docs/exec-plans",
  "docs/references/vendor-docs",
  "feature-registry.json",
] as const;

// The closed set of user-facing diagnostic categories. Every
// directly-constructed diagnostic (docs-structure, dead-code,
// pnpm-hardening) must report one of these — the renderer, JSON output,
// and `categories` severity overrides all assume this set is exhaustive.
export const DIAGNOSTIC_CATEGORY_BUCKETS = [
  "Security",
  "Bugs",
  "Performance",
  "Accessibility",
  "Maintainability",
] as const;

// How many of the highest-priority error rules to surface in the
// "Top N errors you should fix" header above the category breakdown.
export const TOP_ERRORS_DISPLAY_COUNT = 3;

// Source-context window rendered around each top-error site in the
// inline code frame (lines above / below the offending line).
export const CODE_FRAME_LINES_ABOVE = 1;
export const CODE_FRAME_LINES_BELOW = 1;

// Skip rendering an inline code frame when the offending source line is
// longer than this — a single huge line (minified output, a giant inline
// data literal) only produces an unreadable wall of text in the terminal,
// so we fall back to the bare `file:line` reference instead.
export const CODE_FRAME_MAX_LINE_LENGTH_CHARS = 200;

// When one rule hits several sites in the same file, sites whose frames
// would overlap are merged into a single spanning frame instead of
// rendering near-duplicate boxes. Two sites merge when the gap between
// their lines is within this window (the frame's own context reach), and
// a merged frame never spans more offending lines than the max below — a
// long contiguous run is split into a few bounded frames rather than one
// giant wall.
export const CODE_FRAME_BATCH_MAX_SPAN_LINES = 20;

export const OUTPUT_DETAIL_WRAP_WIDTH_CHARS = 88;

// Typographic "measure" — the line length (in characters) we wrap
// prose explanations to for comfortable reading. Kept short (well under
// the terminal width) so multi-line blurbs stay easy to scan.
export const OUTPUT_MEASURE_WIDTH_CHARS = 60;

export const SPINNER_INDENT_CHARS = 0;

// Defense-in-depth caps for user-supplied glob patterns. Picomatch
// itself is well-hardened against many bad inputs, but ALL glob →
// JavaScript regex compilers emit backtracking-prone output when fed
// densely interleaved wildcards (e.g. `a*a*a*a*…`). These limits
// reject obviously pathological inputs with a clear config error
// before any matcher compilation, bounding worst-case work even when
// the underlying engine is robust. The wildcard cap intentionally
// leaves headroom for realistic ignore patterns
// (e.g. `**/foo/**/bar/**/baz/**/*.tsx` has 9 wildcards) while
// rejecting deeply-stacked globstars and dense alternations.
export const MAX_GLOB_PATTERN_LENGTH_CHARS = 1024;

export const MAX_GLOB_PATTERN_WILDCARD_COUNT = 24;

// `Config.layerNode` caches resolved configs per directory so the CLI's
// repeated `inspect()` calls (one per project in a monorepo loop) don't
// reload the same `harness.config.*` each time. Capacity bounds
// memory on monorepos with hundreds of workspace packages; TTL handles
// long-running consumers (watch-mode tools, language servers).
export const CONFIG_CACHE_CAPACITY = 16;

export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1_000;
