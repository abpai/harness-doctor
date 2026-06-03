import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  checkDocsStructure,
  ENTRY_POINT_MAX_LINES,
  MONOLITHIC_DOC_MAX_LINES,
} from "@harness-doctor/core";

const ENTRY_POINT_EXISTS_RULE_KEY = "docs-structure/entry-point-exists";
const ENTRY_POINT_IS_A_MAP_RULE_KEY = "docs-structure/entry-point-is-a-map";
const DOCS_DIRECTORY_EXISTS_RULE_KEY = "docs-structure/docs-directory-exists";
const ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY = "docs-structure/entry-point-links-into-docs";
const NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY = "docs-structure/no-monolithic-instruction-file";

// Absolute path to this repo's root (packages/core/tests → up 3). The repo
// itself is the canonical PASSING fixture: a short AGENTS.md that links
// into a populated docs/, with no monolithic doc.
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

const markdownLines = (count: number): string =>
  Array.from({ length: count }, (_lineValue, lineIndex) => `Line ${lineIndex + 1} of content.`).join(
    "\n",
  );

interface FixtureLayout {
  readonly entryPoint?: { readonly filename: string; readonly contents: string };
  readonly docs?: ReadonlyArray<{ readonly filename: string; readonly contents: string }>;
  readonly rootMarkdown?: ReadonlyArray<{ readonly filename: string; readonly contents: string }>;
}

