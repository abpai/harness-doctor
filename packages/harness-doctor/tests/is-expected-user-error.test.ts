import { describe, expect, it } from "vite-plus/test";
import {
  AmbiguousProjectError,
  DeadCodeAnalysisFailed,
  GitBaseBranchInvalid,
  GitBaseBranchMissing,
  NotADirectoryError,
  PackageJsonNotFoundError,
  ProjectNotFoundError,
  HarnessDoctorError,
} from "@harness-doctor/core";
import { CliInputError } from "../src/cli/utils/cli-input-error.js";
import { isExpectedUserError } from "../src/cli/utils/is-expected-user-error.js";

describe("isExpectedUserError", () => {
  it("classifies every project-discovery failure as an expected user error (kept out of Sentry)", () => {
    // Regression: running harness-doctor against a directory with no project
    // or a path that doesn't exist is expected, user-actionable behavior —
    // not a crash to report.
    expect(isExpectedUserError(new ProjectNotFoundError("/tmp/audit-v7"))).toBe(true);
    expect(
      isExpectedUserError(new ProjectNotFoundError("/tmp/audit-v7", { kind: "missing-path" })),
    ).toBe(true);
    expect(isExpectedUserError(new PackageJsonNotFoundError("/var/tmp"))).toBe(true);
    expect(isExpectedUserError(new NotADirectoryError("/var/tmp/file.txt"))).toBe(true);
    expect(isExpectedUserError(new AmbiguousProjectError("/work", ["a", "b"]))).toBe(true);
  });

  it("classifies CLI invocation mistakes as expected user errors", () => {
    // REACT-DOCTOR-B/D/G/H: mutually exclusive flags, a malformed
    // "<file>:<line>" argument, or an unknown --project name are user
    // invocation mistakes, not crashes.
    expect(
      isExpectedUserError(new CliInputError("Cannot combine --yes and --full; pick one.")),
    ).toBe(true);
    expect(
      isExpectedUserError(new CliInputError('Expected "<file>:<line>", got "package.json".')),
    ).toBe(true);
  });

  it("classifies bad --diff base-branch input as an expected user error", () => {
    expect(
      isExpectedUserError(
        new HarnessDoctorError({ reason: new GitBaseBranchInvalid({ detail: "bad ref" }) }),
      ),
    ).toBe(true);
    expect(
      isExpectedUserError(
        new HarnessDoctorError({ reason: new GitBaseBranchMissing({ branch: "main" }) }),
      ),
    ).toBe(true);
  });

  it("does not mask genuine bugs (those stay reportable)", () => {
    expect(isExpectedUserError(new Error("boom"))).toBe(false);
    expect(isExpectedUserError(undefined)).toBe(false);
    expect(
      isExpectedUserError(
        new HarnessDoctorError({
          reason: new DeadCodeAnalysisFailed({ cause: new Error("nope") }),
        }),
      ),
    ).toBe(false);
  });
});
