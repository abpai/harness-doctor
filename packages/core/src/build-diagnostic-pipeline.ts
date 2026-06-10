import type { Diagnostic, HarnessDoctorConfig, RuleSeverityOverride } from "./types/index.js";
import {
  compileIgnoreOverrides,
  isDiagnosticIgnoredByOverrides,
} from "./apply-ignore-overrides.js";
import { restampSeverity } from "./apply-severity-controls.js";
import { buildRuleSeverityControls } from "./build-rule-severity-controls.js";
import { evaluateSuppression } from "./evaluate-suppression.js";
import { getDiagnosticRuleIdentity } from "./get-diagnostic-rule-identity.js";
import { compileIgnoredFilePatterns, isFileIgnoredByPatterns } from "./is-ignored-file.js";
import { isTestFilePath } from "./is-test-file.js";
import { resolveRuleSeverityOverride } from "./resolve-rule-severity-override.js";
import { isSameRuleKey } from "./rule-key-aliases.js";
import { getRuleTags } from "./rule-catalog.js";
import { resolveCandidateReadPath } from "./utils/resolve-candidate-read-path.js";

interface BuildDiagnosticPipelineInput {
  readonly rootDirectory: string;
  readonly userConfig: HarnessDoctorConfig | null;
  readonly readFileLinesSync: (filePath: string) => string[] | null;
  readonly respectInlineDisables: boolean;
  /**
   * Whether `"warning"`-severity diagnostics are allowed through. When
   * `true` (the default), warnings show; when `false`, every warning is
   * dropped UNLESS the user explicitly opted that specific rule / category
   * into `"warn"` via the severity-override config (an individual opt-in).
   * Resolved by the caller from the `--warnings` / `--no-warnings` flag →
   * `config.warnings` → `true`.
   */
  readonly showWarnings: boolean;
}

export interface DiagnosticPipeline {
  readonly apply: (diagnostic: Diagnostic) => Diagnostic | null;
}

/**
 * Pre-compiles every stateful filter and returns a single
 * `apply(diagnostic)` closure that runs (in order):
 *
 * 1. auto-suppress (test-noise rules in test files; `migration-hint`
 *    wins over `test-noise`)
 * 2. severity overrides (top-level `rules` / `categories`, with
 *    `"off"` dropping)
 * 3. warning suppression (only when `showWarnings` is false: drops every
 *    `"warning"`-severity diagnostic unless a severity override opts a
 *    specific rule / category back in)
 * 4. ignore filters (rules / tags / file patterns / per-file overrides)
 * 5. inline suppressions (`// harness-doctor-disable-next-line ...`)
 *
 * Returns `null` when the diagnostic is dropped, the (possibly
 * severity-restamped) diagnostic otherwise.
 *
 * This is the single source of truth for diagnostic filtering — both
 * `runInspect`'s streaming pipeline and the array-shaped
 * `mergeAndFilterDiagnostics` wrapper apply this closure per element.
 */
export const buildDiagnosticPipeline = (
  input: BuildDiagnosticPipelineInput,
): DiagnosticPipeline => {
  const { rootDirectory, userConfig, readFileLinesSync, respectInlineDisables, showWarnings } =
    input;

  const severityControls = buildRuleSeverityControls(userConfig);
  const ignoredRules = new Set(
    Array.isArray(userConfig?.ignore?.rules)
      ? userConfig.ignore.rules.filter((rule): rule is string => typeof rule === "string")
      : [],
  );
  const ignoredFilePatterns = compileIgnoredFilePatterns(userConfig);
  const compiledOverrides = compileIgnoreOverrides(userConfig);
  const ignoredTags = new Set(
    Array.isArray(userConfig?.ignore?.tags)
      ? userConfig.ignore.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
  );
  const fileLinesCache = new Map<string, string[] | null>();
  const testFileCache = new Map<string, boolean>();

  const getFileLines = (filePath: string): string[] | null => {
    const cached = fileLinesCache.get(filePath);
    if (cached !== undefined) return cached;
    const absolutePath = resolveCandidateReadPath(rootDirectory, filePath);
    const lines = readFileLinesSync(absolutePath);
    fileLinesCache.set(filePath, lines);
    return lines;
  };

  const isTest = (filePath: string): boolean => {
    let cached = testFileCache.get(filePath);
    if (cached === undefined) {
      cached = isTestFilePath(filePath);
      testFileCache.set(filePath, cached);
    }
    return cached;
  };

  const shouldAutoSuppress = (diagnostic: Diagnostic): boolean => {
    const tags = getRuleTags(diagnostic.plugin, diagnostic.rule);
    if (!tags.includes("test-noise")) return false;
    if (tags.includes("migration-hint")) return false;
    return isTest(diagnostic.filePath);
  };

  const isRuleIgnored = (ruleIdentifier: string): boolean => {
    for (const ignored of ignoredRules) {
      if (isSameRuleKey(ignored, ruleIdentifier)) return true;
    }
    return false;
  };

  return {
    apply: (diagnostic) => {
      if (shouldAutoSuppress(diagnostic)) return null;

      let current = diagnostic;
      let explicitSeverityOverride: RuleSeverityOverride | undefined;
      if (severityControls) {
        const { ruleKey, category } = getDiagnosticRuleIdentity(current);
        explicitSeverityOverride = resolveRuleSeverityOverride(
          { ruleKey, category },
          severityControls,
        );
        if (explicitSeverityOverride === "off") return null;
        if (explicitSeverityOverride !== undefined) {
          current = restampSeverity(current, explicitSeverityOverride);
        }
      }

      // Ignored tags silence whole rule families at once (e.g.
      // `ignore.tags: ["docs"]`). Applied after severity overrides so an
      // explicit per-rule override doesn't resurrect a tag-ignored rule —
      // tags are the broader, deliberate opt-out.
      if (ignoredTags.size > 0) {
        const tags = getRuleTags(current.plugin, current.rule);
        if (tags.some((tag) => ignoredTags.has(tag))) return null;
      }

      // When the user opts out of warnings (`showWarnings` false), an
      // explicit `"warn"` override (per-rule or per-category) is an
      // individual opt-in that survives the global hide; everything else
      // is dropped.
      if (!showWarnings && current.severity === "warning" && explicitSeverityOverride !== "warn") {
        return null;
      }

      if (userConfig) {
        const ruleIdentifier = `${current.plugin}/${current.rule}`;
        if (isRuleIgnored(ruleIdentifier)) return null;
        if (isFileIgnoredByPatterns(current.filePath, rootDirectory, ignoredFilePatterns)) {
          return null;
        }
        if (isDiagnosticIgnoredByOverrides(current, rootDirectory, compiledOverrides)) return null;
      }

      if (respectInlineDisables && current.line > 0) {
        const lines = getFileLines(current.filePath);
        if (lines) {
          const ruleIdentifier = `${current.plugin}/${current.rule}`;
          const diagnosticLineIndex = current.line - 1;
          const evaluation = evaluateSuppression(lines, diagnosticLineIndex, ruleIdentifier);
          if (evaluation.isSuppressed) return null;
          if (evaluation.nearMissHint) {
            current = { ...current, suppressionHint: evaluation.nearMissHint };
          }
        }
      }

      return current;
    },
  };
};
