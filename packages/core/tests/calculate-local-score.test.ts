import { describe, expect, it } from "vite-plus/test";
import { calculateLocalScore } from "@harness-doctor/core";
import type { Diagnostic } from "@harness-doctor/core";

const makeDiagnostic = (severity: Diagnostic["severity"], rule: string): Diagnostic => ({
  filePath: "src/App.tsx",
  plugin: "harness-doctor",
  rule,
  severity,
  message: "Example",
  help: "",
  line: 1,
  column: 1,
  category: "Maintainability",
});

describe("calculateLocalScore", () => {
  it("returns a perfect Excellent score for an empty diagnostic set", () => {
    const result = calculateLocalScore([], 100);
    expect(result).toEqual({ score: 100, label: "Excellent" });
  });

  it("deducts 2 per error and 1 per warning (one error + one warning => 97)", () => {
    const diagnostics = [makeDiagnostic("error", "a"), makeDiagnostic("warning", "b")];
    const result = calculateLocalScore(diagnostics, 10);
    expect(result.score).toBe(97);
    expect(result.label).toBe("Good");
  });

  it("clamps the score to 0 when penalties exceed the perfect score", () => {
    const diagnostics = Array.from({ length: 60 }, (_, index) =>
      makeDiagnostic("error", `rule-${index}`),
    );
    const result = calculateLocalScore(diagnostics, 5);
    expect(result.score).toBe(0);
    expect(result.label).toBe("At risk");
  });

  it("is deterministic for a fixed diagnostic set regardless of source file count", () => {
    const diagnostics = [makeDiagnostic("warning", "a"), makeDiagnostic("warning", "b")];
    expect(calculateLocalScore(diagnostics, 1)).toEqual(calculateLocalScore(diagnostics, 9999));
  });
});
