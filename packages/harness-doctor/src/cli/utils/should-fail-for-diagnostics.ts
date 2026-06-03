import type { Diagnostic, FailOnLevel } from "@harness-doctor/core";

export const shouldFailForDiagnostics = (
  diagnostics: Diagnostic[],
  failOnLevel: FailOnLevel,
): boolean => {
  if (failOnLevel === "none") return false;
  if (failOnLevel === "warning") return diagnostics.length > 0;
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
};
