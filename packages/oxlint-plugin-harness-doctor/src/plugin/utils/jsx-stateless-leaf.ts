import type { EsTreeNode } from "./es-tree-node.js";
import { isNodeOfType } from "./is-node-of-type.js";

// Pure-presentational SVG primitives — no DOM state, no event-bound
// identity. Reorder hazards (e.g. index keys) don't apply because
// there's nothing to "lose" if React maps the wrong index to the
// wrong element; the attributes get re-diffed regardless.
export const PURE_SVG_PRIMITIVE_TAGS: ReadonlySet<string> = new Set([
  "circle",
  "ellipse",
  "g",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "stop",
  "text",
  "tspan",
  "defs",
  "use",
  "mask",
  "marker",
  "linearGradient",
  "radialGradient",
  "clipPath",
  "filter",
  "feGaussianBlur",
  "feOffset",
  "feMerge",
  "feMergeNode",
  "feColorMatrix",
  "feFlood",
  "feComposite",
  "title",
  "desc",
]);

// Plain-display HTML elements with no DOM-managed state. Reorder
// hazards only matter when their CHILDREN have state — see
// `containsStatefulDescendant` below.
export const STATELESS_HTML_LEAF_TAGS: ReadonlySet<string> = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "footer",
  "section",
  "article",
  "aside",
  "main",
  "nav",
  "li",
  "ul",
  "ol",
  "dl",
  "dt",
  "dd",
  "tr",
  "td",
  "th",
  "tbody",
  "thead",
  "tfoot",
  "table",
  "caption",
  "colgroup",
  "col",
  "strong",
  "em",
  "small",
  "b",
  "i",
  "u",
  "s",
  "mark",
  "del",
  "ins",
  "sub",
  "sup",
  "abbr",
  "cite",
  "code",
  "kbd",
  "samp",
  "pre",
  "blockquote",
  "q",
  "br",
  "hr",
  "wbr",
  "img",
  "picture",
  "figure",
  "figcaption",
  "label",
  "legend",
  "fieldset",
  "address",
  "time",
  "data",
  "var",
  "ruby",
  "rt",
  "rp",
  "bdi",
  "bdo",
]);

// HTML elements that manage DOM state (selection / focus / scroll /
// playback / interactive identity). Reordering with an index key
// corrupts that state.
const STATEFUL_HTML_DESCENDANT_TAGS: ReadonlySet<string> = new Set([
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "button",
  "form",
  "output",
  "progress",
  "meter",
  "video",
  "audio",
  "source",
  "track",
  "iframe",
  "embed",
  "object",
  "a",
  "details",
  "summary",
  "dialog",
  "canvas",
]);

const STATEFUL_DESCENDANT_SCAN_BUDGET = 200;

// Walks the JSXElement subtree looking for stateful descendants —
// form controls, media, interactive containers, custom (PascalCase)
// components, or unknown function-call/identifier-yielding children.
// Returns true (conservative) when any are found.
export const containsStatefulDescendant = (jsxElement: EsTreeNode): boolean => {
  let budget = STATEFUL_DESCENDANT_SCAN_BUDGET;
  const stack: Array<EsTreeNode> = [jsxElement];
  while (stack.length > 0) {
    if (budget <= 0) return true; // Bail-out: assume stateful.
    budget -= 1;
    const node = stack.pop()!;
    if (isNodeOfType(node, "JSXElement")) {
      const opening = (node as { openingElement: EsTreeNode }).openingElement;
      const name = (opening as { name?: EsTreeNode }).name;
      if (name && isNodeOfType(name, "JSXIdentifier")) {
        const tagName = name.name;
        const firstChar = tagName.charCodeAt(0);
        const isUppercase = firstChar >= 65 && firstChar <= 90;
        // PascalCase custom component — unknown state, treat as stateful.
        if (isUppercase) return true;
        if (STATEFUL_HTML_DESCENDANT_TAGS.has(tagName)) return true;
      }
      // Member-expression JSX (e.g. `<Foo.Bar />`) — custom; stateful.
      if (name && isNodeOfType(name, "JSXMemberExpression")) return true;
      const children = (node as { children?: ReadonlyArray<EsTreeNode> }).children ?? [];
      for (const child of children) stack.push(child);
      continue;
    }
    if (isNodeOfType(node, "JSXFragment")) {
      const children = (node as { children?: ReadonlyArray<EsTreeNode> }).children ?? [];
      for (const child of children) stack.push(child);
      continue;
    }
    if (isNodeOfType(node, "JSXExpressionContainer")) {
      const expression = node.expression as EsTreeNode;
      // Function-call children (`{renderX(...)}`, `{items.map(...)}`,
      // `{children}`) are unknown — assume stateful.
      if (
        isNodeOfType(expression, "CallExpression") ||
        isNodeOfType(expression, "Identifier") ||
        isNodeOfType(expression, "MemberExpression")
      ) {
        return true;
      }
      stack.push(expression);
      continue;
    }
    if (isNodeOfType(node, "ConditionalExpression")) {
      stack.push(node.consequent as EsTreeNode, node.alternate as EsTreeNode);
      continue;
    }
    if (isNodeOfType(node, "LogicalExpression")) {
      stack.push(node.left as EsTreeNode, node.right as EsTreeNode);
      continue;
    }
    // JSXText / Literal — pure content, never stateful.
  }
  return false;
};
