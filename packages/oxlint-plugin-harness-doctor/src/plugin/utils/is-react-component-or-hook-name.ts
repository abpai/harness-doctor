import { isReactComponentName } from "./is-react-component-name.js";
import { isReactHookName } from "./is-react-hook-name.js";

// Port of `oxc_linter::utils::react::is_react_component_or_hook_name`.
// True for a string that is EITHER a React component name (`PascalCase`)
// OR a React Hook name (`use*`). Used by `rules-of-hooks` and similar
// rules to decide whether the enclosing function is allowed to call hooks.
export const isReactComponentOrHookName = (name: string): boolean =>
  isReactComponentName(name) || isReactHookName(name);
