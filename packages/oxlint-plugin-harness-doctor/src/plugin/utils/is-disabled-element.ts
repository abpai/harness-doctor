import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::is_disabled_element`. Returns
// true when the element has a `disabled` attribute (any value) or a
// statically-`true` `aria-disabled`.
export const isDisabledElement = (
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
): boolean => {
  if (hasJsxPropIgnoreCase(openingElement.attributes, "disabled")) return true;
  const ariaDisabled = hasJsxPropIgnoreCase(openingElement.attributes, "aria-disabled");
  if (!ariaDisabled) return false;
  const value = ariaDisabled.value as EsTreeNode | null | undefined;
  if (!value) return false;
  if (isNodeOfType(value, "Literal") && value.value === "true") return true;
  if (isNodeOfType(value, "JSXExpressionContainer")) {
    const expression = value.expression;
    if (isNodeOfType(expression, "Literal") && expression.value === true) return true;
  }
  return false;
};
