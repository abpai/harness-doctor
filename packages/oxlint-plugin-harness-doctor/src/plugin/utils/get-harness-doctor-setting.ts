import type { RuleContext } from "./rule-context.js";

// Reads a typed entry out of the `harness-doctor` settings bag that core
// writes into the oxlint config (see `createOxlintConfig` in
// `@harness-doctor/core`). The helper:
//   - Guards against the settings bag being missing, an array, or `null`.
//   - Use `Object.getOwnPropertyDescriptor` instead of bracket access
//     so that prototype-pollution-style keys (`__proto__`, …) can't
//     leak inherited values into rule logic.
//   - Filter the returned value by its actual runtime type so a
//     malformed payload (e.g. a `number` where a `string[]` belongs)
//     falls back to a safe default rather than crashing the rule.

const readHarnessDoctorSettingsBag = (settings: RuleContext["settings"]): object | null => {
  const harnessDoctorSettings = settings?.["harness-doctor"];
  if (
    typeof harnessDoctorSettings !== "object" ||
    harnessDoctorSettings === null ||
    Array.isArray(harnessDoctorSettings)
  ) {
    return null;
  }
  return harnessDoctorSettings;
};

const readOwnPropertyValue = (bag: object, settingName: string): unknown =>
  Object.getOwnPropertyDescriptor(bag, settingName)?.value;

export const getHarnessDoctorStringSetting = (
  settings: RuleContext["settings"],
  settingName: string,
): string | undefined => {
  const bag = readHarnessDoctorSettingsBag(settings);
  if (!bag) return undefined;
  const settingValue = readOwnPropertyValue(bag, settingName);
  return typeof settingValue === "string" ? settingValue : undefined;
};
