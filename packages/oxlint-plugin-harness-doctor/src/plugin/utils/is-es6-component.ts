import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

const PRAGMA = "React";
const COMPONENT = "Component";
const PURE_COMPONENT = "PureComponent";

const isReactComponentMemberRef = (node: EsTreeNode): boolean => {
  if (!isNodeOfType(node, "MemberExpression")) return false;
  if (!isNodeOfType(node.object, "Identifier") || node.object.name !== PRAGMA) return false;
  if (!isNodeOfType(node.property, "Identifier")) return false;
  return node.property.name === COMPONENT || node.property.name === PURE_COMPONENT;
};

// Port of `oxc_linter::utils::react::is_es6_component`. Returns true when
// `node` is a `ClassDeclaration` / `ClassExpression` that extends one of:
// `Component`, `PureComponent`, `React.Component`, or `React.PureComponent`.
export const isEs6Component = (node: EsTreeNode): boolean => {
  if (!isNodeOfType(node, "ClassDeclaration") && !isNodeOfType(node, "ClassExpression")) {
    return false;
  }
  const superClass = node.superClass;
  if (!superClass) return false;

  if (isReactComponentMemberRef(superClass)) return true;

  if (isNodeOfType(superClass, "Identifier")) {
    return superClass.name === COMPONENT || superClass.name === PURE_COMPONENT;
  }

  return false;
};
