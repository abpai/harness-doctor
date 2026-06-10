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

export const JSX_FILE_PATTERN = /\.(tsx|jsx)$/;

// Whether `"warning"`-severity diagnostics surface when neither the
// caller (`--warnings` / `warnings:`) nor `config.warnings` decide.
// Warnings show by default — only `"error"` is too generous a bar for a
// health scan; users opt out with `--no-warnings` or `"warnings": false`.
export const DEFAULT_SHOW_WARNINGS = true;

export const MILLISECONDS_PER_SECOND = 1000;

// Upper bound for the `react:<major>` capability loop in
// `buildCapabilities`, clamping an unvalidated package.json spec like
// `"react": "20240101"` that would otherwise drive the loop to tens of
// millions of iterations (hang / OOM). Set generously — React ships
// ~one major a year and is probably only gonna be around for another
// 10 yrs, so 30 is plenty of headroom; any unused `react:<n>` capability
// strings above the latest real major are harmless.
export const LATEST_KNOWN_REACT_MAJOR = 30;

// Lowest React major harness-doctor emits a `react:<major>` capability
// for (rules gate on `react:17`+ at the floor).
export const EARLIEST_GATED_REACT_MAJOR = 17;

// Preact mirror of `LATEST_KNOWN_REACT_MAJOR`. Preact ships majors slowly
// (X/10 since 2019, 11 next), so 20 is ample headroom; surplus
// `preact:<n>` capability strings above the latest real major are harmless.
export const LATEST_KNOWN_PREACT_MAJOR = 20;

// Lowest Preact major harness-doctor emits a `preact:<major>` capability
// for. Preact X (10) is the modern baseline.
export const EARLIEST_GATED_PREACT_MAJOR = 10;

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

// Canonical JSON Schema for `doctor.config.json`. Stamped as the
// `$schema` field when the rule-config CLI creates a config file so
// editors get autocomplete + hover docs (matches the README guidance).
export const CONFIG_SCHEMA_URL = "https://harness.doctor/schema/config.json";

export const FETCH_TIMEOUT_MS = 10_000;

export const GITHUB_VIEWER_PERMISSION_TIMEOUT_MS = 2_000;

// HACK: Windows CreateProcessW limits total command-line length to 32,767 chars.
// Use a conservative threshold to leave room for the executable path and quoting overhead.
export const SPAWN_ARGS_MAX_LENGTH_CHARS = 24_000;

// HACK: bound per-batch work so that JS-evaluated plugins with bad
// scaling (originally the upstream `effect` plugin — verified to hit
// the 5-min spawn timeout on supabase/studio's ~3500 source files at
// batch=500, productive at batch=100; same characteristics apply to
// the ported `harness-doctor/no-derived-state` family because both rely
// on whole-component scope walking) stay tractable AND so that oxlint
// doesn't SIGABRT from memory pressure on very large file sets.
// Smaller batches add ~50ms spawn overhead per extra batch — negligible
// vs the hard-cap perf cliffs they prevent.
export const OXLINT_MAX_FILES_PER_BATCH = 100;

// Bounds for the lint worker count (the `OxlintConcurrency` Reference, seeded
// by the `HARNESS_DOCTOR_PARALLEL` env var; the CLI's `--no-parallel` flag forces
// the MIN end). Harness Doctor's rules are oxlint JS plugins — single-threaded
// per process — so
// running the file batches across N concurrent oxlint subprocesses scales the
// scan nearly linearly with N. MAX bounds peak memory (each worker holds its
// batch's ASTs); the resolved count is clamped to [MIN, MAX].
export const MIN_SCAN_CONCURRENCY = 1;

export const MAX_SCAN_CONCURRENCY = 16;

export const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

// JSON-format oxlint / eslint configs harness-doctor can fold into the
// scan via oxlint's `extends` field. JS / TS configs need a runtime
// to evaluate and aren't supported by oxlint's `extends`. Listed in
// detection priority order — oxlint native first, eslint legacy as a
// compatibility fallback. Also used by tests as the source of truth.
export const ADOPTABLE_LINT_CONFIG_FILENAMES = [".oxlintrc.json", ".eslintrc.json"];

export const OXLINT_NODE_REQUIREMENT = "^20.19.0 || >=22.12.0";

export const OXLINT_RECOMMENDED_NODE_MAJOR = 24;

export const GIT_SHOW_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Project-config files that `StagedFiles.materialize` copies into
 * the temp directory alongside staged sources so oxlint resolves
 * `tsconfig` / `package.json` / lint configs the same way it would
 * in the working tree. Hoisted out of the staged-files helper so
 * the constant lives next to the rest of the IO budget knobs.
 */
export const STAGED_FILES_PROJECT_CONFIG_FILENAMES = [
  "tsconfig.json",
  "tsconfig.base.json",
  "package.json",
  "doctor.config.ts",
  "doctor.config.mts",
  "doctor.config.cts",
  "doctor.config.js",
  "doctor.config.mjs",
  "doctor.config.cjs",
  "doctor.config.json",
  "doctor.config.jsonc",
  "oxlint.json",
  ".oxlintrc.json",
] as const;

export const CANONICAL_GITHUB_URL = "https://github.com/abpai/harness-doctor";

export const CANONICAL_DISCORD_URL = "https://harness.doctor/discord";

