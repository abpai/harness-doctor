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
const DOCS_INDEX_EXISTS_RULE_KEY = "docs-structure/docs-index-exists";
const ARCHITECTURE_MAP_EXISTS_RULE_KEY = "docs-structure/architecture-map-exists";
const SINGLE_CANONICAL_GLOSSARY_RULE_KEY = "docs-structure/single-canonical-glossary";
const SPEC_CONTRACT_EXISTS_RULE_KEY = "docs-structure/spec-contract-exists";
const SPEC_CONTRACT_SECTIONS_RULE_KEY = "docs-structure/spec-contract-has-required-sections";
const SPEC_CONTRACT_SUFFICIENCY_RULE_KEY =
  "docs-structure/spec-contract-declares-grader-sufficiency";
const ENGINEERING_DOCS_EXIST_RULE_KEY = "docs-structure/engineering-docs-exist";
const NO_STRUCTURE_MD_RULE_KEY = "docs-structure/no-structure-md";
const AGENTS_BYTE_BUDGET_RULE_KEY = "docs-structure/agents-md-within-byte-budget";
const CLAUDE_SHIM_RULE_KEY = "docs-structure/claude-shim-imports-agents";
const TODOS_INDEX_EXISTS_RULE_KEY = "docs-structure/todos-index-exists";
const DOMAIN_DOCS_COMPLETE_RULE_KEY = "docs-structure/domain-docs-complete";
const BANNED_LONG_LIVED_PATH_RULE_KEY = "docs-structure/no-banned-long-lived-path";
const MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY = "docs-structure/markdown-link-target-exists";
const TODO_SPEC_SECTIONS_RULE_KEY = "docs-structure/todo-spec-has-required-sections";

// Absolute path to this repo's root (packages/core/tests → up 3). The repo
// itself is the canonical PASSING fixture: a short AGENTS.md that links
// into a populated docs/, with no monolithic doc.
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

const markdownLines = (count: number): string =>
  Array.from(
    { length: count },
    (_lineValue, lineIndex) => `Line ${lineIndex + 1} of content.`,
  ).join("\n");

interface FixtureFile {
  readonly filename: string;
  readonly contents: string;
}

interface FixtureLayout {
  readonly entryPoint?: { readonly filename: string; readonly contents: string };
  readonly docs?: ReadonlyArray<FixtureFile>;
  readonly rootMarkdown?: ReadonlyArray<FixtureFile>;
  readonly rootFiles?: ReadonlyArray<FixtureFile>;
  readonly directories?: ReadonlyArray<string>;
}

const cleanDocs: ReadonlyArray<FixtureFile> = [
  {
    filename: "INDEX.md",
    contents:
      "# Documentation index\n\n- [Architecture](ARCHITECTURE.md)\n- [Glossary](GLOSSARY.md)\n",
  },
  {
    filename: "ARCHITECTURE.md",
    contents: "# Architecture\n\nCurrent system shape lives here.\n",
  },
  {
    filename: "GLOSSARY.md",
    contents: "# Glossary\n\n| Term | Definition | Aliases to avoid |\n| --- | --- | --- |\n",
  },
  { filename: "guide.md", contents: "# Guide\n\nDetail lives here.\n" },
  {
    filename: "SPEC_CONTRACT.md",
    contents:
      "# Spec contract\n\n## Quality bar\n\n- Self-contained.\n\n## Proof menu\n\n| Change type | Validation command | Proof artifact | Sufficiency |\n| --- | --- | --- | --- |\n| logic | `pnpm test` | passing run | auto |\n\n## Escalation boundaries\n\n- Stop on irreversible actions.\n",
  },
];

// Same shape as cleanDocs but with a proof menu that omits the Sufficiency
// column — the fixture for the docsContract-gated sufficiency check.
const SPEC_CONTRACT_WITHOUT_SUFFICIENCY =
  "# Spec contract\n\n## Quality bar\n\n- Self-contained.\n\n## Proof menu\n\n| Change type | Validation command | Proof artifact |\n| --- | --- | --- |\n| logic | `pnpm test` | passing run |\n\n## Escalation boundaries\n\n- Stop on irreversible actions.\n";

const docsWithoutSufficiencyColumn: ReadonlyArray<FixtureFile> = cleanDocs.map((docFile) =>
  docFile.filename === "SPEC_CONTRACT.md"
    ? { filename: "SPEC_CONTRACT.md", contents: SPEC_CONTRACT_WITHOUT_SUFFICIENCY }
    : docFile,
);

