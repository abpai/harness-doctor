import { HTML_TAGS, NON_INTERACTIVE_ELEMENTS } from "../constants/html-tags.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";

// Port of `oxc_linter::utils::react::is_non_interactive_element`.
// Custom JSX components (non-HTML tags) are NOT considered
// non-interactive — we don't know what DOM element they render to.
export const isNonInteractiveElement = (
  elementType: string,
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
): boolean => {
  if (!HTML_TAGS.has(elementType)) return false;
  // <header> only has banner semantics when it's a direct descendant
  // of <body>; we can't check that here, so always return false.
  if (elementType === "header") return false;
  // <section> has region semantics ONLY when it has an accessible name.
  if (elementType === "section") {
    return Boolean(
      hasJsxPropIgnoreCase(openingElement.attributes, "aria-label") ||
      hasJsxPropIgnoreCase(openingElement.attributes, "aria-labelledby"),
    );
  }
  return NON_INTERACTIVE_ELEMENTS.has(elementType);
};
