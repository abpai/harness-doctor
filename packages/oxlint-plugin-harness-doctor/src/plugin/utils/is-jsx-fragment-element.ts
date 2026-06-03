import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::is_jsx_fragment`. Returns true when a
// JSXOpeningElement is `<Fragment>` or `<React.Fragment>`. The shorthand
// `<>...</>` syntax is a separate AST node (`JSXFragment`) and is not
// covered here.
export const isJsxFragmentElement = (node: EsTreeNode): boolean => {
  if (!isNodeOfType(node, "JSXOpeningElement")) return false;
  const elementName = node.name;

  if (isNodeOfType(elementName, "JSXIdentifier")) return elementName.name === "Fragment";

  if (isNodeOfType(elementName, "JSXMemberExpression")) {
    if (!isNodeOfType(elementName.object, "JSXIdentifier")) return false;
    if (elementName.object.name !== "React") return false;
    return elementName.property.name === "Fragment";
  }

  return false;
};
