import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::ast_util::get_outer_member_expression`. Walks down a
// chain of nested `MemberExpression`s (`a.b.c.d`) and returns the deepest
// member expression — i.e. the `a.b` segment whose `.object` is no longer
// itself a `MemberExpression`. Returns `null` if `node` isn't a member
// expression at all, or if the chain bottoms out at something else.
export const getOuterMemberExpression = (
  node: EsTreeNode,
): EsTreeNodeOfType<"MemberExpression"> | null => {
  let current = node;
  while (
    isNodeOfType(current, "MemberExpression") &&
    isNodeOfType(current.object, "MemberExpression")
  ) {
    current = current.object;
  }
  if (!isNodeOfType(current, "MemberExpression")) return null;
  return current;
};
