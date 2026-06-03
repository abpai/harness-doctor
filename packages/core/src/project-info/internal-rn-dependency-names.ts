// Project-discovery-side copy of the canonical RN-aware-manifest
// detection rules. Retained for the workspace-discovery capability gate
// (`isPackageJsonReactNativeAware`); the deeper removal of React Native
// detection from `discoverProject`/`ProjectInfo` is a later
// generalization step. Kept local so importing the discovery helpers
// does not pull a larger dependency graph into the bundle.

// Closed set of canonical Expo-managed dependency names — the subset of
// the RN cohort that marks a manifest as an *Expo* app specifically.
const EXPO_MANAGED_NAMES: ReadonlySet<string> = new Set([
  "expo",
  "expo-router",
  "@expo/cli",
  "@expo/metro-config",
  "@expo/metro-runtime",
]);

const NAMES: ReadonlySet<string> = new Set([
  "react-native",
  "react-native-tvos",
  ...EXPO_MANAGED_NAMES,
  "react-native-windows",
  "react-native-macos",
]);

const PREFIXES: ReadonlyArray<string> = ["@react-native/", "@react-native-"];

export const isReactNativeDependencyName = (dependencyName: string): boolean => {
  if (NAMES.has(dependencyName)) return true;
  for (const prefix of PREFIXES) {
    if (dependencyName.startsWith(prefix)) return true;
  }
  return false;
};
