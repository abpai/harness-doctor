import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Port of `oxc_linter::utils::react::get_string_literal_prop_value`.
// Returns the string value of a `JSXAttribute`'s value when that value is
// a plain string literal (`name="foo"`). Returns null for boolean
// shorthand attrs (`disabled`), expression containers, or no value.
export const getJsxPropStringValue = (
  attribute: EsTreeNodeOfType<"JSXAttribute">,
): string | null => {
  const value = attribute.value;
  if (!value) return null;
  if (isNodeOfType(value, "Literal") && typeof value.value === "string") return value.value;
  return null;
};
