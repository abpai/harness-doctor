import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type { Diagnostic } from "@harness-doctor/core";
import {
  clearAutoSuppressionCaches,
  createNodeReadFileLinesSync,
  mergeAndFilterDiagnostics,
} from "@harness-doctor/core";

// Inlined to avoid coupling core tests to the harness-doctor regressions
// test harness (which carries its own runOxlint + git-spawn surface).
const writeFile = (filePath: string, contents: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
};

const buildDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic => ({
  filePath: "src/app.tsx",
  plugin: "harness-doctor",
  rule: "test-rule",
  severity: "error",
  message: "x",
  help: "",
  line: 1,
  column: 1,
  category: "Test",
  ...overrides,
});

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rd-merge-and-filter-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const setupCase = (caseId: string, fileContents: string): string => {
  const projectDir = path.join(tempRoot, caseId);
  writeFile(path.join(projectDir, "src", "app.tsx"), fileContents);
  return projectDir;
};

const baseDiagnostic = (overrides: Partial<Diagnostic> = {}): Diagnostic =>
  buildDiagnostic({ rule: "no-derived-state-effect", line: 2, ...overrides });

describe("mergeAndFilterDiagnostics — respectInlineDisables option", () => {
  it("filters harness-doctor-disable comments by default (respectInlineDisables defaults to true)", () => {
    const projectDir = setupCase(
      "default-respects-disables",
      `// harness-doctor-disable-next-line harness-doctor/no-derived-state-effect\nconst x = 1;\n`,
    );
    const filtered = mergeAndFilterDiagnostics(
      [baseDiagnostic()],
      projectDir,
      null,
      createNodeReadFileLinesSync(projectDir),
    );
    expect(filtered).toHaveLength(0);
  });

  it("audit mode (respectInlineDisables=false) bypasses harness-doctor-disable comments too", () => {
    const projectDir = setupCase(
      "audit-bypasses-disables",
      `// harness-doctor-disable-next-line harness-doctor/no-derived-state-effect\nconst x = 1;\n`,
    );
    const filtered = mergeAndFilterDiagnostics(
      [baseDiagnostic()],
      projectDir,
      null,
      createNodeReadFileLinesSync(projectDir),
      { respectInlineDisables: false },
    );
    expect(filtered).toHaveLength(1);
  });

  it("audit mode still honors config-level ignore.rules and ignore.files", () => {
    const projectDir = setupCase("audit-honors-config-ignores", `const x = 1;\n`);
    const filtered = mergeAndFilterDiagnostics(
      [baseDiagnostic({ filePath: "src/skip.tsx", line: 1 })],
      projectDir,
      { ignore: { files: ["src/skip.tsx"] } },
      createNodeReadFileLinesSync(projectDir),
      { respectInlineDisables: false },
    );
    expect(filtered).toHaveLength(0);
  });
});

describe("mergeAndFilterDiagnostics — test-noise tag auto-suppression", () => {
  const projectDir = path.join(tempRoot, "test-noise-suppression");
  const readNoop = () => null;
  const plainDiagnostic = (filePath: string): Diagnostic =>
    buildDiagnostic({
      rule: "test-rule",
      filePath,
      line: 1,
      column: 1,
    });

  // No rule in the framework-agnostic boilerplate is tagged `test-noise`, so a
  // plain diagnostic surfaces unchanged even when it lands in a test file. This
  // guards the lookup contract: auto-suppression is keyed on a registry tag, not
  // on the file path alone.
  it("does not suppress untagged rules in test files", () => {
    clearAutoSuppressionCaches();
    const filtered = mergeAndFilterDiagnostics(
      [plainDiagnostic("src/dashboard.test.tsx")],
      projectDir,
      null,
      readNoop,
      { respectInlineDisables: false },
    );
    expect(filtered).toHaveLength(1);
  });

  it("surfaces untagged rules in plain production files", () => {
    clearAutoSuppressionCaches();
    const filtered = mergeAndFilterDiagnostics(
      [plainDiagnostic("src/server/load-dashboard.ts")],
      projectDir,
      null,
      readNoop,
      { respectInlineDisables: false },
    );
    expect(filtered).toHaveLength(1);
  });
});