export const SKILL_NAME = "harness-doctor";

// HACK: cap on combined stdout+stderr bytes per oxlint batch. Above
// this we kill the process (SIGKILL) and ask the user to narrow the
// scan with --diff. Pinned to 50 MiB because oxlint emits ~1 KB of
// JSON per diagnostic and the largest real-world batches in the eval
// corpus (supabase/studio at 3,567 source files) produce ~3 MiB
// total — 50 MiB leaves an order of magnitude of headroom for
// pathological JS-plugin rules that emit one diagnostic per AST node.
export const OXLINT_OUTPUT_MAX_BYTES = 50 * 1024 * 1024;

// HACK: per-batch wall-clock budget for an oxlint spawn. Each batch
// is at most OXLINT_MAX_FILES_PER_BATCH (= 100) files and a healthy
// batch finishes in well under a second; 60 s leaves a large safety
// margin while still firing fast enough that the binary-split
// recovery in spawnLintBatches narrows a pathological batch to the
// single offending file rather than killing the whole scan as the
// previous 5-min budget did on supabase/studio. The eval harness
// overrides this via the OxlintSpawnTimeoutMs Context.Reference when
// running under Vercel Sandbox microVMs where the oxlint native
// binding is markedly slower than on a developer laptop.
export const OXLINT_SPAWN_TIMEOUT_MS = 60_000;

export const DEAD_CODE_WORKER_TIMEOUT_MS = 120_000;

// deslop's semantic pass builds a full TypeScript program and walks
// every identifier through the type checker. On type-heavy projects
// (large tRPC routers, Effect/Zod schemas, deep generics) the checker
// instantiates enormous types and the child can exceed Node's default
// ~4 GB heap, dying with an uncatchable "heap out of memory" — which
// surfaces as a silent "Scanning failed (dead-code analysis)". Raise
// the child's heap so those projects complete instead of crashing.
export const DEAD_CODE_WORKER_MAX_OLD_SPACE_MB = 8192;

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

// Heading names (lowercased) a spec contract must carry to be consumable
// by task intake: the generic quality bar, the change-type → validation
// proof menu, and the escalation boundaries.
export const SPEC_CONTRACT_REQUIRED_SECTIONS = [
  "quality bar",
  "proof menu",
  "escalation boundaries",
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

export const TODO_SPEC_REQUIRED_SECTIONS = [
  "status",
  "scope",
  "start points",
  "invariants",
  "validation",
  "close condition",
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

// The closed set of user-facing diagnostic categories. Every rule
// (collapsed at codegen via `CATEGORY_BUCKET` in
// `generate-rule-registry.mjs`) and every directly-constructed
// diagnostic (dead-code, reduced-motion, pnpm-hardening) must report one
// of these — the renderer, JSON output, and `categories` severity
// overrides all assume this set is exhaustive. `rule-metadata.test.ts`
// asserts the registry never drifts outside it.
export const DIAGNOSTIC_CATEGORY_BUCKETS = [
  "Security",
  "Bugs",
  "Performance",
  "Accessibility",
  "Maintainability",
] as const;

// Rules whose heuristic only makes sense in application code. A published
// library deliberately exposes flexible primitives (components built in
// render to capture closures, many `render*` slots for composition), so these
// fire on `app` / `unknown` files but stay silent on confidently-classified
// `library` files (see `classify-package-role.ts`). Users can still force one
// on for a library by setting its severity explicitly in config.
export const APP_ONLY_RULE_KEYS: ReadonlySet<string> = new Set([
  "react-hooks-js/static-components",
  "harness-doctor/no-render-prop-children",
]);

// The `compiler-cleanup` severity bucket: redundant-memoization rules that
// only fire once React Compiler is detected and ship as warnings by default
// (hidden in the default report). Setting `buckets: { "compiler-cleanup":
// "error" }` re-enables full strictness.
//
// Only the local `react-compiler-no-manual-memoization` rule belongs here —
// it flags `useMemo` / `useCallback` / `memo` the compiler makes redundant
// (correctness-neutral cleanup). The external `react-hooks-js/*` compiler
// rules deliberately stay `error`: each marks code the compiler could NOT
// optimize, which is a real perf regression, not cleanup.
export const COMPILER_CLEANUP_BUCKET = "compiler-cleanup";
export const COMPILER_CLEANUP_RULE_KEYS: ReadonlySet<string> = new Set([
  "harness-doctor/react-compiler-no-manual-memoization",
]);

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
// reload the same `harness-doctor.config.json` each time. Capacity bounds
// memory on monorepos with hundreds of workspace packages; TTL handles
// long-running consumers (watch-mode tools, language servers).
export const CONFIG_CACHE_CAPACITY = 16;

export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1_000;

/**
 * Max sample size shown in partial-failure preview text (e.g.
 * "and N more files: a.ts, b.ts, c.ts") emitted by the oxlint
 * binary-split-retry loop.
 */
export const OXLINT_PARTIAL_FAILURE_PREVIEW_COUNT = 3;

// HACK: interval for simulated per-file progress ticks while an oxlint
// batch subprocess runs. The timer increments a counter so the spinner
// updates smoothly instead of jumping by the batch size on completion.
export const PROGRESS_TICK_INTERVAL_MS = 50;
