import type { EsTreeNode } from "./es-tree-node.js";

/**
 * True when `inner` is `outer` itself or any descendant in the AST
 * `parent` chain. Walks `inner.parent` upward and stops at either a
 * match (`true`) or the chain's root (`false`).
 *
 * Was duplicated byte-identical in:
 * - exhaustive-deps-symbol-stability.ts
 * - semantic/closure-captures.ts
 */
export const isAstDescendant = (inner: EsTreeNode, outer: EsTreeNode): boolean => {
  let current: EsTreeNode | null | undefined = inner;
  while (current) {
    if (current === outer) return true;
    current = current.parent ?? null;
  }
  return false;
};
