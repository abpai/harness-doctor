// Maps a rule key as it appeared in OLDER user configs to its current
// canonical key. The boilerplate ships with no legacy aliases — the map
// is intentionally empty and exists as the extension point integrators
// use to preserve backward compatibility when they rename a rule.
//
// Every config surface that accepts rule keys (`ignore.rules`, severity
// overrides in `rules`, the `buildDiagnosticPipeline` severity path, and
// inline-suppression matching via `isSameRuleKey`) routes through these
// helpers, so adding an entry here is enough to keep an old key working.
const LEGACY_RULE_KEY_TO_NATIVE_RULE_KEY: Readonly<Record<string, string>> = {};

const NATIVE_RULE_KEY_TO_LEGACY_RULE_KEYS = new Map<string, string[]>();
for (const [legacyRuleKey, nativeRuleKey] of Object.entries(LEGACY_RULE_KEY_TO_NATIVE_RULE_KEY)) {
  const aliases = NATIVE_RULE_KEY_TO_LEGACY_RULE_KEYS.get(nativeRuleKey) ?? [];
  aliases.push(legacyRuleKey);
  NATIVE_RULE_KEY_TO_LEGACY_RULE_KEYS.set(nativeRuleKey, aliases);
}

const getLegacyRuleKeysForNative = (ruleKey: string): ReadonlyArray<string> =>
  NATIVE_RULE_KEY_TO_LEGACY_RULE_KEYS.get(ruleKey) ?? [];

const canonicalizeRuleKey = (ruleKey: string): string =>
  LEGACY_RULE_KEY_TO_NATIVE_RULE_KEY[ruleKey] ?? ruleKey;

export const isSameRuleKey = (candidateRuleKey: string, targetRuleKey: string): boolean =>
  canonicalizeRuleKey(candidateRuleKey) === canonicalizeRuleKey(targetRuleKey);

export const getEquivalentRuleKeys = (ruleKey: string): ReadonlyArray<string> => {
  const nativeRuleKey = canonicalizeRuleKey(ruleKey);
  return [nativeRuleKey, ...getLegacyRuleKeysForNative(nativeRuleKey)];
};
