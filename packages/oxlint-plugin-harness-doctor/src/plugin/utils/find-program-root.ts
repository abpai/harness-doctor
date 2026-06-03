import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { isNodeOfType } from "./is-node-of-type.js";

/**
 * Walks up the AST `parent` chain from `node` to its enclosing
 * `Program` root and returns it; `null` when the chain doesn't lead
 * to a `Program` (e.g. detached fragments used by test utilities).
 *
 * Was duplicated byte-identical across seven sites (five rule files
 * + two utility modules). Promoted to a shared helper so adding a
 * new ESTree top-level shape only touches one place.
 */
export const findProgramRoot = (node: EsTreeNode): EsTreeNodeOfType<"Program"> | null => {
  let cursor: EsTreeNode | null | undefined = node;
  while (cursor) {
    if (isNodeOfType(cursor, "Program")) return cursor;
    cursor = cursor.parent ?? null;
  }
  return null;
};
