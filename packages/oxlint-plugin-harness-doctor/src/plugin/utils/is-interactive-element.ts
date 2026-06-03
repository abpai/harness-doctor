import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getJsxPropStringValue } from "./get-jsx-prop-string-value.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";

// Returns true iff `tagName` is an HTML element that's interactive in
// the rendered DOM. Mirrors
// oxc_linter::utils::react::is_interactive_element.
//
// Always-interactive: audio, button, canvas, datalist, embed,
// menuitem, option, select, summary, td, th, tr, textarea, video.
// Conditional:
//   - input: interactive UNLESS type="hidden"
//   - a, area: interactive only when href is present
//   - img: interactive only when usemap is present.
export const isInteractiveElement = (
  tagName: string,
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
): boolean => {
  switch (tagName) {
    case "audio":
    case "button":
    case "canvas":
    case "datalist":
    case "embed":
    case "menuitem":
    case "option":
    case "select":
    case "summary":
    case "td":
    case "th":
    case "tr":
    case "textarea":
    case "video":
      return true;
    case "input": {
      const typeAttribute = hasJsxPropIgnoreCase(openingElement.attributes, "type");
      if (typeAttribute) {
        const typeValue = getJsxPropStringValue(typeAttribute);
        if (typeValue && typeValue.toLowerCase() === "hidden") return false;
      }
      return true;
    }
    case "a":
    case "area":
      return hasJsxPropIgnoreCase(openingElement.attributes, "href") !== undefined;
    case "img":
      return hasJsxPropIgnoreCase(openingElement.attributes, "usemap") !== undefined;
    default:
      return false;
  }
};
