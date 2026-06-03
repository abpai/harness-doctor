import type { EsTreeNode } from "./es-tree-node.js";
import { isAstNode } from "./is-ast-node.js";
import { isFunctionLike } from "./is-function-like.js";

// HACK: variant of `walkAst` that descends through control-flow blocks
// (IfStatement / TryStatement / SwitchCase / loops / labels) but stops
// at any nested function boundary. Used by rules that ask "what runs
// SYNCHRONOUSLY inside this effect's body?" - counts the
// `if (cond) setX(...)` write but ignores the deferred
// `setTimeout(() => setX(...))` one.
//
// Unlike `walkAst`, this one does not support pruning via `false`
// return - descent is always complete except at function boundaries.
export const walkInsideStatementBlocks = (
  node: EsTreeNode,
  visitor: (child: EsTreeNode) => void,
): void => {
  if (!node || typeof node !== "object") return;
  if (isFunctionLike(node)) return;
  visitor(node);
  const nodeRecord = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(nodeRecord)) {
    if (key === "parent") continue;
    const child = nodeRecord[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isAstNode(item)) walkInsideStatementBlocks(item, visitor);
      }
    } else if (isAstNode(child)) {
      walkInsideStatementBlocks(child, visitor);
    }
  }
};