// Proof menu has no Sufficiency column, but a `sufficiency` alias appears in a
// data cell of an UNRELATED table later in the file — the check must still
// flag, proving detection is scoped to the proof-menu header row.
const SPEC_CONTRACT_SUFFICIENCY_ONLY_IN_STRAY_TABLE =
  "# Spec contract\n\n## Quality bar\n\n- Self-contained.\n\n## Proof menu\n\n| Change type | Validation command | Proof artifact |\n| --- | --- | --- |\n| logic | `pnpm test` | passing run |\n\n## Escalation boundaries\n\n- Stop on irreversible actions.\n\n## Notes\n\n| Field | Value |\n| --- | --- |\n| sufficiency | tracked elsewhere |\n";

const docsWithStraySufficiencyCell: ReadonlyArray<FixtureFile> = cleanDocs.map((docFile) =>
  docFile.filename === "SPEC_CONTRACT.md"
    ? { filename: "SPEC_CONTRACT.md", contents: SPEC_CONTRACT_SUFFICIENCY_ONLY_IN_STRAY_TABLE }
    : docFile,
);

const completeTodoSpec = `# Pricing entitlement copy

## Status

Open

## Scope

- Compare copy to entitlement mapping.

## Start here

| Task | Start here |
| --- | --- |
| Compare copy | \`apps/web\` |

## Invariants

- Copy must match entitlements.

## Validation

| Change type | Required validation |
| --- | --- |
| Copy | entitlement check |

## Close when

- Validation passes.
`;

