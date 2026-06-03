import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

/**
 * True when the node is an `ArrayExpression` whose elements are all
 * primitive literals (string / number / boolean). Used by the two
 * "no array-index key" rule variants to detect a `keys={[1, 2, 3]}`
 * style stable-id array.
 */
export const isAllLiteralArrayExpression = (node: EsTreeNode): boolean => {
  if (!isNodeOfType(node, "ArrayExpression")) return false;
  const elements = node.elements ?? [];
  if (elements.length < 1) return false;
  for (const element of elements) {
    if (!element) return false;
    if (!isNodeOfType(element, "Literal")) return false;
    const value = element.value;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      return false;
    }
  }
  return true;
};
