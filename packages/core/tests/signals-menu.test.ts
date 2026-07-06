import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { commandExistsInSignalsMenu, discoverSignalsMenu } from "@harness-doctor/core";

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "fixtures", "signals-menu");

let stderrSpy: ReturnType<typeof vi.spyOn> | null = null;
let temporaryRoot: string;

beforeEach(() => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-signals-menu-"));
});

afterEach(() => {
  stderrSpy?.mockRestore();
  stderrSpy = null;
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

const silenceStderr = (): string[] => {
  const writes: string[] = [];
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  });
  return writes;
};

describe("discoverSignalsMenu", () => {
  it("discovers package scripts from the root and workspace packages", () => {
    const menu = discoverSignalsMenu(path.join(FIXTURES_DIRECTORY, "basic"));

    expect(menu.packageScripts).toEqual([
      { workspace: null, name: "lint", command: "eslint ." },
      { workspace: null, name: "test", command: "vitest" },
      { workspace: "web", name: "build", command: "vite build" },
      { workspace: "web", name: "test:e2e", command: "playwright test" },
    ]);
  });

  it("discovers workflow run commands grouped by workflow and job", () => {
    const menu = discoverSignalsMenu(path.join(FIXTURES_DIRECTORY, "basic"));

    expect(menu.ciCommands).toEqual([
      { workflow: ".github/workflows/ci.yml", job: "release", commands: ["pnpm build"] },
      {
        workflow: ".github/workflows/ci.yml",
        job: "test",
        commands: ["pnpm test", "pnpm lint\npnpm typecheck"],
      },
    ]);
  });

  it("discovers Makefile targets and just recipes", () => {
    const menu = discoverSignalsMenu(path.join(FIXTURES_DIRECTORY, "basic"));

    expect(menu.makeTargets).toEqual(["build", "lint", "test"]);
    expect(menu.justRecipes).toEqual(["default", "deploy", "test"]);
  });

  it("warns and skips malformed JSON and YAML without throwing", () => {
    const writes = silenceStderr();
    const malformedFixture = path.join(FIXTURES_DIRECTORY, "malformed");
    fs.mkdirSync(path.join(temporaryRoot, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(temporaryRoot, "package.json"),
      fs.readFileSync(path.join(malformedFixture, "package-json.fixture"), "utf-8"),
    );
    fs.writeFileSync(
      path.join(temporaryRoot, ".github", "workflows", "bad.yml"),
      fs.readFileSync(path.join(malformedFixture, "workflow-yml.fixture"), "utf-8"),
    );

    expect(() => discoverSignalsMenu(temporaryRoot)).not.toThrow();
    const menu = discoverSignalsMenu(temporaryRoot);

    expect(menu).toEqual({
      packageScripts: [],
      ciCommands: [],
      makeTargets: [],
      justRecipes: [],
    });
    expect(writes.join("")).toContain("malformed JSON");
    expect(writes.join("")).toContain("tab indentation");
  });
});

describe("commandExistsInSignalsMenu", () => {
  const menu = discoverSignalsMenu(path.join(FIXTURES_DIRECTORY, "basic"));

  it("resolves package scripts by bare name and runner invocation", () => {
    expect(commandExistsInSignalsMenu("test", menu)).toBe(true);
    expect(commandExistsInSignalsMenu("pnpm test", menu)).toBe(true);
    expect(commandExistsInSignalsMenu("npm run lint", menu)).toBe(true);
    expect(commandExistsInSignalsMenu("pnpm --filter web test:e2e", menu)).toBe(true);
  });

  it("resolves make targets and just recipes", () => {
    expect(commandExistsInSignalsMenu("make build", menu)).toBe(true);
    expect(commandExistsInSignalsMenu("just deploy production", menu)).toBe(true);
  });

  it("rejects commands that do not exist in the signals menu", () => {
    expect(commandExistsInSignalsMenu("pnpm missing", menu)).toBe(false);
    expect(commandExistsInSignalsMenu("pnpm --filter api test:e2e", menu)).toBe(false);
    expect(commandExistsInSignalsMenu("make missing", menu)).toBe(false);
    expect(commandExistsInSignalsMenu("just missing", menu)).toBe(false);
  });
});
