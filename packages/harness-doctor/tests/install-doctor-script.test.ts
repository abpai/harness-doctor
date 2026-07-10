import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  findNearestPackageDirectory,
  hasDoctorScript,
  installDoctorScript,
} from "../src/cli/utils/install-doctor-script.js";

interface InstallDoctorScriptFixture {
  readonly projectRoot: string;
  readonly cleanup: () => void;
}

const setupFixture = (): InstallDoctorScriptFixture => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "harness-doctor-script-"));
  return {
    projectRoot,
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
};

const writePackageJson = (projectRoot: string, value: Record<string, unknown>): void => {
  writeFileSync(path.join(projectRoot, "package.json"), `${JSON.stringify(value, null, 2)}\n`);
};

const readPackageJson = (projectRoot: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

describe("installDoctorScript", () => {
  let fixture: InstallDoctorScriptFixture;

  beforeEach(() => {
    fixture = setupFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("skips missing package.json without throwing", () => {
    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptStatus: "skipped",
      scriptReason: "missing-or-invalid-package-json",
    });
  });

  it("skips malformed package.json and leaves it unchanged", () => {
    const packageJsonPath = path.join(fixture.projectRoot, "package.json");
    writeFileSync(packageJsonPath, "{ invalid json");

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result.scriptStatus).toBe("skipped");
    expect(readFileSync(packageJsonPath, "utf8")).toBe("{ invalid json");
  });

  it("creates doctor when scripts are missing", () => {
    writePackageJson(fixture.projectRoot, { name: "app" });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptName: "doctor",
      scriptStatus: "created",
    });
    expect(readPackageJson(fixture.projectRoot)).toMatchObject({
      scripts: { doctor: "bunx --bun @andypai/harness-doctor@latest" },
    });
    expect(readPackageJson(fixture.projectRoot)).not.toHaveProperty("devDependencies");
  });

  it("writes to the nearest ancestor package.json when called from a nested directory", () => {
    writePackageJson(fixture.projectRoot, { name: "app" });
    const nestedDirectory = path.join(fixture.projectRoot, "src", "components");
    mkdirSync(nestedDirectory, { recursive: true });

    const result = installDoctorScript({ projectRoot: nestedDirectory });

    expect(result.packageJsonPath).toBe(path.join(fixture.projectRoot, "package.json"));
    expect(readPackageJson(fixture.projectRoot)).toMatchObject({
      scripts: { doctor: "bunx --bun @andypai/harness-doctor@latest" },
    });
    expect(readPackageJson(fixture.projectRoot)).not.toHaveProperty("devDependencies");
  });

  it("stops nearest package lookup at the requested boundary when provided", () => {
    writePackageJson(fixture.projectRoot, { name: "parent" });
    const nestedDirectory = path.join(fixture.projectRoot, "nested");
    mkdirSync(nestedDirectory, { recursive: true });

    expect(findNearestPackageDirectory(nestedDirectory, nestedDirectory)).toBeNull();
  });

  it("adds harness-doctor fallback when doctor is taken", () => {
    writePackageJson(fixture.projectRoot, {
      scripts: { doctor: "vitest --run" },
    });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptName: "harness-doctor",
      scriptStatus: "created",
      scriptReason: "doctor-script-taken",
    });
    expect(readPackageJson(fixture.projectRoot).scripts).toEqual({
      doctor: "vitest --run",
      "harness-doctor": "bunx --bun @andypai/harness-doctor@latest",
    });
  });

  it("skips the script when both script names are taken by other commands", () => {
    writePackageJson(fixture.projectRoot, {
      scripts: {
        doctor: "vitest --run",
        "harness-doctor": "echo nope",
      },
    });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptStatus: "skipped",
      scriptReason: "script-names-taken",
    });
    expect(readPackageJson(fixture.projectRoot).scripts).toEqual({
      doctor: "vitest --run",
      "harness-doctor": "echo nope",
    });
  });

  it("treats an existing harness-doctor fallback command as setup", () => {
    writePackageJson(fixture.projectRoot, {
      scripts: {
        "harness-doctor": "harness-doctor --verbose",
      },
    });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptName: "harness-doctor",
      scriptStatus: "existing",
    });
    expect(readPackageJson(fixture.projectRoot).scripts).toEqual({
      "harness-doctor": "harness-doctor --verbose",
    });
    expect(hasDoctorScript(fixture.projectRoot)).toBe(true);
  });

  it("skips only the script when scripts is not an object", () => {
    writePackageJson(fixture.projectRoot, {
      scripts: "npm test",
    });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptStatus: "skipped",
      scriptReason: "invalid-scripts",
    });
    expect(readPackageJson(fixture.projectRoot)).toMatchObject({
      scripts: "npm test",
    });
    expect(readPackageJson(fixture.projectRoot)).not.toHaveProperty("devDependencies");
  });

  it("still creates the script when devDependencies is not an object", () => {
    writePackageJson(fixture.projectRoot, {
      scripts: {},
      devDependencies: "harness-doctor",
    });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result).toMatchObject({
      scriptName: "doctor",
      scriptStatus: "created",
    });
    expect(readPackageJson(fixture.projectRoot)).toMatchObject({
      scripts: { doctor: "bunx --bun @andypai/harness-doctor@latest" },
      devDependencies: "harness-doctor",
    });
  });

  it("does not add devDependency when harness-doctor exists in another dependency field", () => {
    writePackageJson(fixture.projectRoot, {
      scripts: {},
      dependencies: {
        "harness-doctor": "^1.2.3",
      },
    });

    const result = installDoctorScript({ projectRoot: fixture.projectRoot });

    expect(result.scriptStatus).toBe("created");
    expect(readPackageJson(fixture.projectRoot)).toMatchObject({
      scripts: { doctor: "bunx --bun @andypai/harness-doctor@latest" },
      dependencies: { "harness-doctor": "^1.2.3" },
    });
    expect(readPackageJson(fixture.projectRoot)).not.toHaveProperty("devDependencies");
  });
});
