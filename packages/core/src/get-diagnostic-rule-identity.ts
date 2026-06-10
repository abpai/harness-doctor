import { getRuleTags } from "./rule-catalog.js";
import type { Diagnostic } from "./types/index.js";

export interface DiagnosticRuleIdentity {
  ruleKey: string;
  category: string;
  tags: ReadonlyArray<string>;
}

/**
 * Projects a diagnostic onto the three axes rule-targeted controls
 * reason about:
 *
 * - `ruleKey` — the fully-qualified `"<plugin>/<rule>"` form users
 *   put in config files (consumed by top-level `rules` severity and
 *   `surfaces.*.{include,exclude}Rules`).
 * - `category` — the diagnostic's category label (consumed by
 *   top-level `categories` severity and
 *   `surfaces.*.{include,exclude}Categories`).
 * - `tags` — behavioral tags from the rule catalog (consumed by
 *   `ignore.tags` and `surfaces.*.{include,exclude}Tags`). Empty
 *   for rules outside the catalog.
 */
export const getDiagnosticRuleIdentity = (diagnostic: Diagnostic): DiagnosticRuleIdentity => ({
  ruleKey: `${diagnostic.plugin}/${diagnostic.rule}`,
  category: diagnostic.category,
  tags: getRuleTags(diagnostic.plugin, diagnostic.rule),
});
