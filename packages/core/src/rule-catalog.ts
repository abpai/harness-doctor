/**
 * Static registry of every rule Harness Doctor can emit, now that all
 * checks are deterministic in-process scanners (docs-structure, supply
 * chain, dead-code) rather than lint-engine rules.
 *
 * This is the single source of truth consumed by:
 *
 * - the `rules` CLI (`rules list` / `explain` / `set` / `disable` /
 *   `category` / `ignore-tag`) for catalog display and key validation,
 * - `getDiagnosticRuleIdentity` for tag lookup (which feeds
 *   `ignore.tags` and per-surface tag controls).
 *
 * Keep entries in sync with the rule keys the checks emit
 * (`checks/docs-structure.ts`, `checks/pnpm-hardening.ts`,
 * `check-dead-code.ts`) — `rule-catalog.test.ts` asserts the catalog
 * matches the emitted keys.
 */

export type RuleDefaultSeverity = "error" | "warn";

export interface CoreRuleMetadata {
  /** Fully-qualified rule key (`"<plugin>/<rule>"`) used in config files. */
  readonly key: string;
  /** Diagnostic `plugin` field (e.g. `"harness-doctor"`, `"deslop"`). */
  readonly plugin: string;
  /** Diagnostic `rule` field (e.g. `"docs-structure/spec-contract-exists"`). */
  readonly rule: string;
  /** Display category (one of `DIAGNOSTIC_CATEGORY_BUCKETS`). */
  readonly category: string;
  /** Severity the rule reports with when no config override applies. */
  readonly defaultSeverity: RuleDefaultSeverity;
  /** Behavioral tags consumed by `ignore.tags` and surface controls. */
  readonly tags: ReadonlyArray<string>;
  /** Short fix guidance shown by `rules explain`. */
  readonly recommendation: string;
  /**
   * `false` for rules that only fire when explicitly opted in (e.g. the
   * strict `docsContract: true` checks).
   */
  readonly defaultEnabled: boolean;
}

const docsStructureRule = (
  rule: string,
  recommendation: string,
  options: { defaultEnabled?: boolean } = {},
): CoreRuleMetadata => ({
  key: `harness-doctor/docs-structure/${rule}`,
  plugin: "harness-doctor",
  rule: `docs-structure/${rule}`,
  category: "Maintainability",
  defaultSeverity: "warn",
  tags: ["docs"],
  recommendation,
  defaultEnabled: options.defaultEnabled ?? true,
});

const deadCodeRule = (rule: string, recommendation: string): CoreRuleMetadata => ({
  key: `deslop/${rule}`,
  plugin: "deslop",
  rule,
  category: "Maintainability",
  defaultSeverity: "warn",
  tags: ["dead-code"],
  recommendation,
  defaultEnabled: true,
});

