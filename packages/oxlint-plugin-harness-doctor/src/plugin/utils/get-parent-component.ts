import type { EsTreeNode } from "./es-tree-node.js";
import { isEs5Component } from "./is-es5-component.js";
import { isEs6Component } from "./is-es6-component.js";

// Port of `oxc_linter::utils::react::get_parent_component`. Walks up
// `node.parent` until it finds an enclosing es5 (`createReactClass`) or
// es6 (`class extends Component`) component. Returns the matching ancestor
// or null.
export const getParentComponent = (node: EsTreeNode): EsTreeNode | null => {
  let ancestor: EsTreeNode | null | undefined = node.parent;
  while (ancestor) {
    if (isEs5Component(ancestor) || isEs6Component(ancestor)) return ancestor;
    ancestor = ancestor.parent ?? null;
  }
  return null;
};
