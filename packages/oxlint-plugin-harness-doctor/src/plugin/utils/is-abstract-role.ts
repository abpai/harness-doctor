import { ABSTRACT_ROLES } from "../constants/aria-roles.js";
import { HTML_TAGS } from "../constants/html-tags.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getElementType } from "./get-element-type.js";
import { getJsxPropStringValue } from "./get-jsx-prop-string-value.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";

// Port of `oxc_linter::utils::react::is_abstract_role`. Returns true
// when the element is an HTML tag whose `role` attribute is an
// abstract WAI-ARIA role.
export const isAbstractRole = (
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
  settings: Readonly<Record<string, unknown>> | undefined,
): boolean => {
  const elementType = getElementType(openingElement, settings);
  if (!HTML_TAGS.has(elementType)) return false;
  const roleAttribute = hasJsxPropIgnoreCase(openingElement.attributes, "role");
  if (!roleAttribute) return false;
  const value = getJsxPropStringValue(roleAttribute);
  return value !== null && ABSTRACT_ROLES.has(value);
};
