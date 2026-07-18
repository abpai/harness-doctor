import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vite-plus/test";
import { checkDeadCode } from "../src/check-dead-code.js";
import { mergeAndFilterDiagnostics } from "../src/merge-and-filter-diagnostics.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rd-check-dead-code-"));

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const setupProject = (caseId: string, files: Record<string, string>): string => {
  const projectDirectory = path.join(tempRoot, caseId);
  fs.mkdirSync(projectDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(projectDirectory, "package.json"),
    JSON.stringify({
      name: caseId,
      type: "module",
      dependencies: { react: "^19.0.0" },
    }),
  );
  fs.writeFileSync(
    path.join(projectDirectory, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "preserve", target: "es2022", module: "esnext" } }),
  );
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(projectDirectory, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
  }
  return projectDirectory;
};

// A Next.js `src/` project whose only edges into `Button` / `format`
// run through the `@/*` tsconfig path alias — the exact shape that
// regressed when the scan root wasn't canonicalized.
const setupAliasProject = (caseId: string): string => {
  const projectDirectory = path.join(tempRoot, caseId);
  fs.mkdirSync(projectDirectory, { recursive: true });
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: caseId,
      type: "module",
      dependencies: { next: "^16.0.0", react: "^19.0.0", "react-dom": "^19.0.0" },
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        jsx: "preserve",
        module: "esnext",
        moduleResolution: "bundler",
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    }),
    "src/app/page.tsx":
      'import { Button } from "@/components/Button";\n' +
      'import { formatName } from "@/lib/format";\n' +
      "export default function Home() { return <Button label={formatName('x')} />; }\n",
    "src/components/Button.tsx":
      "export const Button = ({ label }: { label: string }) => <button>{label}</button>;\n",
    "src/lib/format.ts":
      "export const formatName = (name: string): string => name.toUpperCase();\n",
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(projectDirectory, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
  }
  return projectDirectory;
};

const flaggedUnusedFiles = async (rootDirectory: string): Promise<string[]> =>
  (await checkDeadCode({ rootDirectory }))
    .filter((diagnostic) => diagnostic.rule === "unused-file")
    .map((diagnostic) => diagnostic.filePath)
    .sort();

