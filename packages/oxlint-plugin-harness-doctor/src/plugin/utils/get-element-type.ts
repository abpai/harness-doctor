import type { EsTreeNode } from "./es-tree-node.js";
import type { EsTreeNodeOfType } from "./es-tree-node-of-type.js";
import { getJsxPropStringValue } from "./get-jsx-prop-string-value.js";
import { hasJsxPropIgnoreCase } from "./has-jsx-prop-ignore-case.js";
import { isNodeOfType } from "./is-node-of-type.js";

interface JsxA11ySettings {
  components?: Readonly<Record<string, string>>;
  polymorphicPropName?: string;
}

const readJsxA11ySettings = (
  settings: Readonly<Record<string, unknown>> | undefined,
): JsxA11ySettings => {
  if (!settings) return {};
  const block = (settings as { ["jsx-a11y"]?: JsxA11ySettings })["jsx-a11y"];
  if (!block || typeof block !== "object") return {};
  return block;
};

const flattenJsxName = (name: EsTreeNode): string => {
  if (isNodeOfType(name, "JSXIdentifier")) return name.name;
  if (isNodeOfType(name, "JSXMemberExpression")) {
    const obj = flattenJsxName(name.object);
    return `${obj}.${name.property.name}`;
  }
  if (isNodeOfType(name, "JSXNamespacedName")) {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return "";
};

// Resolves a JSX opening element to the (possibly-aliased) HTML tag
// name. Mirrors oxc_linter::utils::react::get_element_type.
//
// - Honors `settings["jsx-a11y"].polymorphicPropName` (defaults to
//   none): when the element has that prop with a string-literal
//   value, the value overrides the element's tag.
// - Honors `settings["jsx-a11y"].components`: a mapping from
//   component name → resolved tag (e.g. `{ Button: "button" }`).
// - Falls back to the JSX identifier / member-expression name.
export const getElementType = (
  openingElement: EsTreeNodeOfType<"JSXOpeningElement">,
  settings: Readonly<Record<string, unknown>> | undefined,
): string => {
  const a11ySettings = readJsxA11ySettings(settings);
  const baseName = flattenJsxName(openingElement.name as EsTreeNode);

  if (a11ySettings.polymorphicPropName) {
    const polymorphicAttribute = hasJsxPropIgnoreCase(
      openingElement.attributes,
      a11ySettings.polymorphicPropName,
    );
    if (polymorphicAttribute) {
      const polymorphicValue = getJsxPropStringValue(polymorphicAttribute);
      if (polymorphicValue !== null) return polymorphicValue;
    }
  }

  if (a11ySettings.components && baseName in a11ySettings.components) {
    return a11ySettings.components[baseName]!;
  }
  return baseName;
};
