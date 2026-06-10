import { describe, expect, it } from "vite-plus/test";
import {
  AmbiguousProject,
  ConfigParseFailed,
  DeadCodeAnalysisFailed,
  formatHarnessDoctorError,
  isHarnessDoctorError,
  ProjectNotFound,
  HarnessDoctorError,
} from "@harness-doctor/core";

describe("HarnessDoctorError leaves", () => {
  it("ConfigParseFailed names the path + cause", () => {
    const error = new HarnessDoctorError({
      reason: new ConfigParseFailed({
        path: "/repo/harness-doctor.config.json",
        cause: new SyntaxError("Unexpected token }"),
      }),
    });
    expect(formatHarnessDoctorError(error)).toContain("/repo/harness-doctor.config.json");
    expect(formatHarnessDoctorError(error)).toContain("Unexpected token }");
  });

  it("ProjectNotFound names the directory", () => {
    const error = new HarnessDoctorError({
      reason: new ProjectNotFound({ directory: "/repo/apps/web" }),
    });
    expect(formatHarnessDoctorError(error)).toBe("Could not find a project at /repo/apps/web");
  });

  it("AmbiguousProject lists the candidates", () => {
    const error = new HarnessDoctorError({
      reason: new AmbiguousProject({
        directory: "/repo",
        candidates: ["apps/web", "apps/admin"],
      }),
    });
    expect(formatHarnessDoctorError(error)).toBe(
      "Ambiguous project at /repo: found 2 candidates (apps/web, apps/admin)",
    );
  });

  it("DeadCodeAnalysisFailed wraps the cause", () => {
    const error = new HarnessDoctorError({
      reason: new DeadCodeAnalysisFailed({ cause: "SIGABRT from native binding" }),
    });
    expect(formatHarnessDoctorError(error)).toContain("Dead-code analysis failed");
    expect(formatHarnessDoctorError(error)).toContain("SIGABRT from native binding");
  });
});

describe("isHarnessDoctorError", () => {
  it("returns true for a wrapped tagged error", () => {
    const error = new HarnessDoctorError({
      reason: new ProjectNotFound({ directory: "/repo" }),
    });
    expect(isHarnessDoctorError(error)).toBe(true);
  });

  it("returns false for plain Errors", () => {
    expect(isHarnessDoctorError(new Error("not tagged"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isHarnessDoctorError("string")).toBe(false);
    expect(isHarnessDoctorError(null)).toBe(false);
    expect(isHarnessDoctorError(undefined)).toBe(false);
    expect(isHarnessDoctorError({ _tag: "HarnessDoctorError" })).toBe(false);
  });
});
