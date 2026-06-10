import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import { afterAll, describe, expect, it } from "vite-plus/test";
import type { Diagnostic, ProjectInfo } from "@harness-doctor/core";
import { DeadCodeAnalysisFailed, GitInvocationFailed, HarnessDoctorError } from "../src/errors.js";
import { runInspect, type InspectInput } from "../src/run-inspect.js";
import { Config } from "../src/services/config.js";
import { DeadCode } from "../src/services/dead-code.js";
import { Files } from "../src/services/files.js";
import { Git } from "../src/services/git.js";
import { Progress, ProgressCapture } from "../src/services/progress.js";
import { Project } from "../src/services/project.js";
import { Reporter, ReporterCapture } from "../src/services/reporter.js";
import { Score } from "../src/services/score.js";

// The orchestrator runs the disk-reading environment checks
// (`checkPnpmHardening` + `checkDocsStructure`) against the resolved scan
// directory. These tests exercise the orchestration, not the structural
// checks, so they point the scan directory at a fixture that passes every
// structural check — keeping the environment-diagnostics block empty so
// the asserted diagnostic sets reflect only the stubbed DeadCode output.
const CLEAN_DOCS_ROOT = path.resolve(import.meta.dirname, "fixtures", "docs-structure-clean");

const sampleProject: ProjectInfo = {
  rootDirectory: "/repo",
  projectName: "sample-app",
  framework: "vite",
  hasTypeScript: true,
  sourceFileCount: 1,
};

const deadCodeDiagnostic: Diagnostic = {
  filePath: "src/Unused.tsx",
  plugin: "deslop",
  rule: "unused-file",
  severity: "warning",
  message: "Unused file",
  help: "Delete it.",
  line: 0,
  column: 0,
  category: "Maintainability",
};

const baseInput: InspectInput = {
  directory: "/repo",
  includePaths: [],
  respectInlineDisables: true,
  runDeadCode: true,
  warnings: true,
  isCi: false,
};

const layersOf = (config: {
  deadCode?: ReadonlyArray<Diagnostic>;
  githubViewerPermission?: string | null;
  scanDirectory?: string;
}) =>
  Layer.mergeAll(
    Project.layerOf(sampleProject),
    Config.layerOf({
      config: null,
      resolvedDirectory: config.scanDirectory ?? CLEAN_DOCS_ROOT,
      configSourceDirectory: null,
    }),
    Files.layerInMemory(new Map()),
    DeadCode.layerOf(config.deadCode ?? []),
    Git.layerOf({
      headSha: "abc123",
      githubRepo: "millionco/sample-app",
      defaultBranch: "main",
      githubViewerPermission: config.githubViewerPermission,
    }),
    Score.layerOf({ score: 85, label: "Good" }),
    Progress.layerNoop,
    Reporter.layerCapture,
  );

describe("runInspect — happy path", () => {
  it("collects diagnostics from DeadCode and emits them through Reporter", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const output = yield* runInspect(baseInput);
        const ref = yield* ReporterCapture;
        const captured = yield* Ref.get(ref);
        return { output, captured };
      }).pipe(Effect.provide(layersOf({ deadCode: [deadCodeDiagnostic] }))),
    );

    expect(result.output.diagnostics).toHaveLength(1);
    expect(result.output.diagnostics.map((d) => d.rule)).toEqual(["unused-file"]);
    expect(result.output.didDeadCodeFail).toBe(false);
    expect(result.output.score).toEqual({ score: 85, label: "Good" });
    expect(result.output.project.projectName).toBe("sample-app");
    expect(result.output.scoreMetadata).toEqual({
      repo: "millionco/sample-app",
      sha: "abc123",
      framework: "vite",
      sourceFileCount: 1,
      defaultBranch: "main",
    });
    expect(result.output.userConfig).toBeNull();
    expect(result.output.resolvedDirectory).toBe(CLEAN_DOCS_ROOT);
    expect(result.captured).toHaveLength(1);
    expect(result.captured.map((d) => d.rule)).toEqual(["unused-file"]);
  });

  it("returns empty diagnostics when no service emits", async () => {
    const output = await Effect.runPromise(
      runInspect(baseInput).pipe(Effect.provide(layersOf({}))),
    );
    expect(output.diagnostics).toEqual([]);
    expect(output.didDeadCodeFail).toBe(false);
  });

  it("adds local authenticated GitHub viewer permission to score metadata", async () => {
    const output = await Effect.runPromise(
      runInspect({ ...baseInput, resolveLocalGithubViewerPermission: true }).pipe(
        Effect.provide(layersOf({ githubViewerPermission: "maintain" })),
      ),
    );

    expect(output.scoreMetadata).toMatchObject({
      repo: "millionco/sample-app",
      githubViewerPermission: "maintain",
    });
  });

  it("does not query local GitHub viewer permission in CI", async () => {
    const output = await Effect.runPromise(
      runInspect({
        ...baseInput,
        isCi: true,
        resolveLocalGithubViewerPermission: true,
      }).pipe(Effect.provide(layersOf({ githubViewerPermission: "maintain" }))),
    );

    expect(output.scoreMetadata).not.toHaveProperty("githubViewerPermission");
  });

  it("falls back when local GitHub viewer permission cannot resolve", async () => {
    const failingGit = Layer.mock(Git, {
      githubRepo: () => Effect.succeed("millionco/sample-app"),
      headSha: () => Effect.succeed("abc123"),
      defaultBranch: () => Effect.succeed("main"),
      githubViewerPermission: () =>
        Effect.fail(
          new HarnessDoctorError({
            reason: new GitInvocationFailed({
              args: ["api", "graphql"],
              directory: "/repo",
              cause: new Error("gh unavailable"),
            }),
          }),
        ),
    });
    const layers = Layer.mergeAll(
      Project.layerOf(sampleProject),
      Config.layerOf({
        config: null,
        resolvedDirectory: CLEAN_DOCS_ROOT,
        configSourceDirectory: null,
      }),
      Files.layerInMemory(new Map()),
      DeadCode.layerOf([]),
      failingGit,
      Score.layerOf({ score: 85, label: "Good" }),
      Progress.layerNoop,
      Reporter.layerCapture,
    );

    const output = await Effect.runPromise(
      runInspect({ ...baseInput, resolveLocalGithubViewerPermission: true }).pipe(
        Effect.provide(layers),
      ),
    );

    expect(output.scoreMetadata).toMatchObject({
      repo: "millionco/sample-app",
      sha: "abc123",
      defaultBranch: "main",
    });
    expect(output.scoreMetadata).not.toHaveProperty("githubViewerPermission");
  });
});

