export type FailOnLevel = "error" | "warning" | "none";

export interface HarnessDoctorIgnoreOverride {
  /** Glob patterns the override applies to (e.g. `["src/legacy/**"]`). */
  files: string[];
  /**
   * Rule keys to suppress for the matched files. Omit (or leave empty) to
   * suppress every rule for those files.
   */
  rules?: string[];
}

interface HarnessDoctorIgnoreConfig {
  /**
   * Fully-qualified rule keys (`"<plugin>/<rule>"`) whose diagnostics are
   * dropped after the checks run. Equivalent to setting the rule to
   * `"off"` in the top-level `rules` map. Prefer `harness-doctor rules
   * disable <rule>` to edit this safely.
   */
  rules?: string[];
  /**
   * Glob patterns whose files are excluded from scanning entirely (matched
   * against paths relative to the scanned directory).
   */
  files?: string[];
  /** Per-path rule suppressions — narrower than the top-level `rules`/`files`. */
  overrides?: HarnessDoctorIgnoreOverride[];
  /**
   * Behavioral tags whose rules are skipped entirely, silencing a whole
   * family at once (e.g. `["docs", "dead-code", "supply-chain"]`).
   * Prefer `harness-doctor rules ignore-tag <tag>` to edit this safely.
   */
  tags?: string[];
}

/**
 * Discrete output channels a diagnostic can flow through after a scan.
 * Each surface is filtered independently so a rule can be visible
 * locally but excluded from PR comments, the score, or the CI gate:
 *
 * - `cli` — local terminal output from `harness-doctor` (`printDiagnostics`).
 * - `prComment` — diagnostics destined for a sticky pull-request
 *   summary comment. Selected by running the CLI with `--pr-comment`
 *   (sets `outputSurface: "prComment"`).
 * - `score` — diagnostics shipped to the Harness Doctor score API
 *   (or counted toward local score calculations).
 * - `ciFailure` — diagnostics that count toward the `--fail-on` exit
 *   code gate. A diagnostic excluded from this surface never fails the
 *   build, regardless of severity.
 *
 * Defaults: design rules (tag `"design"`) are excluded from `prComment`,
 * `score`, and `ciFailure` so style cleanup doesn't dilute meaningful
 * findings. They remain in `cli` so locally-running developers
 * still see the suggestion when they touch the file.
 */
export type DiagnosticSurface = "cli" | "prComment" | "score" | "ciFailure";

/**
 * Severity value accepted by the top-level `rules` and `categories`
 * config fields (the same form ESLint accepts): `"off"` drops the
 * rule's findings entirely (they never enter any surface);
 * `"error"` / `"warn"` change the reported severity.
 *
 * For visibility-only adjustments (silence on PR comments but keep
 * on CLI / score), prefer `surfaces` instead — severity is the most
 * aggressive control.
 */
export type RuleSeverityOverride = "error" | "warn" | "off";

/**
 * Internal shape consumed by `resolveRuleSeverityOverride` and
 * `buildDiagnosticPipeline`. Assembled at runtime from the top-level
 * `rules` and `categories` fields on `HarnessDoctorConfig`. Per-rule
 * wins over per-category when both match the same diagnostic.
 */
export interface RuleSeverityControls {
  rules?: Record<string, RuleSeverityOverride>;
  categories?: Record<string, RuleSeverityOverride>;
}

export interface SurfaceControls {
  /**
   * Tag names whose diagnostics should be force-included on the surface,
   * even if a default or category-level exclusion would otherwise drop
   * them. Include wins over exclude when both apply to the same rule.
   */
  includeTags?: string[];
  /**
   * Tag names whose diagnostics should be excluded from the surface.
   * Use this to silence whole rule families (e.g. `["design"]`,
   * `["test-noise"]`) for a single channel without touching others.
   */
  excludeTags?: string[];
  /** Category names (e.g. `"Maintainability"`) to force-include. */
  includeCategories?: string[];
  /** Category names (e.g. `"Maintainability"`) to exclude. */
  excludeCategories?: string[];
  /**
   * Fully-qualified rule keys (`"<plugin>/<rule>"`, e.g.
   * `"harness-doctor/docs-structure/no-structure-md"`) to force-include.
   */
  includeRules?: string[];
  /** Fully-qualified rule keys to exclude from this surface. */
  excludeRules?: string[];
}

