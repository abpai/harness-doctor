import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

/**
 * Flattens a JSX opener / member-expression chain into a dotted name.
 *
 *   `<Foo />`           → `"Foo"`
 *   `<Namespace.Foo />` → `"Namespace.Foo"`
 *   `<a.b.c />`         → `"a.b.c"`
 *
 * Returns `null` when the chain root isn't a `JSXIdentifier` (e.g.
 * the rare-but-valid `<this.x />` case, which JSX surfaces as a
 * `JSXThisExpression` root).
 *
 * Used by `forbid-elements` and `jsx-props-no-spreading`. Two other
 * rules (`forbid-component-props`, `utils/get-element-type`) keep
 * their own extended variants because they handle additional node
 * types (ThisExpression / JSXNamespacedName) and return a non-
 * nullable string with a sentinel value — semantically distinct.
 */
export const flattenJsxName = (node: EsTreeNode): string | null => {
  if (isNodeOfType(node, "JSXIdentifier")) return node.name;
  if (isNodeOfType(node, "JSXMemberExpression")) {
    const objectName = flattenJsxName(node.object);
    if (!objectName) return null;
    return `${objectName}.${node.property.name}`;
  }
  return null;
};
