import type { EsTreeNode } from "./es-tree-node.js";
import { getCalleeName } from "./get-callee-name.js";
import { isNodeOfType } from "./is-node-of-type.js";

const PRAGMA = "React";

// Port of `oxc_linter::utils::react::is_react_function_call`. Returns true
// when `node` is a `CallExpression` whose callee resolves to either the
// bare identifier `<expectedCall>(...)` or `React.<expectedCall>(...)`. Used
// by the React-pragma-aware rules (`Children.map`, `cloneElement`, etc.).
export const isReactFunctionCall = (node: EsTreeNode, expectedCall: string): boolean => {
  if (!isNodeOfType(node, "CallExpression")) return false;
  const calleeName = getCalleeName(node);
  if (calleeName !== expectedCall) return false;

  if (isNodeOfType(node.callee, "MemberExpression")) {
    return isNodeOfType(node.callee.object, "Identifier") && node.callee.object.name === PRAGMA;
  }
  return true;
};
