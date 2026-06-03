import { describe, expect, it } from "vite-plus/test";
import { isAnalyzableProject } from "@harness-doctor/core";
import type { ProjectInfo } from "@harness-doctor/core";

const baseProject: ProjectInfo = {
  rootDirectory: "/repo",
  projectName: "sample-app",
  reactVersion: null,
  reactMajorVersion: null,
  tailwindVersion: null,
  zodVersion: null,
  zodMajorVersion: null,
  framework: "unknown",
  hasTypeScript: false,
  hasReactCompiler: false,
  hasTanStackQuery: false,
  hasReactNativeWorkspace: false,
  expoVersion: null,
  hasReanimated: false,
  preactVersion: null,
  preactMajorVersion: null,
  sourceFileCount: 0,
};

describe("isAnalyzableProject", () => {
  it("accepts a discovered project that has no framework dependency", () => {
    expect(isAnalyzableProject(baseProject)).toBe(true);
  });

  it("accepts a React project", () => {
    expect(
      isAnalyzableProject({ ...baseProject, reactVersion: "19.0.0", reactMajorVersion: 19 }),
    ).toBe(true);
  });

  it("rejects a project with no resolved root directory", () => {
    expect(isAnalyzableProject({ ...baseProject, rootDirectory: "" })).toBe(false);
    expect(isAnalyzableProject({ ...baseProject, rootDirectory: "   " })).toBe(false);
  });
});
