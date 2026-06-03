import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getElementType } from "./get-element-type.js";
import { getJsxPropStringValue } from "./get-jsx-prop-string-value.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Returns true iff the JSX element is hidden from assistive
// technology — covered cases:
//   - <input type="hidden" />
//   - aria-hidden (no value, "true", or truthy expression)
//
// Mirrors oxc_linter::utils::react::is_hidden_from_screen_reader.
export const isHiddenFromScreenReader = (
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
  settings: Readonly<Record<string, unknown>> | undefined,
): boolean => {
  const tag = getElementType(openingElement, settings);
  if (tag.toLowerCase() === "input") {
    const typeAttribute = hasJsxPropIgnoreCase(openingElement.attributes, "type");
    if (typeAttribute) {
      const typeValue = getJsxPropStringValue(typeAttribute);
      if (typeValue && typeValue.toLowerCase() === "hidden") return true;
    }
  }

  const ariaHidden = hasJsxPropIgnoreCase(openingElement.attributes, "aria-hidden");
  if (!ariaHidden) return false;
  // Bare attribute (no value) → treated as `aria-hidden="true"`.
  const value = ariaHidden.value;
  if (!value) return true;
  if (isNodeOfType(value, "Literal") && typeof value.value === "string") {
    return value.value === "true";
  }
  if (isNodeOfType(value, "JSXExpressionContainer")) {
    const expression = value.expression;
    if (isNodeOfType(expression, "Literal")) {
      return Boolean(expression.value);
    }
    if (isNodeOfType(expression, "Identifier") && expression.name === "true") {
      return true;
    }
  }
  return false;
};
