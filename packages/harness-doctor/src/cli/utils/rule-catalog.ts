import { HARNESS_DOCTOR_RULE_CATALOG, isSameRuleKey } from "@harness-doctor/core";
import type { RuleDefaultSeverity } from "@harness-doctor/core";

export interface RuleCatalogEntry {
  /** Fully-qualified rule key, e.g. `harness-doctor/docs-structure/spec-contract-exists`. */
  readonly key: string;
  /** Bare rule id without the plugin prefix, e.g. `docs-structure/spec-contract-exists`. */
  readonly id: string;
  /** Display category, e.g. `Maintainability`. */
  readonly category: string;
  /** Severity the rule reports with when no config override applies. */
  readonly defaultSeverity: RuleDefaultSeverity;
  /** Behavioral tags (`docs`, `dead-code`, `supply-chain`, …) consumed by `ignore.tags`. */
  readonly tags: ReadonlyArray<string>;
  /** Short fix guidance shown to users; mirrors the diagnostic `help`. */
  readonly recommendation: string | undefined;
  /** `false` for opt-in rules that only run when explicitly enabled. */
  readonly defaultEnabled: boolean;
}

export const buildRuleCatalog = (): RuleCatalogEntry[] =>
  HARNESS_DOCTOR_RULE_CATALOG.map((entry) => ({
    key: entry.key,
    id: entry.rule,
    category: entry.category,
    defaultSeverity: entry.defaultSeverity,
    tags: entry.tags,
    recommendation: entry.recommendation,
    defaultEnabled: entry.defaultEnabled,
  }));

/**
 * Resolves a user-supplied rule reference to a catalog entry. Accepts the
 * fully-qualified key (`harness-doctor/docs-structure/spec-contract-exists`),
 * the bare id (`docs-structure/spec-contract-exists`), and legacy keys via
 * the shared alias map.
 */
export const findRuleInCatalog = (
  catalog: ReadonlyArray<RuleCatalogEntry>,
  ruleQuery: string,
): RuleCatalogEntry | undefined => {
  const normalizedQuery = ruleQuery.trim();
  if (normalizedQuery.length === 0) return undefined;
  const directMatch = catalog.find(
    (entry) => entry.key === normalizedQuery || entry.id === normalizedQuery,
  );
  if (directMatch) return directMatch;
  return catalog.find((entry) => isSameRuleKey(entry.key, normalizedQuery));
};

export const listRuleCategories = (catalog: ReadonlyArray<RuleCatalogEntry>): string[] =>
  [...new Set(catalog.map((entry) => entry.category))].sort();

export const listRuleTags = (catalog: ReadonlyArray<RuleCatalogEntry>): string[] =>
  [...new Set(catalog.flatMap((entry) => [...entry.tags]))].sort();
