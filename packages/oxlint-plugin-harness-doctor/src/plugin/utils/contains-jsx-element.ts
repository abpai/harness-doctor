import type { EsTreeNode } from "./es-tree-node.js";
import { isAstNode } from "./is-ast-node.js";

/**
 * True when `root` or any descendant in its subtree is a `JSXElement`
 * or `JSXFragment`. Walks the AST without `parent` traversal.
 *
 * Used by `prefer-function-component` and `jsx-filename-extension`
 * to recognise component bodies that render JSX. The richer variants
 * in `display-name.ts` (which also recognises `createElement(...)`
 * calls) and `no-multi-comp.ts` (which additionally stops at nested
 * function / class boundaries) layer extra predicates on top of this
 * base scan — they keep their own implementations because the
 * augmentation isn't easily expressible as a composition.
 */
export const containsJsxElement = (root: EsTreeNode): boolean => {
  let found = false;
  const visit = (node: EsTreeNode): void => {
    if (found) return;
    if (node.type === "JSXElement" || node.type === "JSXFragment") {
      found = true;
      return;
    }
    const nodeRecord = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(nodeRecord)) {
      if (key === "parent") continue;
      const child = nodeRecord[key];
      if (Array.isArray(child)) {
        for (const item of child) if (isAstNode(item)) visit(item);
      } else if (isAstNode(child)) {
        visit(child);
      }
      if (found) return;
    }
  };
  visit(root);
  return found;
};
