import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { inspect } from "../src/inspect.js";

describe("inspect", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), "harness-doctor-inspect-"));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  const writeFile = (relativePath: string, contents: string): void => {
    const filePath = path.join(projectRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  };

  const writeCleanDocsProject = (): void => {
    writeFile(
      "package.json",
      JSON.stringify({ name: "inspect-fixture", type: "module", dependencies: {} }, null, 2),
    );
    writeFile(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { target: "es2022", module: "esnext" } }, null, 2),
    );
    writeFile("AGENTS.md", "# Project\n\nMap. See docs/INDEX.md.\n");
    writeFile(
      "docs/INDEX.md",
      "# Documentation index\n\n- [Architecture](ARCHITECTURE.md)\n- [Guide](guide.md)\n",
    );
    writeFile("docs/ARCHITECTURE.md", "# Architecture\n\nCurrent shape.\n");
    writeFile(
      "docs/GLOSSARY.md",
      "# Glossary\n\n| Term | Definition | Aliases to avoid |\n| --- | --- | --- |\n",
    );
    writeFile("docs/guide.md", "# Guide\n\nDetail.\n");
    writeFile(
      "docs/SPEC_CONTRACT.md",
      "# Spec contract\n\n## Quality bar\n\n- Self-contained.\n\n## Proof menu\n\n| Change type | Validation command | Proof artifact |\n| --- | --- | --- |\n| logic | `pnpm test` | passing run |\n\n## Escalation boundaries\n\n- Stop on irreversible actions.\n",
    );
    writeFile("src/index.ts", "export const used = 1;\n");
    writeFile("src/dynamic-fixture.ts", "export const dynamicallyLoaded = 1;\n");
  };

  it("honors configOverride.deadCode=false without running the dead-code family", async () => {
    writeCleanDocsProject();

    const result = await inspect(projectRoot, {
      configOverride: { deadCode: false },
      noScore: true,
      silent: true,
      suppressRendering: true,
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.plugin)).not.toContain("deslop");
  });

  it("honors configOverride.baselineCheck=true", async () => {
    writeCleanDocsProject();

    const result = await inspect(projectRoot, {
      configOverride: { baselineCheck: true, deadCode: false },
      noScore: true,
      silent: true,
      suppressRendering: true,
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toContain(
      "docs-structure/behavior-baseline-artifacts-exist",
    );
  });
});