describe("checkDocsStructure", () => {
  let temporaryRoot: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-docs-structure-"));
  });

  afterEach(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  const writeFile = (relativePath: string, contents: string): void => {
    const filePath = path.join(temporaryRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  };

  const writeLayout = (layout: FixtureLayout): string => {
    if (layout.entryPoint) {
      writeFile(layout.entryPoint.filename, layout.entryPoint.contents);
    }
    for (const rootFile of [...(layout.rootMarkdown ?? []), ...(layout.rootFiles ?? [])]) {
      writeFile(rootFile.filename, rootFile.contents);
    }
    for (const directory of layout.directories ?? []) {
      fs.mkdirSync(path.join(temporaryRoot, directory), { recursive: true });
    }
    if (layout.docs !== undefined) {
      for (const docFile of layout.docs) {
        writeFile(path.join("docs", docFile.filename), docFile.contents);
      }
    }
    return temporaryRoot;
  };

  const writeCleanLayout = (overrides: Partial<FixtureLayout> = {}): string =>
    writeLayout({
      entryPoint: {
        filename: "AGENTS.md",
        contents: "# Project\n\nThis is a map. See docs/INDEX.md for detail.\n",
      },
      docs: cleanDocs,
      ...overrides,
    });

  const ruleKeysFor = (rootDirectory: string): string[] =>
    checkDocsStructure(rootDirectory).map((diagnostic) => diagnostic.rule);

  // ── Passing layouts (must NOT flag) ───────────────────────────────────

  it("this repo's own root passes every docs-structure check", () => {
    expect(checkDocsStructure(REPO_ROOT)).toEqual([]);
  });

  it("a short entry-point that links into a populated docs/ flags nothing", () => {
    const rootDirectory = writeCleanLayout();
    expect(checkDocsStructure(rootDirectory)).toEqual([]);
  });

  it("accepts a markdown-link reference like [guide](docs/guide.md)", () => {
    const rootDirectory = writeCleanLayout({
      entryPoint: {
        filename: "AGENTS.md",
        contents: "# Project\n\nSee [the docs index](docs/INDEX.md).\n",
      },
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("accepts a `./docs/...` relative reference", () => {
    const rootDirectory = writeCleanLayout({
      entryPoint: {
        filename: "AGENTS.md",
        contents: "# Project\n\nRead ./docs/INDEX.md before editing.\n",
      },
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("accepts CLAUDE.md as the entry-point fallback", () => {
    const rootDirectory = writeCleanLayout({
      entryPoint: {
        filename: "CLAUDE.md",
        contents: "# Project\n\nSee docs/INDEX.md.\n",
      },
    });
    expect(checkDocsStructure(rootDirectory)).toEqual([]);
  });

  it("a docs file at exactly the monolith threshold does not flag", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "big.md", contents: markdownLines(MONOLITHIC_DOC_MAX_LINES) },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY);
  });

  it("accepts complete domain docs and complete todo specs", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "todos/INDEX.md", contents: "# Todo specs\n\n- pricing.md\n" },
        { filename: "todos/pricing.md", contents: completeTodoSpec },
        { filename: "domains/pricing/INDEX.md", contents: "# Pricing domain\n" },
        { filename: "domains/pricing/code-map.md", contents: "# Pricing code map\n" },
        { filename: "domains/pricing/invariants.md", contents: "# Pricing invariants\n" },
        { filename: "domains/pricing/test-map.md", contents: "# Pricing validation\n" },
        { filename: "engineering/commands.md", contents: "# Commands\n\n- `pnpm test`\n" },
        {
          filename: "engineering/testing.md",
          contents: "# Validation\n\n| Change type | Required validation |\n| --- | --- |\n",
        },
      ],
    });
    expect(checkDocsStructure(rootDirectory, { docsContract: true })).toEqual([]);
  });

  it("does NOT flag a CLAUDE.md shim that imports AGENTS.md", () => {
    const rootDirectory = writeCleanLayout({
      rootMarkdown: [{ filename: "CLAUDE.md", contents: "@AGENTS.md\n" }],
    });
    expect(checkDocsStructure(rootDirectory)).toEqual([]);
  });

  it("does NOT flag docs/adr (an existing ADR convention is preserved, not banned)", () => {
    const rootDirectory = writeCleanLayout({ directories: ["docs/adr"] });
    expect(ruleKeysFor(rootDirectory)).not.toContain(BANNED_LONG_LIVED_PATH_RULE_KEY);
  });

  it("does NOT flag a missing glossary (earned surface, not a default)", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs
        .filter((docFile) => docFile.filename !== "GLOSSARY.md")
        .map((docFile) =>
          docFile.filename === "INDEX.md"
            ? {
                filename: "INDEX.md",
                contents: "# Documentation index\n\n- [Architecture](ARCHITECTURE.md)\n",
              }
            : docFile,
        ),
    });
    expect(checkDocsStructure(rootDirectory)).toEqual([]);
  });

  // ── Violating layouts (must flag) ─────────────────────────────────────

  it("flags entry-point-exists when no entry-point file is present", () => {
    const rootDirectory = writeLayout({
      docs: cleanDocs,
    });
    const ruleKeys = ruleKeysFor(rootDirectory);
    expect(ruleKeys).toContain(ENTRY_POINT_EXISTS_RULE_KEY);
    // With no entry-point, the map/links checks must stay silent (nothing to measure).
    expect(ruleKeys).not.toContain(ENTRY_POINT_IS_A_MAP_RULE_KEY);
    expect(ruleKeys).not.toContain(ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY);
  });

  it("flags entry-point-is-a-map when the entry-point exceeds the line threshold", () => {
    const longBody = markdownLines(ENTRY_POINT_MAX_LINES + 1);
    const rootDirectory = writeCleanLayout({
      entryPoint: { filename: "AGENTS.md", contents: `See docs/INDEX.md.\n${longBody}` },
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
    const rootDirectory = writeCleanLayout({
      entryPoint: { filename: "AGENTS.md", contents: "# Map\n\nNo references here.\n" },
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
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "big.md", contents: markdownLines(MONOLITHIC_DOC_MAX_LINES + 1) },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.filePath).toBe("docs/big.md");
  });

  it("flags an oversized root-level instruction file other than the entry-point", () => {
    const rootDirectory = writeCleanLayout({
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
    const rootDirectory = writeCleanLayout({
      entryPoint: { filename: "AGENTS.md", contents: `See docs/INDEX.md.\n${longBody}` },
    });
    const monolithFlags = checkDocsStructure(rootDirectory).filter(
      (diagnostic) =>
        diagnostic.rule === NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY &&
        diagnostic.filePath === "AGENTS.md",
    );
    expect(monolithFlags).toHaveLength(0);
  });

  it("flags a missing docs/INDEX.md", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs.filter((docFile) => docFile.filename !== "INDEX.md"),
    });
    expect(ruleKeysFor(rootDirectory)).toContain(DOCS_INDEX_EXISTS_RULE_KEY);
  });

  it("does NOT flag docs-index-exists when docs/INDEX.md uses the canonical case", () => {
    const rootDirectory = writeCleanLayout();
    expect(ruleKeysFor(rootDirectory)).not.toContain(DOCS_INDEX_EXISTS_RULE_KEY);
  });

  it("hints to rename a lowercase docs/index.md instead of reporting a generic missing index", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs.map((docFile) =>
        docFile.filename === "INDEX.md" ? { ...docFile, filename: "index.md" } : docFile,
      ),
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === DOCS_INDEX_EXISTS_RULE_KEY,
    );
    expect(flagged?.filePath).toBe("docs/index.md");
    expect(flagged?.message).toContain("Found `docs/index.md`");
    expect(flagged?.message).toContain("rename to `docs/INDEX.md`");
    expect(flagged?.help).toContain("Rename `docs/index.md` to `docs/INDEX.md`");
  });

  it("flags a missing docs/ARCHITECTURE.md", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs.filter((docFile) => docFile.filename !== "ARCHITECTURE.md"),
    });
    expect(ruleKeysFor(rootDirectory)).toContain(ARCHITECTURE_MAP_EXISTS_RULE_KEY);
  });

  it("flags a missing docs/SPEC_CONTRACT.md", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs.filter((docFile) => docFile.filename !== "SPEC_CONTRACT.md"),
    });
    expect(ruleKeysFor(rootDirectory)).toContain(SPEC_CONTRACT_EXISTS_RULE_KEY);
  });

  it("flags a spec contract missing required sections", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs.map((docFile) =>
        docFile.filename === "SPEC_CONTRACT.md"
          ? {
              filename: "SPEC_CONTRACT.md",
              contents: "# Spec contract\n\n## Quality bar\n\n- Self-contained.\n",
            }
          : docFile,
      ),
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === SPEC_CONTRACT_SECTIONS_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain("proof menu");
    expect(flagged?.message).toContain("escalation boundaries");
  });

  it("flags spec-contract-declares-grader-sufficiency when the proof menu has no Sufficiency column under the docs contract", () => {
    const rootDirectory = writeCleanLayout({ docs: docsWithoutSufficiencyColumn });
    const flagged = checkDocsStructure(rootDirectory, { docsContract: true }).filter(
      (diagnostic) => diagnostic.rule === SPEC_CONTRACT_SUFFICIENCY_RULE_KEY,
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.filePath).toBe("docs/SPEC_CONTRACT.md");
    expect(flagged[0]?.message).toContain("Sufficiency column");
  });

  it("does NOT flag spec-contract-declares-grader-sufficiency when the proof menu declares a Sufficiency column", () => {
    const rootDirectory = writeCleanLayout();
    const ruleKeys = checkDocsStructure(rootDirectory, { docsContract: true }).map(
      (diagnostic) => diagnostic.rule,
    );
    expect(ruleKeys).not.toContain(SPEC_CONTRACT_SUFFICIENCY_RULE_KEY);
  });

  it("does NOT flag spec-contract-declares-grader-sufficiency when docsContract is unset", () => {
    const rootDirectory = writeCleanLayout({ docs: docsWithoutSufficiencyColumn });
    expect(ruleKeysFor(rootDirectory)).not.toContain(SPEC_CONTRACT_SUFFICIENCY_RULE_KEY);
  });

  it("does NOT flag spec-contract-declares-grader-sufficiency when SPEC_CONTRACT.md is absent (spec-contract-exists owns that gap)", () => {
    const rootDirectory = writeCleanLayout({
      docs: cleanDocs.filter((docFile) => docFile.filename !== "SPEC_CONTRACT.md"),
    });
    const ruleKeys = checkDocsStructure(rootDirectory, { docsContract: true }).map(
      (diagnostic) => diagnostic.rule,
    );
    expect(ruleKeys).toContain(SPEC_CONTRACT_EXISTS_RULE_KEY);
    expect(ruleKeys).not.toContain(SPEC_CONTRACT_SUFFICIENCY_RULE_KEY);
  });

  it("flags spec-contract-declares-grader-sufficiency when a sufficiency alias appears only outside the proof-menu header", () => {
    const rootDirectory = writeCleanLayout({ docs: docsWithStraySufficiencyCell });
    const flagged = checkDocsStructure(rootDirectory, { docsContract: true }).filter(
      (diagnostic) => diagnostic.rule === SPEC_CONTRACT_SUFFICIENCY_RULE_KEY,
    );
    expect(flagged).toHaveLength(1);
  });

  it("flags missing engineering docs only under the docs contract", () => {
    const rootDirectory = writeCleanLayout();
    expect(ruleKeysFor(rootDirectory)).not.toContain(ENGINEERING_DOCS_EXIST_RULE_KEY);
    const contractRuleKeys = checkDocsStructure(rootDirectory, { docsContract: true }).map(
      (diagnostic) => diagnostic.rule,
    );
    expect(contractRuleKeys).toContain(ENGINEERING_DOCS_EXIST_RULE_KEY);
  });

  it("flags STRUCTURE.md as a non-canonical structure map", () => {
    const rootDirectory = writeCleanLayout({
      rootMarkdown: [{ filename: "STRUCTURE.md", contents: "# Structure\n\nA parallel map.\n" }],
    });
    expect(ruleKeysFor(rootDirectory)).toContain(NO_STRUCTURE_MD_RULE_KEY);
  });

  it("flags combined AGENTS.md content over the Codex byte budget", () => {
    const oversized = `See docs/INDEX.md.\n${"x".repeat(33_000)}\n`;
    const rootDirectory = writeCleanLayout({
      entryPoint: { filename: "AGENTS.md", contents: oversized },
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === AGENTS_BYTE_BUDGET_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain("32768");
  });

  it("counts nested AGENTS.md files toward the combined byte budget", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: "packages/api/AGENTS.md", contents: `# API\n${"y".repeat(33_000)}\n` },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).toContain(AGENTS_BYTE_BUDGET_RULE_KEY);
  });

  it("does not flag sibling AGENTS.md files when no root→leaf chain exceeds the budget", () => {
    // 30 × 2 KB siblings sum to ~60 KB repo-wide, but Codex only ever loads
    // root + one package per session (~2.1 KB), so no chain is over budget.
    const rootDirectory = writeCleanLayout({
      rootFiles: Array.from({ length: 30 }, (_unused, packageIndex) => ({
        filename: `packages/pkg-${packageIndex}/AGENTS.md`,
        contents: `# Package ${packageIndex}\n${"z".repeat(2_000)}\n`,
      })),
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(AGENTS_BYTE_BUDGET_RULE_KEY);
  });

  it("points the byte-budget diagnostic at the heaviest file on the offending chain", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: "packages/api/AGENTS.md", contents: `# API\n${"y".repeat(33_000)}\n` },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === AGENTS_BYTE_BUDGET_RULE_KEY,
    );
    expect(flagged?.filePath).toBe("packages/api/AGENTS.md");
    expect(flagged?.message).toContain("packages/api");
  });

  it("ignores markdown inside build-output directories", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: "dist/notes.md", contents: "[gone](./missing-target.md)\n" },
        { filename: "coverage/AGENTS.md", contents: `# Coverage\n${"w".repeat(40_000)}\n` },
      ],
    });
    const ruleKeys = ruleKeysFor(rootDirectory);
    expect(ruleKeys).not.toContain(MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY);
    expect(ruleKeys).not.toContain(AGENTS_BYTE_BUDGET_RULE_KEY);
  });

  it("flags a CLAUDE.md beside AGENTS.md that never imports it", () => {
    const rootDirectory = writeCleanLayout({
      rootMarkdown: [
        { filename: "CLAUDE.md", contents: "# Claude\n\nFollow docs/INDEX.md closely.\n" },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).toContain(CLAUDE_SHIM_RULE_KEY);
  });

  it("flags a nested CLAUDE.md beside a nested AGENTS.md that never imports it", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: "packages/api/AGENTS.md", contents: "# API subtree\n\nLocal commands.\n" },
        { filename: "packages/api/CLAUDE.md", contents: "# Claude\n\nCompeting instructions.\n" },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === CLAUDE_SHIM_RULE_KEY,
    );
    expect(flagged?.filePath).toBe("packages/api/CLAUDE.md");
  });

  it("accepts a nested CLAUDE.md shim that imports its sibling AGENTS.md", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: "packages/api/AGENTS.md", contents: "# API subtree\n\nLocal commands.\n" },
        { filename: "packages/api/CLAUDE.md", contents: "@AGENTS.md\n" },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(CLAUDE_SHIM_RULE_KEY);
  });

  it("does not flag a nested CLAUDE.md without a sibling AGENTS.md", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: "packages/api/CLAUDE.md", contents: "# Claude-only folder context.\n" },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(CLAUDE_SHIM_RULE_KEY);
  });

  it("flags multiple canonical glossaries", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [{ filename: "UBIQUITOUS_LANGUAGE.md", contents: "# Ubiquitous language\n" }],
    });
    expect(ruleKeysFor(rootDirectory)).toContain(SINGLE_CANONICAL_GLOSSARY_RULE_KEY);
  });

  it("flags docs/todos/INDEX.md when the docs contract is enabled", () => {
    const rootDirectory = writeCleanLayout();
    expect(ruleKeysFor(rootDirectory)).not.toContain(TODOS_INDEX_EXISTS_RULE_KEY);
    expect(checkDocsStructure(rootDirectory, { docsContract: true }).map((d) => d.rule)).toContain(
      TODOS_INDEX_EXISTS_RULE_KEY,
    );
  });

  it("flags docs/todos/INDEX.md when a todos directory exists without an index", () => {
    const rootDirectory = writeCleanLayout({
      directories: ["docs/todos"],
    });
    expect(ruleKeysFor(rootDirectory)).toContain(TODOS_INDEX_EXISTS_RULE_KEY);
  });

  it("does NOT flag todos-index-exists when docs/todos/INDEX.md uses the canonical case", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "todos/INDEX.md", contents: "# Todo specs\n\n- pricing.md\n" },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(TODOS_INDEX_EXISTS_RULE_KEY);
  });

  it("hints to rename a lowercase docs/todos/index.md instead of reporting a generic missing todos index", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "todos/index.md", contents: "# Todo specs\n\n- pricing.md\n" },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === TODOS_INDEX_EXISTS_RULE_KEY,
    );
    expect(flagged?.filePath).toBe("docs/todos/index.md");
    expect(flagged?.message).toContain("Found `docs/todos/index.md`");
    expect(flagged?.message).toContain("rename to `docs/todos/INDEX.md`");
    expect(flagged?.help).toContain("Rename `docs/todos/index.md` to `docs/todos/INDEX.md`");
  });

  it("flags incomplete domain docs", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "domains/pricing/INDEX.md", contents: "# Pricing domain\n" },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === DOMAIN_DOCS_COMPLETE_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain("code-map.md");
    expect(flagged?.message).toContain("invariants.md");
    expect(flagged?.message).toContain("test-map.md");
  });

  it("flags banned long-lived harness paths", () => {
    const rootDirectory = writeCleanLayout({
      directories: ["docs/exec-plans"],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === BANNED_LONG_LIVED_PATH_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.filePath).toBe("docs/exec-plans");
  });

  it("flags markdown links to missing repo paths", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "broken.md", contents: "# Broken\n\nSee [missing](missing.md).\n" },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.filePath).toBe("docs/broken.md");
    expect(flagged?.message).toContain("missing.md");
  });

  it("ignores markdown under scratch directories, gitignored directories, and nested checkouts", () => {
    const rootDirectory = writeCleanLayout({
      rootFiles: [
        { filename: ".scratch/BIG.md", contents: "# Scratch\n\nSee [missing](missing.md).\n" },
        {
          filename: ".understand/NOTES.md",
          contents: "# Notes\n\nSee [missing](missing.md).\n",
        },
        { filename: "tmp/NOTES.md", contents: "# Temp\n\nSee [missing](missing.md).\n" },
        {
          filename: "vendor/checkout/README.md",
          contents: "# Checkout\n\nSee [missing](missing.md).\n",
        },
        { filename: ".gitignore", contents: "tmp/\n" },
      ],
    });
    fs.mkdirSync(path.join(rootDirectory, "vendor", "checkout", ".git"), { recursive: true });
    const markdownLinkFindings = checkDocsStructure(rootDirectory).filter(
      (diagnostic) => diagnostic.rule === MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY,
    );
    expect(markdownLinkFindings).toEqual([]);
  });

  it("ignores markdown links inside fenced code examples", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        {
          filename: "example.md",
          contents:
            "# Example\n\n```md\n- [Ordering](./src/ordering/CONTEXT.md)\n```\n\nActual text.\n",
        },
      ],
    });
    expect(ruleKeysFor(rootDirectory)).not.toContain(MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY);
  });

  it("flags todo specs missing required sections", () => {
    const rootDirectory = writeCleanLayout({
      docs: [
        ...cleanDocs,
        { filename: "todos/INDEX.md", contents: "# Todo specs\n\n- pricing.md\n" },
        { filename: "todos/pricing.md", contents: "# Pricing copy\n\n## Status\n\nOpen\n" },
      ],
    });
    const flagged = checkDocsStructure(rootDirectory).find(
      (diagnostic) => diagnostic.rule === TODO_SPEC_SECTIONS_RULE_KEY,
    );
    expect(flagged).toBeDefined();
    expect(flagged?.message).toContain("Scope");
    expect(flagged?.message).toContain("Validation");
    expect(flagged?.message).toContain("Close when");
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
