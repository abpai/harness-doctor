import type { Diagnostic } from "../types/index.js";

/**
 * Whether a diagnostic's rule has a published per-rule fix recipe at
 * `${DOCS_RULES_BASE_URL}/harness-doctor/<rule>` (see `buildRuleDocsUrl`).
 *
 * No surviving rule family ships a published recipe page today — the
 * docs-structure and supply-chain checks carry their full fix guidance
 * inline in the diagnostic `help` text, and dead-code (`knip`)
 * findings never had recipes. Advertising "fetch the fix recipe" would
 * send agents to a 404, so this stays `false` until recipe pages exist.
 */
export const hasPublishedFixRecipe = (_diagnostic: Pick<Diagnostic, "plugin" | "rule">): boolean =>
  false;
