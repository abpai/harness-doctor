import { FUNCTION_LIKE_TYPES } from "../constants/js.js";
import type { EsTreeNode } from "./es-tree-node.js";
import { isAstNode } from "./is-ast-node.js";

// Visitor-based approximation of "the function body contains a non-empty
// `return X` somewhere reachable". We don't have a CFG, so instead we
// recursively walk descendants but stop crossing into nested function
// bodies (their `return` statements belong to that inner function, not
// the outer one). For arrow functions with an expression body the body
// IS the return value — those always count. Used by `require-render-return`.
export const functionBodyHasReturnWithValue = (functionNode: EsTreeNode): boolean => {
  if (functionNode.type === "ArrowFunctionExpression" && "body" in functionNode) {
    if (functionNode.body && functionNode.body.type !== "BlockStatement") return true;
  }

  const body = (functionNode as unknown as { body?: EsTreeNode | null }).body;
  if (!body || body.type !== "BlockStatement") return false;

  let didFindReturn = false;
  const visit = (node: EsTreeNode): void => {
    if (didFindReturn) return;
    if (node.type === "ReturnStatement" && "argument" in node && node.argument != null) {
      didFindReturn = true;
      return;
    }
    const nodeRecord = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(nodeRecord)) {
      if (key === "parent") continue;
      const child = nodeRecord[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (!isAstNode(item)) continue;
          if (FUNCTION_LIKE_TYPES.has(item.type)) continue;
          visit(item);
          if (didFindReturn) return;
        }
      } else if (isAstNode(child)) {
        if (FUNCTION_LIKE_TYPES.has(child.type)) continue;
        visit(child);
      }
    }
  };
  visit(body);
  return didFindReturn;
};
