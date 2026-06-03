import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Mirrors `Expression::without_parentheses().get_inner_expression()` —
// peels TS type assertions and parens off so visitor logic operates on
// the semantic expression. ESTree from oxc-parser surfaces those wrappers
// as `TSAsExpression`, `TSSatisfiesExpression`, `TSTypeAssertion`,
// `TSNonNullExpression`, etc.; strip them all.
const TS_WRAPPER_TYPES = new Set<string>([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
  "TSInstantiationExpression",
]);

export const stripParenExpression = (node: EsTreeNode): EsTreeNode => {
  let current = node;
  while (true) {
    if (TS_WRAPPER_TYPES.has(current.type) && "expression" in current && current.expression) {
      current = current.expression as EsTreeNode;
      continue;
    }
    if (isNodeOfType(current, "ChainExpression") && current.expression) {
      current = current.expression as unknown as EsTreeNode;
      continue;
    }
    break;
  }
  return current;
};
