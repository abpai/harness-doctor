import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildSentryProjectContext,
  getSentryProjectInfo,
  setSentryProjectInfo,
} from "../src/cli/utils/build-sentry-project-context.js";
import type { ProjectInfo } from "@harness-doctor/core";

const projectInfo: ProjectInfo = {
  rootDirectory: "/workspace/app",
  projectName: "my-app",
  framework: "nextjs",
  hasTypeScript: true,
  sourceFileCount: 142,
};

describe("buildSentryProjectContext", () => {
  it("maps detected project info to namespaced, searchable tags", () => {
    const { tags } = buildSentryProjectContext(projectInfo);
    expect(tags).toEqual({
      "project.framework": "nextjs",
      "project.typescript": true,
    });
  });

  it("includes the anonymous project shape (no source code) in the context block", () => {
    const { context } = buildSentryProjectContext(projectInfo);
    expect(context).toEqual({
      framework: "nextjs",
      hasTypeScript: true,
      sourceFileCount: 142,
    });
  });

  it("omits identifying fields (project name, root directory)", () => {
    const { context } = buildSentryProjectContext(projectInfo);
    expect(context.projectName).toBeUndefined();
    expect(context.rootDirectory).toBeUndefined();
  });
});

describe("current project info store", () => {
  afterEach(() => setSentryProjectInfo(null));

  it("remembers and clears the current run's project", () => {
    expect(getSentryProjectInfo()).toBeNull();
    setSentryProjectInfo(projectInfo);
    expect(getSentryProjectInfo()).toBe(projectInfo);
    setSentryProjectInfo(null);
    expect(getSentryProjectInfo()).toBeNull();
  });
});
