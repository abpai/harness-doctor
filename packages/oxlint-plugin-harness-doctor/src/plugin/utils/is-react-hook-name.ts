// Port of `oxc_linter::utils::react::is_react_hook_name`. Identifies React
// Hook names: must start with `use`, followed by either nothing (the bare
// `use(...)` hook landed in React 19), an uppercase letter, or an ASCII
// digit. Matches ESLint's `/^use[A-Z0-9]/` plus the `use` exact-match.
export const isReactHookName = (name: string): boolean => {
  if (!name.startsWith("use")) return false;
  if (name.length === 3) return true;
  const fourthCharacter = name.charCodeAt(3);
  const isUppercase = fourthCharacter >= 65 && fourthCharacter <= 90;
  const isDigit = fourthCharacter >= 48 && fourthCharacter <= 57;
  return isUppercase || isDigit;
};
