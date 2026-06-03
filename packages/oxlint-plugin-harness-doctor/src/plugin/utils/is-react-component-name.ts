// Port of `oxc_linter::utils::react::is_react_component_name`. React
// component names always start with an ASCII uppercase letter (so `Foo`,
// `MyComponent` count; `myComponent`, `useState`, `_Foo` don't).
export const isReactComponentName = (name: string): boolean => {
  if (name.length === 0) return false;
  const firstCharacter = name.charCodeAt(0);
  return firstCharacter >= 65 && firstCharacter <= 90;
};