describe("runInspect — environment checks", () => {
  const emptyScanRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-empty-"));
  afterAll(() => {
    fs.rmSync(emptyScanRoot, { recursive: true, force: true });
  });

  it("reports docs-structure findings on a full scan of a bare directory", async () => {
    const output = await Effect.runPromise(
      runInspect(baseInput).pipe(Effect.provide(layersOf({ scanDirectory: emptyScanRoot }))),
    );
    expect(output.diagnostics.map((d) => d.rule)).toContain("docs-structure/entry-point-exists");
  });

  it("narrows environment findings to the changed files in diff mode", async () => {
    // The bare directory raises (at least) entry-point-exists (AGENTS.md)
    // and docs-directory-exists (docs/). A diff touching only AGENTS.md
    // must surface only the AGENTS.md-anchored finding.
    const output = await Effect.runPromise(
      runInspect({ ...baseInput, includePaths: ["AGENTS.md"] }).pipe(
        Effect.provide(layersOf({ scanDirectory: emptyScanRoot })),
      ),
    );
    expect(output.diagnostics.map((d) => d.rule)).toEqual(["docs-structure/entry-point-exists"]);
  });
});

describe("runInspect — dead-code failure", () => {
  it("folds DeadCode failure without sinking the scan", async () => {
    const failingDeadCode = Layer.mock(DeadCode, {
      run: () =>
        Stream.fail(
          new HarnessDoctorError({
            reason: new DeadCodeAnalysisFailed({ cause: "synthetic boom" }),
          }),
        ),
    });
    const layers = Layer.mergeAll(
      Project.layerOf(sampleProject),
      Config.layerOf({
        config: null,
        resolvedDirectory: CLEAN_DOCS_ROOT,
        configSourceDirectory: null,
      }),
      Files.layerInMemory(new Map()),
      failingDeadCode,
      Git.layerOf({}),
      Score.layerOf(null),
      Progress.layerNoop,
      Reporter.layerNoop,
    );
    const output = await Effect.runPromise(runInspect(baseInput).pipe(Effect.provide(layers)));
    expect(output.didDeadCodeFail).toBe(true);
    expect(output.deadCodeFailureReason).toContain("Dead-code analysis failed");
    expect(output.diagnostics).toHaveLength(0);
  });
});

describe("runInspect — hooks fire in order", () => {
  it("calls beforeScan before any diagnostic emission and afterScan after", async () => {
    const events: string[] = [];
    const output = await Effect.runPromise(
      runInspect(baseInput, {
        beforeScan: (project) =>
          Effect.sync(() => {
            events.push(`beforeScan:${project.projectName}`);
          }),
        afterScan: (didFail) =>
          Effect.sync(() => {
            events.push(`afterScan:${didFail}`);
          }),
      }).pipe(Effect.provide(layersOf({ deadCode: [deadCodeDiagnostic] }))),
    );
    expect(output.diagnostics).toHaveLength(1);
    expect(events).toEqual(["beforeScan:sample-app", "afterScan:false"]);
  });
});