export interface HarnessDoctorConfig {
  $schema?: string;
  ignore?: HarnessDoctorIgnoreConfig;
  /**
   * Whether to run dead-code analysis (via `deslop-js`) alongside the
   * docs-structure checks. Reports unused files, unused exports, unused dependencies, and
   * circular imports under the "Maintainability" category. Default: `true`.
   * Always skipped in `--diff` / `--staged` modes because reachability
   * is a whole-project property.
   */
  deadCode?: boolean;
  /**
   * Opt into the stricter Harness docs contract. When true, docs-structure
   * checks expect the durable `docs/todos/INDEX.md` queue even before a repo
   * has open todo specs. Other deterministic docs checks remain always-on.
   */
  docsContract?: boolean;
  verbose?: boolean;
  /**
   * Whether to surface `"warning"`-severity diagnostics. Default: `true`
   * — every warning reaches every surface (CLI, PR comment, score,
   * `--fail-on`).
   *
   * Set to `false` to surface only `"error"`-severity findings. This is the
   * master toggle and runs after per-rule / per-category severity
   * overrides: a rule the user explicitly restamps to `"warn"` (via
   * `rules` / `categories`) still shows even when `warnings` is `false`.
   */
  warnings?: boolean;
  diff?: boolean | string;
  failOn?: FailOnLevel;
  share?: boolean;
  noScore?: boolean;
  /**
   * Redirect harness-doctor at a different project directory than the one
   * it was invoked against. Resolved relative to the location of the
   * config file that declared this field (NOT relative to the CWD), so
   * the redirect is stable no matter where the CLI / `diagnose()` is
   * run from. Absolute paths are used as-is.
   *
   * Typical use: a monorepo root holds the only `doctor.config.*`
   * (so editor tooling and child commands all find it), but the main
   * app lives in `apps/web`. Setting `"rootDir": "apps/web"` makes
   * every invocation that loads this config scan that subproject
   * without anyone needing to `cd` first or pass an explicit path.
   *
   * Ignored if the resolved path does not exist or is not a directory
   * (a warning is emitted and harness-doctor falls back to the originally
   * requested directory).
   */
  rootDir?: string;
  /**
   * Whether to respect inline `// eslint-disable*`, `// oxlint-disable*`,
   * and `// harness-doctor-disable*` comments in source files. Default: `true`.
   *
   * File-level ignores (`.gitignore`, `.eslintignore`, `.oxlintignore`,
   * `.prettierignore`, `.gitattributes` `linguist-vendored` /
   * `linguist-generated`) are ALWAYS honored regardless of this option
   * — they typically point at vendored or generated code that
   * genuinely shouldn't be linted at all.
   *
   * Set to `false` for "audit mode": every inline suppression is
   * neutralized so harness-doctor reports every diagnostic regardless
   * of historical hide-comments.
   */
  respectInlineDisables?: boolean;
  /**
   * Per-surface include/exclude controls. Each `DiagnosticSurface` is
   * resolved independently against rule tags, category, and id so a
   * single rule can be visible locally yet hidden from PR comments,
   * neutralized from the score, and excluded from `--fail-on` — all
   * without touching the rule's severity or activation.
   *
   * Defaults (applied before user overrides):
   *
   * - `prComment` excludes tag `"design"`
   * - `score` excludes tag `"design"`
   * - `ciFailure` excludes tag `"design"`
   *
   * Pass any controls block (even an empty `{}`) to keep the default
   * exclusions; the user's include/exclude entries layer on top.
   * Include entries always win over exclude entries — handy for
   * promoting a single high-signal `design-*` rule back into the
   * score or PR-comment surface.
   */
  surfaces?: Partial<Record<DiagnosticSurface, SurfaceControls>>;
  /**
   * Per-rule severity map — the ESLint-shaped top-level `rules`
   * field. Keys are fully-qualified rule keys (`"<plugin>/<rule>"`,
   * e.g. `"harness-doctor/docs-structure/spec-contract-exists"`),
   * values are `"error" | "warn" | "off"`.
   *
   * `"off"` drops the rule's findings entirely; `"error"` / `"warn"`
   * re-stamp the reported severity, so downstream consumers
   * (`--fail-on`, the score, the printed list) all see the
   * user-chosen severity.
   *
   * For visibility-only changes (silence on PR comments but keep on
   * CLI / score), prefer `surfaces` instead. Most specific control
   * wins: `rules` > `categories` > `tags`.
   *
   * ```json
   * { "rules": { "harness-doctor/docs-structure/spec-contract-exists": "error" } }
   * ```
   */
  rules?: Record<string, RuleSeverityOverride>;
  /**
   * Per-category severity map, keyed by Harness Doctor's five
   * user-facing buckets: `"Security"`, `"Bugs"`, `"Performance"`,
   * `"Accessibility"`, `"Maintainability"`.
   *
   * ```json
   * { "categories": { "Maintainability": "off", "Performance": "warn" } }
   * ```
   *
   * To silence a whole tag-defined rule family (e.g. `"docs"`,
   * `"dead-code"`) that doesn't align with a single category, use
   * `ignore.tags` instead.
   */
  categories?: Record<string, RuleSeverityOverride>;
}
