import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { isNodeOfType } from "./is-node-of-type.js";

/**
 * Type-guard for the two "inline function expression" ESTree forms:
 * `FunctionExpression` and `ArrowFunctionExpression`. Differs from
 * the canonical `isFunctionLike` (utils/is-function-like.ts) which
 * ALSO matches `FunctionDeclaration` — declarations only appear as
 * statements, so when callers check positions that can only hold
 * expressions (a `VariableDeclarator.init`, a `CallExpression`
 * argument, a JSX prop value, an event-handler value), the narrower
 * predicate is correct.
 *
 * Was previously inlined as a 2-type triplet in many rule files;
 * this canonical helper lets them all share one type guard.
 */
export const isInlineFunctionExpression = (
  node: EsTreeNode | null | undefined,
): node is EsTreeNodeOfType<"ArrowFunctionExpression"> | EsTreeNodeOfType<"FunctionExpression"> =>
  Boolean(
    node &&
    (isNodeOfType(node, "ArrowFunctionExpression") || isNodeOfType(node, "FunctionExpression")),
  );
