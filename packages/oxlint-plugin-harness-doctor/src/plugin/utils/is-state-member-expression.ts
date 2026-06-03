import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::is_state_member_expression`. Returns
// true when `node` is `this.state` (a `MemberExpression` whose object is
// `ThisExpression` and whose property is the identifier `state`).
export const isStateMemberExpression = (node: EsTreeNode): boolean => {
  if (!isNodeOfType(node, "MemberExpression")) return false;
  if (!isNodeOfType(node.object, "ThisExpression")) return false;
  if (!isNodeOfType(node.property, "Identifier")) return false;
  return node.property.name === "state";
};
