import type { EsTreeNode } from "./es-tree-node.js";

const FUNCTION_NODE_TYPES = new Set<string>([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "MethodDefinition",
]);

// True when `node` has any function-typed ancestor (i.e. it's not at the
// top-level / module scope). React perf rules use this to skip JSX that
// can't possibly re-render — top-level JSX is created once at module
// load, not per render.
export const isInsideFunctionScope = (node: EsTreeNode): boolean => {
  let ancestor = node.parent;
  while (ancestor) {
    if (FUNCTION_NODE_TYPES.has(ancestor.type)) return true;
    ancestor = ancestor.parent ?? null;
  }
  return false;
};
