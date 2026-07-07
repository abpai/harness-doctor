import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { signalsAction } from "../src/cli/commands/signals.js";

let temporaryRoot: string;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stdoutWrites: string[];

beforeEach(() => {
  temporaryRoot = mkdtempSync(path.join(tmpdir(), "harness-doctor-signals-command-"));
  stdoutWrites = [];
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdoutWrites.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8"));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  rmSync(temporaryRoot, { recursive: true, force: true });
});

const writeFixtureFile = (relativePath: string, contents: string): void => {
  const filePath = path.join(temporaryRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
};

describe("signalsAction", () => {
  it("prints the discovered signals menu as JSON", async () => {
    writeFixtureFile(
      "package.json",
      JSON.stringify({ name: "fixture", scripts: { test: "vitest" } }, null, 2),
    );

    await signalsAction(temporaryRoot, { jsonCompact: true });

    const parsed = JSON.parse(stdoutWrites.join(""));
    expect(parsed.packageScripts).toEqual([{ workspace: null, name: "test", command: "vitest" }]);
    expect(parsed.ciCommands).toEqual([]);
    expect(parsed.makeTargets).toEqual([]);
    expect(parsed.justRecipes).toEqual([]);
  });
});