describe("checkDeadCode", () => {
  const expectHeuristicCaveat = (diagnostics: Awaited<ReturnType<typeof checkDeadCode>>): void => {
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.help).toContain(
        "Dead-code analysis is heuristic; dynamically loaded files or fixtures may be false positives.",
      );
    }
  };

  it("returns no diagnostics when the directory has no package.json", async () => {
    const directory = path.join(tempRoot, "no-package-json");
    fs.mkdirSync(directory, { recursive: true });
    expect(await checkDeadCode({ rootDirectory: directory })).toEqual([]);
  });

  it("flags an orphan file with POSIX-separated paths under the Maintainability category", async () => {
    const directory = setupProject("unused-file", {
      "src/index.ts": "export const used = 1;\n",
      "src/orphan.ts": "export const orphan = 1;\n",
    });
    const diagnostics = await checkDeadCode({ rootDirectory: directory });
    const orphan = diagnostics.find(
      (diagnostic) =>
        diagnostic.rule === "unused-file" && diagnostic.filePath.endsWith("orphan.ts"),
    );
    expect(orphan).toBeDefined();
    expect(orphan?.plugin).toBe("knip");
    expect(orphan?.category).toBe("Maintainability");
    expect(orphan?.filePath.includes("\\")).toBe(false);
    expect(orphan?.help).toContain("Dead-code analysis is heuristic");
  });

  it("honors .gitignore without overriding the repository's Knip configuration", async () => {
    const directory = setupProject("ignore-patterns", {
      "src/index.ts": "export const used = 1;\n",
      "src/gitignored.ts": "export const a = 1;\n",
      "src/configured-entry.ts": "export const b = 1;\n",
      ".gitignore": "src/gitignored.ts\n",
      "knip.json": JSON.stringify({
        entry: ["src/index.ts", "src/configured-entry.ts"],
        project: ["src/**/*.ts"],
      }),
    });
    const diagnostics = await checkDeadCode({
      rootDirectory: directory,
      userConfig: { ignore: { files: ["src/configured-entry.ts"] } },
    });
    const flagged = diagnostics
      .filter((diagnostic) => diagnostic.rule === "unused-file")
      .map((diagnostic) => diagnostic.filePath);
    expect(flagged.some((entry) => entry.endsWith("gitignored.ts"))).toBe(false);
    expect(flagged.some((entry) => entry.endsWith("configured-entry.ts"))).toBe(false);
  });

  it("leaves Harness ignore.files filtering to the shared diagnostic pipeline", async () => {
    const directory = setupProject("harness-ignore", {
      "src/index.ts": "export const used = 1;\n",
      "src/ignored-by-harness.ts": "export const ignored = 1;\n",
      "knip.json": JSON.stringify({
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
      }),
    });
    const diagnostics = await checkDeadCode({ rootDirectory: directory });
    expect(diagnostics.map((diagnostic) => diagnostic.filePath)).toContain(
      "src/ignored-by-harness.ts",
    );
    const filtered = mergeAndFilterDiagnostics(
      diagnostics,
      directory,
      { ignore: { files: ["src/ignored-by-harness.ts"] } },
      () => null,
    );
    expect(filtered.map((diagnostic) => diagnostic.filePath)).not.toContain(
      "src/ignored-by-harness.ts",
    );
  });

  it("respects repository-owned knip.json ignoreFiles", async () => {
    const directory = setupProject("knip-config", {
      "src/index.ts": "export const used = 1;\n",
      "src/ignored.ts": "export const ignored = 1;\n",
      "knip.json": JSON.stringify({
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
        ignoreFiles: ["src/ignored.ts"],
      }),
    });
    expect(await flaggedUnusedFiles(directory)).not.toContain("src/ignored.ts");
  });

  it("maps unused exports, dependencies, and cycles from worker results", async () => {
    const directory = setupProject("worker-result-shapes", {
      "src/index.ts": "export const used = 1;\n",
      "src/a.ts": "import './b';\n",
      "src/b.ts": "import './a';\n",
    });

    const diagnostics = await checkDeadCode({
      rootDirectory: directory,
      createWorker: () => ({
        result: Promise.resolve({
          issues: [
            {
              file: path.join(directory, "packages", "web", "package.json"),
              exports: [{ name: "unused", line: 3, col: 14 }],
              types: [{ name: "UnusedType", line: 4, col: 12 }],
              dependencies: [{ name: "left-pad" }],
              devDependencies: [{ name: "vitest" }],
              cycles: [
                [
                  { name: path.join(directory, "src", "a.ts") },
                  { name: path.join(directory, "src", "b.ts") },
                ],
              ],
            },
          ],
        }),
      }),
    });

    expect(diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      "unused-export",
      "unused-type",
      "unused-dependency",
      "unused-dev-dependency",
      "circular-dependency",
    ]);
    expect(diagnostics.find((diagnostic) => diagnostic.rule === "unused-type")?.message).toContain(
      "Unused type export: `UnusedType`",
    );
    expect(
      diagnostics.find((diagnostic) => diagnostic.rule === "circular-dependency")?.message,
    ).toContain("src/a.ts → src/b.ts");
    expect(
      diagnostics.find((diagnostic) => diagnostic.rule === "unused-dependency")?.filePath,
    ).toBe("packages/web/package.json");
    expectHeuristicCaveat(diagnostics);
  });

  it("uses an injected Knip CLI resolver before constructing the worker", async () => {
    const directory = setupProject("injected-knip-resolver", {
      "src/index.ts": "export const used = 1;\n",
    });
    let resolved = false;
    await checkDeadCode({
      rootDirectory: directory,
      resolveKnipCliPath: () => {
        resolved = true;
        return "C:\\isolated-store\\knip\\bin\\knip.js";
      },
      createWorker: (input) => {
        expect(input.knipCliPath).toBe("C:\\isolated-store\\knip\\bin\\knip.js");
        return { result: Promise.resolve({ issues: [] }) };
      },
    });
    expect(resolved).toBe(true);
  });

  it("forwards Knip configuration hints without corrupting its JSON reporter output", async () => {
    const orphanFiles = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [
        `src/orphan-${index}.ts`,
        `export const orphan${index} = ${index};\n`,
      ]),
    );
    const directory = setupProject("knip-hints", {
      "src/index.ts": "export const used = 1;\n",
      "knip.json": JSON.stringify({
        entry: ["src/index.ts"],
        project: ["src/**/*.ts"],
      }),
      ...orphanFiles,
    });
    let stderr = "";
    const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    try {
      const diagnostics = await checkDeadCode({ rootDirectory: directory });
      expect(diagnostics.length).toBeGreaterThan(20);
    } finally {
      write.mockRestore();
    }
    expect(stderr).toContain("Configuration hints");
  });

  it("includes Knip configuration failures in the rejected analysis reason", async () => {
    const directory = setupProject("invalid-knip-config", {
      "src/index.ts": "export const used = 1;\n",
      "knip.json": "{ this is invalid json",
    });
    await expect(checkDeadCode({ rootDirectory: directory })).rejects.toThrow(
      "Knip exited with code 2",
    );
  });

  it("rejects malformed worker results instead of silently dropping diagnostics", async () => {
    const directory = setupProject("malformed-worker-result", {
      "src/index.ts": "export const used = 1;\n",
    });

    await expect(
      checkDeadCode({
        rootDirectory: directory,
        createWorker: () => ({
          result: Promise.resolve({
            issues: [{ file: "src/index.ts", files: [{ name: 1 }] }],
          }),
        }),
      }),
    ).rejects.toThrow("issues[0].files[0].name");
  });

  it("times out a stuck worker", async () => {
    const directory = setupProject("stuck-worker", {
      "src/index.ts": "export const used = 1;\n",
    });
    let didTerminate = false;

    await expect(
      checkDeadCode({
        rootDirectory: directory,
        createWorker: () => ({
          result: new Promise(() => {}),
          terminate: () => {
            didTerminate = true;
          },
        }),
        workerTimeoutMs: 1,
      }),
    ).rejects.toThrow("Dead-code worker timed out");
    expect(didTerminate).toBe(true);
  });

  // Knip resolves project configuration from the scan root, so the alias
  // fixtures exercise both the configured entry point and path aliases.
  describe.skipIf(process.platform === "win32")("import-graph resolution (POSIX)", () => {
    it("does not flag files imported only through @/* tsconfig path aliases", async () => {
      // Canonicalize so this case isolates alias resolution from the
      // symlinked-root case below (`os.tmpdir()` is itself a symlink into
      // /private on macOS).
      const directory = fs.realpathSync(setupAliasProject("alias-imports"));
      expect(await flaggedUnusedFiles(directory)).toEqual([]);
    });

    it("does not mis-flag imports when the scan root is reached through a symlink", async () => {
      const realDirectory = setupAliasProject("symlinked-real");
      const linkedDirectory = path.join(tempRoot, "symlinked-link");
      fs.symlinkSync(realDirectory, linkedDirectory);
      expect(await flaggedUnusedFiles(linkedDirectory)).toEqual([]);
    });
  });
});