describe("checkDocsStructure", () => {
  let temporaryRoot: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-docs-structure-"));
  });

  afterEach(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  const writeLayout = (layout: FixtureLayout): string => {
    if (layout.entryPoint) {
      fs.writeFileSync(
        path.join(temporaryRoot, layout.entryPoint.filename),
        layout.entryPoint.contents,
      );
    }
    for (const rootFile of layout.rootMarkdown ?? []) {
      fs.writeFileSync(path.join(temporaryRoot, rootFile.filename), rootFile.contents);
    }
    if (layout.docs !== undefined) {
      const docsDirectory = path.join(temporaryRoot, "docs");
      fs.mkdirSync(docsDirectory, { recursive: true });
      for (const docFile of layout.docs) {
        fs.writeFileSync(path.join(docsDirectory, docFile.filename), docFile.contents);
      }
    }
    return temporaryRoot;
  };

  const ruleKeysFor = (rootDirectory: string): string[] =>
    checkDocsStructure(rootDirectory).map((diagnostic) => diagnostic.rule);

  // ── Passing layouts (must NOT flag) ───────────────────────────────────

  it("this repo's own root passes every docs-structure check", () => {
    expect(checkDocsStructure(REPO_ROOT)).toEqual([]);
  });

  it("a short entry-point that links into a populated docs/ flags nothing", () => {
    const rootDirectory = writeLayout({
      entryPoint: {
        filename: "AGENTS.md",
        contents: "# Project\n\nThis is a map. See docs/guide.md for detail.\n",
      },
      docs: [{ filename: "guide.md", contents: "# Guide\n\nDetail lives here.\n" }],
    });
    expect(checkDocsStructure(rootDirectory)).toEqual([]);
  });

  it("accepts a markdown-link reference like [guide](docs/guide.md)", () => {
    const rootDirectory = writeLayout({
      entryPoint: {
        filename: "AGENTS.md",
        contents: "# Project\n\nSee [the guide](docs/guide.md).\n",
      },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("accepts a `./docs/...` relative reference", () => {
    const rootDirectory = writeLayout({
      entryPoint: {
        filename: "AGENTS.md",
        contents: "# Project\n\nRead ./docs/guide.md before editing.\n",
      },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("accepts CLAUDE.md as the entry-point fallback", () => {
    const rootDirectory = writeLayout({
      entryPoint: {
        filename: "CLAUDE.md",
        contents: "# Project\n\nSee docs/guide.md.\n",
      },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    expect(checkDocsStructure(rootDirectory)).toEqual([]);
  });

  it("a docs file at exactly the monolith threshold does not flag", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n\nSee docs/big.md.\n" },
      docs: [{ filename: "big.md", contents: markdownLines(MONOLITHIC_DOC_MAX_LINES) }],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY);
  });

  // ── Violating layouts (must flag) ─────────────────────────────────────

  it("flags entry-point-exists when no entry-point file is present", () => {
    const rootDirectory = writeLayout({
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    const ruleKeys = ruleKeysFor(rootDirectory);
    expect(ruleKeys).toContain(ENTRY_POINT_EXISTS_RULE_KEY);
    // With no entry-point, the map/links checks must stay silent (nothing to measure).
    expect(ruleKeys).not.toContain(ENTRY_POINT_IS_A_MAP_RULE_KEY);
    expect(ruleKeys).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("flags entry-point-is-a-map when the entry-point exceeds the line threshold", () => {
    const longBody = markdownLines(ENTRY_POINT_MAX_LINES + 1);
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: `See docs/guide.md.\n${longBody}` },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === ENTRY_POINT_IS_A_MAP_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain(String(ENTRY_POINT_MAX_LINES + 2));
  });

  it("flags docs-directory-exists when docs/ is missing", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n" },
    });
    expect(ruleKeysFor(rootDirectory)).toContain(DOCS_DIRECTORY_EXISTS_RULE_KEY);
  });

  it("flags docs-directory-exists when docs/ exists but holds no markdown", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n" },
      docs: [{ filename: "notes.txt", contents: "not markdown" }],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === DOCS_DIRECTORY_EXISTS_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain("no markdown file");
  });

  it("flags entry-point-links-into-docs when the entry-point never references docs/", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n\nNo references here.\n" },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    expect(ruleKeysFor(rootDirectory)).toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("does NOT flag entry-point-links-into-docs when docs/ is absent (missing-docs check owns it)", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n\nNo references here.\n" },
    });
    const ruleKeys = ruleKeysFor(rootDirectory);
    expect(ruleKeys).toContain(DOCS_DIRECTORY_EXISTS_RULE_KEY);
    expect(ruleKeys).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("flags no-monolithic-instruction-file for an oversized docs/ file", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n\nSee docs/big.md.\n" },
      docs: [{ filename: "big.md", contents: markdownLines(MONOLITHIC_DOC_MAX_LINES + 1) }],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.filePath).toBe("docs/big.md");
  });

  it("flags an oversized root-level instruction file other than the entry-point", () => {
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n\nSee docs/guide.md.\n" },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
      rootMarkdown: [
        { filename: "CONTRIBUTING.md", contents: markdownLines(MONOLITHIC_DOC_MAX_LINES + 5) },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.filePath).toBe("CONTRIBUTING.md");
  });

  it("does NOT double-flag the entry-point as a monolith (entry-point-is-a-map owns it)", () => {
    const longBody = markdownLines(MONOLITHIC_DOC_MAX_LINES + 1);
    const rootDirectory = writeLayout({
      entryPoint: { filename: "AGENTS.md", contents: `See docs/guide.md.\n${longBody}` },
      docs: [{ filename: "guide.md", contents: "# Guide\n" }],
    });
    const monolithFlags = checkDocsStructure(rootDirectory).filter(
      (diagnostic) =>
        diagnostic.rule === NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY &&
        diagnostic.filePath === "AGENTS.md",
    );
    expect(monolithFlags).toHaveLength(0);
  });

  // ── Shape / metadata invariants ───────────────────────────────────────

  it("emits Maintainability warnings under the harness-doctor plugin for every finding", () => {
    const rootDirectory = writeLayout({});
    const diagnostics = checkDocsStructure(rootDirectory);
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.plugin).toBe("harness-doctor");
      expect(diagnostic.severity).toBe("warning");
      expect(diagnostic.category).toBe("Maintainability");
      expect(diagnostic.rule.startsWith("docs-structure/")).toBe(true);
      expect(diagnostic.message.length).toBeGreaterThan(0);
      expect(diagnostic.help.length).toBeGreaterThan(0);
    }
  });

  it("returns the missing-entry-point and missing-docs findings for a bare directory", () => {
    const rootDirectory = writeLayout({});
    const ruleKeys = ruleKeysFor(rootDirectory);
    expect(ruleKeys).toContain(ENTRY_POINT_EXISTS_RULE_KEY);
    expect(ruleKeys).toContain(DOCS_DIRECTORY_EXISTS_RULE_KEY);
  });

  it("never throws on a missing project directory", () => {
    const missing = path.join(temporaryRoot, "does-not-exist");
    expect(() => checkDocsStructure(missing)).not.toThrow();
    expect(ruleKeysFor(missing)).toContain(ENTRY_POINT_EXISTS_RULE_KEY);
  });
});
