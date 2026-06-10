import { getEquivalentRuleKeys } from "@harness-doctor/core";
import type { HarnessDoctorConfig, RuleSeverityOverride } from "@harness-doctor/core";
import type { RuleCatalogEntry } from "./rule-catalog.js";

type EffectiveSeveritySource = "rule" | "category" | "tag" | "default";

export interface EffectiveRuleSeverity {
  /** Severity the rule effectively runs at, in config vocabulary. */
  readonly value: RuleSeverityOverride;
  /** Which config layer decided the value (most specific wins). */
  readonly source: EffectiveSeveritySource;
}

/**
 * Resolves what a rule will actually do under the current config without
 * running a scan. `ignore.tags` drops a rule carrying an ignored tag
 * before any severity is read, so it wins over every override. Among
 * rules that survive the gate, the scanner's order is `rules` >
 * `categories` > the catalog default.
 */
export const resolveEffectiveRuleSeverity = (
  config: HarnessDoctorConfig | null,
  entry: RuleCatalogEntry,
): EffectiveRuleSeverity => {
  const ignoredTags = config?.ignore?.tags ?? [];
  if (entry.tags.some((tag) => ignoredTags.includes(tag))) {
    return { value: "off", source: "tag" };
  }

  const ruleOverrides = config?.rules ?? {};
  for (const equivalentKey of getEquivalentRuleKeys(entry.key)) {
    const override = ruleOverrides[equivalentKey];
    if (override !== undefined) return { value: override, source: "rule" };
  }

  const categoryOverride = config?.categories?.[entry.category];
  if (categoryOverride !== undefined) return { value: categoryOverride, source: "category" };

  return {
    value: entry.defaultEnabled ? entry.defaultSeverity : "off",
    source: "default",
  };
};