describe("runInspect — scan progress phases", () => {
  it("labels dead-code as a separate progress phase", async () => {
    const phaseEvents: string[] = [];
    const trackingDeadCode = Layer.mock(DeadCode, {
      run: () =>
        Stream.unwrap(
          Effect.sync(() => {
            phaseEvents.push("dead-code");
            return Stream.fromIterable([deadCodeDiagnostic]);
          }),
        ),
    });
    const layers = Layer.mergeAll(
      Project.layerOf(sampleProject),
      Config.layerOf({
        config: null,
        resolvedDirectory: CLEAN_DOCS_ROOT,
        configSourceDirectory: null,
      }),
      Files.layerInMemory(new Map()),
      trackingDeadCode,
      Git.layerOf({}),
      Score.layerOf(null),
      Progress.layerCapture,
      Reporter.layerNoop,
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const output = yield* runInspect(baseInput, {
          afterScan: () =>
            Effect.sync(() => {
              phaseEvents.push("afterScan");
            }),
        });
        const progressRef = yield* ProgressCapture;
        const progressEvents = yield* Ref.get(progressRef);
        return { output, progressEvents };
      }).pipe(Effect.provide(layers)),
    );

    expect(result.output.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(["unused-file"]);
    expect(phaseEvents).toEqual(["dead-code", "afterScan"]);
    expect(result.progressEvents.map((event) => event.text)).toContain("Scanning...");
    expect(result.progressEvents.map((event) => event.text)).toContain("Analyzing dead code...");
  });
});

describe("runInspect — diff mode skips dead-code", () => {
  it("treats includePaths.length > 0 as diff mode and skips DeadCode.run", async () => {
    const output = await Effect.runPromise(
      runInspect({ ...baseInput, includePaths: ["src/App.tsx"] }).pipe(
        Effect.provide(layersOf({ deadCode: [deadCodeDiagnostic] })),
      ),
    );
    // Dead-code stream is replaced with empty in diff mode.
    expect(output.diagnostics).toEqual([]);
    expect(output.didDeadCodeFail).toBe(false);
  });
});

describe("runInspect — runDeadCode=false short-circuits dead-code", () => {
  it("skips DeadCode entirely when runDeadCode: false", async () => {
    const output = await Effect.runPromise(
      runInspect({ ...baseInput, runDeadCode: false }).pipe(
        Effect.provide(layersOf({ deadCode: [deadCodeDiagnostic] })),
      ),
    );
    expect(output.diagnostics).toEqual([]);
    expect(output.didDeadCodeFail).toBe(false);
  });
});

describe("runInspect — Reporter sees post-filter diagnostics", () => {
  it("filters out a diagnostic on a file ignored by config, then emits remaining", async () => {
    const ignoredDiagnostic: Diagnostic = {
      ...deadCodeDiagnostic,
      filePath: "src/ignored.test.tsx",
    };
    const layers = Layer.mergeAll(
      Project.layerOf(sampleProject),
      Config.layerOf({
        config: { ignore: { files: ["src/ignored.*"] } } as never,
        resolvedDirectory: CLEAN_DOCS_ROOT,
        configSourceDirectory: null,
      }),
      Files.layerInMemory(new Map()),
      DeadCode.layerOf([ignoredDiagnostic, deadCodeDiagnostic]),
      Git.layerOf({}),
      Score.layerOf(null),
      Progress.layerNoop,
      Reporter.layerCapture,
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const output = yield* runInspect(baseInput);
        const ref = yield* ReporterCapture;
        const captured = yield* Ref.get(ref);
        return { output, captured };
      }).pipe(Effect.provide(layers)),
    );
    expect(result.output.diagnostics.map((d) => d.filePath)).toEqual(["src/Unused.tsx"]);
    expect(result.captured.map((d) => d.filePath)).toEqual(["src/Unused.tsx"]);
  });
});

describe("runInspect — ignored tags drop whole rule families", () => {
  it("drops deslop diagnostics when ignore.tags includes dead-code", async () => {
    const layers = Layer.mergeAll(
      Project.layerOf(sampleProject),
      Config.layerOf({
        config: { ignore: { tags: ["dead-code"] } } as never,
        resolvedDirectory: CLEAN_DOCS_ROOT,
        configSourceDirectory: null,
      }),
      Files.layerInMemory(new Map()),
      DeadCode.layerOf([deadCodeDiagnostic]),
      Git.layerOf({}),
      Score.layerOf(null),
      Progress.layerNoop,
      Reporter.layerNoop,
    );
    const output = await Effect.runPromise(runInspect(baseInput).pipe(Effect.provide(layers)));
    expect(output.diagnostics).toEqual([]);
  });
});
