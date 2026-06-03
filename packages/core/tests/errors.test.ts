import { describe, expect, it } from "vite-plus/test";
import {
  AmbiguousProject,
  ConfigParseFailed,
  DeadCodeAnalysisFailed,
  formatHarnessDoctorError,
  isHarnessDoctorError,
  isSplittableHarnessDoctorError,
  NoReactDependency,
  OxlintBatchExceeded,
  OxlintOutputUnparseable,
  OxlintSpawnFailed,
  OxlintUnavailable,
  ProjectNotFound,
  HarnessDoctorError,
} from "@harness-doctor/core";

describe("HarnessDoctorError leaves", () => {
  it("OxlintUnavailable renders binary-not-found", () => {
    const error = new HarnessDoctorError({
      reason: new OxlintUnavailable({
        kind: "binary-not-found",
        detail: "/path/to/oxlint",
      }),
    });
    expect(error.reason._tag).toBe("OxlintUnavailable");
    expect(formatHarnessDoctorError(error)).toBe("oxlint binary not found: /path/to/oxlint");
  });

  it("OxlintUnavailable renders native-binding-missing", () => {
    const error = new HarnessDoctorError({
      reason: new OxlintUnavailable({
        kind: "native-binding-missing",
        detail: "no @oxlint/linux-x64 in node_modules",
      }),
    });
    expect(formatHarnessDoctorError(error)).toBe(
      "oxlint native binding missing: no @oxlint/linux-x64 in node_modules",
    );
  });

  it("OxlintBatchExceeded renders each kind", () => {
    const cases: Array<{
      kind: "timeout" | "output-too-large" | "oom" | "killed";
      expected: string;
    }> = [
      { kind: "timeout", expected: "oxlint batch timed out: 60s budget exceeded" },
      { kind: "output-too-large", expected: "oxlint batch output exceeded limit: 50 MiB cap" },
      { kind: "oom", expected: "oxlint batch ran out of memory: SIGABRT" },
      { kind: "killed", expected: "oxlint batch was killed: SIGKILL" },
    ];
    const details: Record<string, string> = {
      timeout: "60s budget exceeded",
      "output-too-large": "50 MiB cap",
      oom: "SIGABRT",
      killed: "SIGKILL",
    };
    for (const { kind, expected } of cases) {
      const error = new HarnessDoctorError({
        reason: new OxlintBatchExceeded({ kind, detail: details[kind] ?? "" }),
      });
      expect(formatHarnessDoctorError(error)).toBe(expected);
    }
  });

  it("OxlintSpawnFailed wraps an underlying cause", () => {
    const inner = new Error("ENOENT: spawn oxlint");
    const error = new HarnessDoctorError({
      reason: new OxlintSpawnFailed({ cause: inner }),
    });
    expect(formatHarnessDoctorError(error)).toContain("Failed to run oxlint");
    expect(formatHarnessDoctorError(error)).toContain("ENOENT: spawn oxlint");
  });

  it("OxlintOutputUnparseable surfaces the preview", () => {
    const error = new HarnessDoctorError({
      reason: new OxlintOutputUnparseable({ preview: "<html>500 internal</html>" }),
    });
    expect(formatHarnessDoctorError(error)).toBe(
      "Failed to parse oxlint output: <html>500 internal</html>",
    );
  });

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
    expect(formatHarnessDoctorError(error)).toBe("Could not find a React project at /repo/apps/web");
  });

  it("NoReactDependency names the directory", () => {
    const error = new HarnessDoctorError({
      reason: new NoReactDependency({ directory: "/repo/packages/utils" }),
    });
    expect(formatHarnessDoctorError(error)).toBe("No React dependency found in /repo/packages/utils");
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

describe("isSplittableHarnessDoctorError", () => {
  it("returns true only for OxlintBatchExceeded", () => {
    const splittable = new HarnessDoctorError({
      reason: new OxlintBatchExceeded({ kind: "timeout", detail: "60s" }),
    });
    expect(isSplittableHarnessDoctorError(splittable)).toBe(true);
  });

  it("returns false for other reasons", () => {
    const cases = [
      new OxlintUnavailable({ kind: "binary-not-found", detail: "x" }),
      new OxlintSpawnFailed({ cause: new Error("boom") }),
      new OxlintOutputUnparseable({ preview: "x" }),
      new ConfigParseFailed({ path: "x", cause: "x" }),
      new ProjectNotFound({ directory: "x" }),
      new NoReactDependency({ directory: "x" }),
      new AmbiguousProject({ directory: "x", candidates: [] }),
      new DeadCodeAnalysisFailed({ cause: "x" }),
    ] as const;
    for (const reason of cases) {
      const error = new HarnessDoctorError({ reason });
      expect(isSplittableHarnessDoctorError(error)).toBe(false);
    }
  });

  it("returns false for non-HarnessDoctorError values", () => {
    expect(isSplittableHarnessDoctorError(new Error("plain"))).toBe(false);
    expect(isSplittableHarnessDoctorError("string")).toBe(false);
    expect(isSplittableHarnessDoctorError(null)).toBe(false);
  });
});
