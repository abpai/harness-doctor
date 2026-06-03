import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getJsxAttributeName } from "./get-jsx-attribute-name.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::has_jsx_prop`. Searches a JSX
// opening element's `attributes` for a `JSXAttribute` whose name matches
// `targetProp` exactly (case-sensitive). Returns the attribute node or
// undefined. Spread attributes are skipped.
export const hasJsxProp = (
  attributes: ReadonlyArray<EsTreeNode>,
  targetProp: string,
): EsTreeNodeOfType<"JSXAttribute"> | undefined => {
  for (const attribute of attributes) {
    if (!isNodeOfType(attribute, "JSXAttribute")) continue;
    if (getJsxAttributeName(attribute.name) === targetProp) return attribute;
  }
  return undefined;
};
