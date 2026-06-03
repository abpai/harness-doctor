import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::get_jsx_attribute_name`. Stringifies
// a JSXAttribute's `name` field — `JSXIdentifier` becomes the literal
// name (`className`), `JSXNamespacedName` becomes `<ns>:<name>` (e.g.
// `xlink:href`). Returns `null` for unrecognized shapes.
export const getJsxAttributeName = (node: EsTreeNode): string | null => {
  if (isNodeOfType(node, "JSXIdentifier")) return node.name;
  if (isNodeOfType(node, "JSXNamespacedName")) {
    return `${node.namespace.name}:${node.name.name}`;
  }
  return null;
};
