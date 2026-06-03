import harnessDoctorPlugin from "oxlint-plugin-harness-doctor";
import type { Diagnostic } from "../types/index.js";

/**
 * Whether a diagnostic's rule has a published per-rule fix recipe at
 * `${DOCS_RULES_BASE_URL}/harness-doctor/<rule>`
 * (see `buildRuleDocsUrl`).
 *
 * Recipes are generated from harness-doctor's own engine rules, so only
 * those resolve. Dead-code (`deslop`), the synthetic environment and
 * supply-chain checks (`require-reduced-motion`, `require-pnpm-hardening`
 * — `harness-doctor`-namespaced but not engine rules), and adopted
 * third-party plugins (`eslint`, `unicorn`, `react-hooks-js`, …) have no
 * recipe, so advertising "fetch the fix recipe" for them sends agents to
 * a 404. Gate the directive on this predicate.
 */
export const hasPublishedFixRecipe = (diagnostic: Pick<Diagnostic, "plugin" | "rule">): boolean =>
  diagnostic.plugin === "harness-doctor" && Object.hasOwn(harnessDoctorPlugin.rules, diagnostic.rule);
