import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { isNodeOfType } from "./is-node-of-type.js";

/**
 * True when a JSX opening element carries a `key={...}` attribute.
 * Used by `jsx-key` and `jsx-no-useless-fragment` — both rules need to
 * see through fragment wrappers that exist only to hold a key.
 *
 * Was duplicated in both rule files; consolidated here so adding
 * variants (e.g. spread-attribute handling) propagates to both.
 */
export const hasJsxKeyAttribute = (
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
): boolean => {
  for (const attribute of openingElement.attributes) {
    if (!isNodeOfType(attribute, "JSXAttribute")) continue;
    if (!isNodeOfType(attribute.name, "JSXIdentifier")) continue;
    if (attribute.name.name === "key") return true;
  }
  return false;
};
