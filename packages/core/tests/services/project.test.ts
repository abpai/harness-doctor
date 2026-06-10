import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "vite-plus/test";
import type { ProjectInfo } from "@harness-doctor/core";
import { HarnessDoctorError } from "../../src/errors.js";
import { Project } from "../../src/services/project.js";

const sampleProject: ProjectInfo = {
  rootDirectory: "/repo",
  projectName: "sample-app",
  framework: "vite",
  hasTypeScript: true,
  sourceFileCount: 1,
};

describe("Project.layerOf", () => {
  it("returns the supplied ProjectInfo regardless of input directory", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* Project;
        return yield* project.discover("/anywhere");
      }).pipe(Effect.provide(Project.layerOf(sampleProject))),
    );
    expect(result.projectName).toBe("sample-app");
    expect(result.framework).toBe("vite");
  });

  it("never fails with a HarnessDoctorError", async () => {
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* Project;
        return yield* project.discover("/anywhere");
      }).pipe(Effect.provide(Project.layerOf(sampleProject)), Effect.exit),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});

describe("Project.layerNode", () => {
  it("discovers a docs-only repo without a package.json", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-docs-only-"));
    try {
      fs.writeFileSync(path.join(directory, "AGENTS.md"), "# Agent guide\n");
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const project = yield* Project;
          return yield* project.discover(directory);
        }).pipe(Effect.provide(Project.layerNode)),
      );
      expect(result).toMatchObject({
        rootDirectory: directory,
        projectName: path.basename(directory),
        framework: "unknown",
        sourceFileCount: 0,
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("translates a missing project directory into a tagged HarnessDoctorError", async () => {
    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const project = yield* Project;
        return yield* project.discover("/this/path/should/not/exist/abc-project-info-test-12345");
      }).pipe(Effect.provide(Project.layerNode), Effect.exit),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason);
      expect(failures.length).toBe(1);
      const error = failures[0].error;
      expect(error).toBeInstanceOf(HarnessDoctorError);
      if (error instanceof HarnessDoctorError) {
        expect(error.reason._tag).toBe("ProjectNotFound");
      }
    }
  });
});
