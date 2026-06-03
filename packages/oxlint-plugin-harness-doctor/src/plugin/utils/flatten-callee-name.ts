import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

/**
 * Flattens a call-expression `callee` AST node into its dotted source
 * string when it's an `Identifier` or a `MemberExpression` chain.
 *
 *   `memo`                  → `"memo"`
 *   `React.memo`            → `"React.memo"`
 *   `a.b.c.memo`            → `"a.b.c.memo"`
 *   `obj[computed]`         → `null` (computed members can't flatten)
 *   `someCall().foo`        → `null` (only Identifier roots flatten)
 *
 * Used by HOC-detection sites (`no-multi-comp`, `exhaustive-deps`,
 * `rules-of-hooks`, `build-same-file-memo-registry`) which were each
 * carrying their own near-identical inlined implementation.
 */
export const flattenCalleeName = (callee: EsTreeNode): string | null => {
  if (isNodeOfType(callee, "Identifier")) return callee.name;
  if (isNodeOfType(callee, "MemberExpression") && !callee.computed) {
    const objectName = flattenCalleeName(callee.object);
    if (!objectName) return null;
    if (isNodeOfType(callee.property, "Identifier")) {
      return `${objectName}.${callee.property.name}`;
    }
  }
  return null;
};
