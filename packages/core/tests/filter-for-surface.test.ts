import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_SURFACE_EXCLUDED_TAGS,
  DIAGNOSTIC_SURFACES,
  filterDiagnosticsForSurface,
  isDiagnosticOnSurface,
  isDiagnosticSurface,
} from "@harness-doctor/core";
import type { Diagnostic, HarnessDoctorConfig } from "@harness-doctor/core";

const designDiagnostic: Diagnostic = {
  filePath: "src/App.tsx",
  plugin: "harness-doctor",
  rule: "design-no-redundant-size-axes",
  severity: "warning",
  message: "w-5 h-5 → use the shorthand size-5 (Tailwind v3.4+)",
  help: "",
  line: 12,
  column: 4,
  category: "Architecture",
};

const correctnessDiagnostic: Diagnostic = {
  filePath: "src/Form.tsx",
  plugin: "harness-doctor",
  rule: "no-array-index-as-key",
  severity: "error",
  message: "Array index used as React key",
  help: "",
  line: 18,
  column: 5,
  category: "Correctness",
};

const externalPluginDiagnostic: Diagnostic = {
  filePath: "src/Other.tsx",
  plugin: "react",
  rule: "no-danger",
  severity: "warning",
  message: "Avoid dangerouslySetInnerHTML",
  help: "",
  line: 5,
  column: 2,
  category: "Security",
};

describe("filterDiagnosticsForSurface defaults", () => {
  // The boilerplate ships no rule carrying a default-excluded tag, so by
  // default every diagnostic passes through to every surface. Integrators
  // wire surface defaults via `DEFAULT_SURFACE_EXCLUDED_TAGS` once they tag
  // their own weak-signal rules.
  it("passes untagged diagnostics through to every surface by default", () => {
    const diagnostics = [designDiagnostic, correctnessDiagnostic];
    for (const surface of DIAGNOSTIC_SURFACES) {
      expect(filterDiagnosticsForSurface(diagnostics, surface, null)).toEqual(diagnostics);
    }
  });

  it("does not filter diagnostics from external plugins (no harness-doctor tag metadata to consult)", () => {
    const diagnostics = [externalPluginDiagnostic];
    for (const surface of DIAGNOSTIC_SURFACES) {
      expect(filterDiagnosticsForSurface(diagnostics, surface, null)).toEqual(diagnostics);
    }
  });
});

describe("filterDiagnosticsForSurface — user overrides", () => {
  it("`includeTags` promotes excluded rules back into the surface", () => {
    const config: HarnessDoctorConfig = {
      surfaces: { prComment: { includeTags: ["design"] } },
    };
    const diagnostics = [designDiagnostic, correctnessDiagnostic];
    expect(filterDiagnosticsForSurface(diagnostics, "prComment", config)).toEqual(diagnostics);
  });

  it("`excludeCategories` removes everything in a category from a surface", () => {
    const config: HarnessDoctorConfig = {
      surfaces: { ciFailure: { excludeCategories: ["Correctness"] } },
    };
    const diagnostics = [designDiagnostic, correctnessDiagnostic];
    expect(filterDiagnosticsForSurface(diagnostics, "ciFailure", config)).toEqual([
      designDiagnostic,
    ]);
  });

  it("`excludeRules` strips a specific rule even when its tags are otherwise allowed on CLI", () => {
    const config: HarnessDoctorConfig = {
      surfaces: { cli: { excludeRules: ["harness-doctor/no-array-index-as-key"] } },
    };
    const diagnostics = [designDiagnostic, correctnessDiagnostic];
    expect(filterDiagnosticsForSurface(diagnostics, "cli", config)).toEqual([designDiagnostic]);
  });

  it("`includeRules` overrides excludeTags for a single rule (include wins)", () => {
    const config: HarnessDoctorConfig = {
      surfaces: {
        prComment: {
          includeRules: ["harness-doctor/design-no-redundant-size-axes"],
        },
      },
    };
    expect(isDiagnosticOnSurface(designDiagnostic, "prComment", config)).toBe(true);
  });
});

describe("DiagnosticSurface guards and defaults", () => {
  it("`isDiagnosticSurface` accepts only the four known surface names", () => {
    for (const surface of DIAGNOSTIC_SURFACES) {
      expect(isDiagnosticSurface(surface)).toBe(true);
    }
    expect(isDiagnosticSurface("dashboard")).toBe(false);
    expect(isDiagnosticSurface(42)).toBe(false);
    expect(isDiagnosticSurface(undefined)).toBe(false);
  });

  it("`DEFAULT_SURFACE_EXCLUDED_TAGS` keeps `design` out of every non-CLI surface", () => {
    expect(DEFAULT_SURFACE_EXCLUDED_TAGS.cli).toEqual([]);
    expect(DEFAULT_SURFACE_EXCLUDED_TAGS.prComment).toContain("design");
    expect(DEFAULT_SURFACE_EXCLUDED_TAGS.score).toContain("design");
    expect(DEFAULT_SURFACE_EXCLUDED_TAGS.ciFailure).toContain("design");
  });
});
