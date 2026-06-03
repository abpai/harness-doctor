import { describe, expect, it } from "vite-plus/test";
import type { Diagnostic, HarnessDoctorConfig } from "@harness-doctor/core";
import { createNodeReadFileLinesSync, mergeAndFilterDiagnostics } from "@harness-doctor/core";

const SEVERITY_TEST_ROOT = "/tmp/severity-controls";
const noopReadFileLines = createNodeReadFileLinesSync(SEVERITY_TEST_ROOT);

// Severity controls are exercised through the unified pipeline now.
// The legacy `applySeverityControls(diagnostics, config)` helper is
// gone — the same surface is reachable via `mergeAndFilterDiagnostics`
// with inline disables off (severity overrides run before
// suppressions, so the inline-disable flag doesn't affect the result).
const applySeverityControls = (
  diagnostics: Diagnostic[],
  config: HarnessDoctorConfig | null,
): Diagnostic[] =>
  mergeAndFilterDiagnostics(diagnostics, SEVERITY_TEST_ROOT, config, noopReadFileLines, {
    respectInlineDisables: false,
    warnings: true,
  });

const designDiagnostic: Diagnostic = {
  filePath: "src/App.tsx",
  plugin: "harness-doctor",
  rule: "design-no-redundant-size-axes",
  severity: "warning",
  message: "w-5 h-5 → size-5",
  help: "",
  line: 12,
  column: 4,
  category: "Architecture",
};

const rnDiagnostic: Diagnostic = {
  filePath: "src/Screen.tsx",
  plugin: "harness-doctor",
  rule: "rn-no-raw-text",
  severity: "error",
  message: "raw text outside <Text>",
  help: "",
  line: 4,
  column: 2,
  category: "React Native",
};

const externalPluginDiagnostic: Diagnostic = {
  filePath: "src/Form.tsx",
  plugin: "react",
  rule: "no-danger",
  severity: "warning",
  message: "Avoid dangerouslySetInnerHTML",
  help: "",
  line: 5,
  column: 2,
  category: "Security",
};

const nativePortedDiagnostic: Diagnostic = {
  ...externalPluginDiagnostic,
  plugin: "harness-doctor",
  rule: "no-danger",
};

describe("severity controls (via mergeAndFilterDiagnostics)", () => {
  it("returns input unchanged when no top-level severity fields are configured", () => {
    const diagnostics = [designDiagnostic, rnDiagnostic];
    expect(applySeverityControls(diagnostics, null)).toEqual(diagnostics);
    expect(applySeverityControls(diagnostics, {})).toEqual(diagnostics);
  });

  it('drops diagnostics whose category is set to "off" via top-level `categories`', () => {
    const config: HarnessDoctorConfig = { categories: { "React Native": "off" } };
    const filtered = applySeverityControls([designDiagnostic, rnDiagnostic], config);
    expect(filtered).toEqual([designDiagnostic]);
  });

  it('drops diagnostics whose rule is set to "off" via top-level `rules`', () => {
    const config: HarnessDoctorConfig = {
      rules: { "harness-doctor/design-no-redundant-size-axes": "off" },
    };
    const filtered = applySeverityControls([designDiagnostic, rnDiagnostic], config);
    expect(filtered).toEqual([rnDiagnostic]);
  });

  it("re-stamps severity for matching rules via top-level `rules` (ESLint shape)", () => {
    const config: HarnessDoctorConfig = {
      rules: { "harness-doctor/rn-no-raw-text": "warn" },
    };
    const filtered = applySeverityControls([rnDiagnostic], config);
    expect(filtered).toEqual([{ ...rnDiagnostic, severity: "warning" }]);
  });

  it("works on external-plugin diagnostics via rule key", () => {
    const config: HarnessDoctorConfig = {
      rules: { "react/no-danger": "off" },
    };
    expect(applySeverityControls([externalPluginDiagnostic], config)).toEqual([]);
  });

  // The boilerplate ships no legacy rule-key aliases, so matching is identity
  // only: a `react/`-prefixed override no longer reaches a `harness-doctor/`
  // diagnostic (and vice-versa). Integrators opt back into aliasing by adding
  // entries to `rule-key-aliases.ts`.
  it("does not alias a different-plugin rule key onto a native diagnostic", () => {
    const config: HarnessDoctorConfig = {
      rules: { "react/no-danger": "off" },
    };
    expect(applySeverityControls([nativePortedDiagnostic], config)).toEqual([
      nativePortedDiagnostic,
    ]);
  });

  it("does not alias a native rule key onto a different-plugin diagnostic", () => {
    const config: HarnessDoctorConfig = {
      rules: { "harness-doctor/no-danger": "off" },
    };
    expect(applySeverityControls([externalPluginDiagnostic], config)).toEqual([
      externalPluginDiagnostic,
    ]);
  });

  it("promotes warning to error via top-level `categories`", () => {
    const config: HarnessDoctorConfig = {
      categories: { Security: "error" },
    };
    const filtered = applySeverityControls([externalPluginDiagnostic], config);
    expect(filtered).toEqual([{ ...externalPluginDiagnostic, severity: "error" }]);
  });

  it("per-rule wins over per-category", () => {
    const config: HarnessDoctorConfig = {
      rules: { "harness-doctor/rn-no-raw-text": "warn" },
      categories: { "React Native": "off" },
    };
    expect(applySeverityControls([rnDiagnostic], config)).toEqual([
      { ...rnDiagnostic, severity: "warning" },
    ]);
  });
});
