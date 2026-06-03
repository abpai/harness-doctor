// True for prop names that conventionally signal the consumer opted
// into the controlled-init / "seed only" pattern: `initialValue`,
// `defaultValue`, `seedColor`, `startingState`, `baselineX`,
// `presetTheme`, etc. These props are deliberately one-shot — flagging
// `useState(initialValue)` or `useEffect(() => setX(initialValue),
// [initialValue])` as "derived state" is unactionable: the consumer
// explicitly named the prop "initial" / "default" / "seed" to signal
// that this is the canonical "reset child state when caller passes a
// new initial" idiom.
export const isInitialOnlyPropName = (propName: string): boolean => {
  if (propName === "initialValue" || propName === "defaultValue" || propName === "seedValue") {
    return true;
  }
  return (
    /^initial[A-Z]/.test(propName) ||
    /^default[A-Z]/.test(propName) ||
    /^seed[A-Z]/.test(propName) ||
    /^starting[A-Z]/.test(propName) ||
    /^baseline[A-Z]/.test(propName) ||
    /^preset[A-Z]/.test(propName)
  );
};
