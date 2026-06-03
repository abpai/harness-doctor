import { PRESENTATION_ROLES } from "../constants/aria-roles.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getJsxPropStringValue } from "./get-jsx-prop-string-value.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";

// Port of `oxc_linter::utils::react::is_presentation_role`.
export const isPresentationRole = (
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
): boolean => {
  const roleAttribute = hasJsxPropIgnoreCase(openingElement.attributes, "role");
  if (!roleAttribute) return false;
  const value = getJsxPropStringValue(roleAttribute);
  return value !== null && PRESENTATION_ROLES.has(value);
};
