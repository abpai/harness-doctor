import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getJsxAttributeName } from "./get-jsx-attribute-name.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::has_jsx_prop_ignore_case`. Same as
// `hasJsxProp` but case-insensitive — used by jsx-a11y-style rules where
// the HTML attribute may legally appear in any casing.
export const hasJsxPropIgnoreCase = (
  attributes: ReadonlyArray<EsTreeNode>,
  targetProp: string,
): EsTreeNodeOfType<"JSXAttribute"> | undefined => {
  const targetLower = targetProp.toLowerCase();
  for (const attribute of attributes) {
    if (!isNodeOfType(attribute, "JSXAttribute")) continue;
    const name = getJsxAttributeName(attribute.name);
    if (name && name.toLowerCase() === targetLower) return attribute;
  }
  return undefined;
};