export const HARNESS_DOCTOR_RULE_CATALOG: ReadonlyArray<CoreRuleMetadata> = [
  docsStructureRule(
    "entry-point-exists",
    "Add an AGENTS.md (or CLAUDE.md / .cursorrules) at the repo root that maps the project and links into docs/.",
  ),
  docsStructureRule(
    "entry-point-is-a-map",
    "Trim the entry-point to a short map and move detail into focused files under docs/.",
  ),
  docsStructureRule(
    "docs-directory-exists",
    "Create a docs/ directory at the repo root with at least one markdown file holding the detailed conventions.",
  ),
  docsStructureRule(
    "entry-point-links-into-docs",
    "Reference at least one file under docs/ from the entry-point so the map routes into the system of record.",
  ),
  docsStructureRule(
    "no-monolithic-instruction-file",
    "Split oversized instruction files into smaller topic-scoped documents under docs/.",
  ),
  docsStructureRule(
    "docs-index-exists",
    "Add docs/INDEX.md as a table of contents linking to the docs that exist in this repo.",
  ),
  docsStructureRule(
    "architecture-map-exists",
    "Add a compact docs/ARCHITECTURE.md describing the current system shape and package boundaries.",
  ),
  docsStructureRule(
    "single-canonical-glossary",
    "Choose one canonical glossary, link it from docs/INDEX.md, and remove or redirect the duplicates.",
  ),
  docsStructureRule(
    "spec-contract-exists",
    "Add docs/SPEC_CONTRACT.md with a quality bar, a proof menu, and escalation boundaries.",
  ),
  docsStructureRule(
    "spec-contract-has-required-sections",
    "Add the missing sections (quality bar, proof menu, escalation boundaries) to docs/SPEC_CONTRACT.md.",
  ),
  docsStructureRule(
    "spec-contract-declares-grader-sufficiency",
    "Add a Sufficiency column (auto / human-gate) to the SPEC_CONTRACT.md proof menu so each change type declares whether its auto-grader is sufficient, or leave docsContract unset/false.",
    { defaultEnabled: false },
  ),
  docsStructureRule(
    "engineering-docs-exist",
    "Add docs/engineering/commands.md and docs/engineering/testing.md, or leave docsContract unset/false.",
    { defaultEnabled: false },
  ),
  docsStructureRule(
    "no-structure-md",
    "Move durable structure information into docs/ARCHITECTURE.md and delete STRUCTURE.md.",
  ),
  docsStructureRule(
    "agents-md-within-byte-budget",
    "Trim or consolidate the AGENTS.md chain under the Codex byte budget; move depth into docs/ files.",
  ),
  docsStructureRule(
    "claude-shim-imports-agents",
    "Make CLAUDE.md a shim whose content is the import line `@AGENTS.md`, keeping AGENTS.md the source of truth.",
  ),
  docsStructureRule(
    "todos-index-exists",
    "Add docs/todos/INDEX.md listing open todo specs, or set docsContract: false.",
    { defaultEnabled: false },
  ),
  docsStructureRule(
    "domain-docs-complete",
    "Add the missing INDEX.md / code-map.md / invariants.md / test-map.md files to each docs/domains/<domain>/.",
  ),
  docsStructureRule(
    "no-banned-long-lived-path",
    "Remove the banned long-lived harness path; move durable knowledge into the smallest relevant docs file.",
  ),
  docsStructureRule(
    "markdown-link-target-exists",
    "Fix or remove markdown links whose targets no longer exist in the repo.",
  ),
  docsStructureRule(
    "todo-spec-has-required-sections",
    "Add the missing sections (status, scope, start here, invariants, validation, close when) to the todo spec.",
  ),
  {
    key: "harness-doctor/require-pnpm-hardening",
    plugin: "harness-doctor",
    rule: "require-pnpm-hardening",
    category: "Security",
    defaultSeverity: "warn",
    tags: ["supply-chain"],
    recommendation:
      "Harden pnpm against supply-chain attacks: set minimumReleaseAge and related settings in pnpm-workspace.yaml.",
    defaultEnabled: true,
  },
  deadCodeRule("unused-file", "Delete the unreachable file or wire it back into the module graph."),
  deadCodeRule("unused-export", "Remove the unused export or its `export` keyword."),
  deadCodeRule("unused-type", "Remove the unused exported type or its `export` keyword."),
  deadCodeRule("unused-dependency", "Remove the unused dependency from package.json."),
  deadCodeRule("unused-dev-dependency", "Remove the unused devDependency from package.json."),
  deadCodeRule(
    "circular-dependency",
    "Break the import cycle by extracting the shared piece into its own module.",
  ),
];

const CATALOG_BY_DIAGNOSTIC_KEY = new Map(
  HARNESS_DOCTOR_RULE_CATALOG.map((entry) => [`${entry.plugin}/${entry.rule}`, entry]),
);

/** Catalog entry for a diagnostic's `<plugin>/<rule>` pair, if known. */
export const findRuleMetadata = (plugin: string, rule: string): CoreRuleMetadata | undefined =>
  CATALOG_BY_DIAGNOSTIC_KEY.get(`${plugin}/${rule}`);

/** Behavioral tags for a diagnostic's rule (empty for unknown rules). */
export const getRuleTags = (plugin: string, rule: string): ReadonlyArray<string> =>
  findRuleMetadata(plugin, rule)?.tags ?? [];
