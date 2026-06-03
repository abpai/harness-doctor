import fs from "node:fs";
import path from "node:path";
import {
  AGENT_ENTRY_POINT_FILENAMES,
  DOCS_DIRECTORY_NAME,
  ENTRY_POINT_MAX_LINES,
  ENTRY_POINT_MIN_DOCS_LINKS,
  MONOLITHIC_DOC_MAX_LINES,
} from "../constants.js";
import { isDirectory, isFile, readDirectoryEntries } from "../project-info/index.js";
import type { Diagnostic } from "../types/index.js";

const MARKDOWN_FILE_PATTERN = /\.md$/i;

const ENTRY_POINT_EXISTS_RULE_KEY = "docs-structure/entry-point-exists";
const ENTRY_POINT_IS_A_MAP_RULE_KEY = "docs-structure/entry-point-is-a-map";
const DOCS_DIRECTORY_EXISTS_RULE_KEY = "docs-structure/docs-directory-exists";
const ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY = "docs-structure/entry-point-links-into-docs";
const NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY = "docs-structure/no-monolithic-instruction-file";

interface BuildDiagnosticInput {
  readonly filePath: string;
  readonly rule: string;
  readonly message: string;
  readonly help: string;
  readonly line?: number;
  readonly column?: number;
}

// Every docs-structure diagnostic shares plugin / severity / category so
// the group reads as one rule family; only the rule key, file, and prose
// differ between checks. Mirrors `buildHardeningDiagnostic` in the
// supply-chain template.
const buildDocsStructureDiagnostic = (input: BuildDiagnosticInput): Diagnostic => ({
  filePath: input.filePath,
  plugin: "harness-doctor",
  rule: input.rule,
  severity: "warning",
  message: input.message,
  help: input.help,
  line: input.line ?? 0,
  column: input.column ?? 0,
  category: "Maintainability",
});

// Number of non-blank lines in a markdown body — the unit every length
// threshold here is denominated in. Blank lines don't add reading cost,
// so they don't count toward the "map not a manual" / monolith limits.
const countNonBlankLines = (content: string): number =>
  content.split(/\r?\n/).filter((lineText) => lineText.trim().length > 0).length;

// Best-effort read; a file we can't read is treated as absent rather than
// crashing the scan (a check must never throw).
const readFileOrNull = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
};

// The first configured entry-point filename that exists at the repo root,
// or `null` when none do. Detection order is `AGENT_ENTRY_POINT_FILENAMES`
// (AGENTS.md first, vendor fallbacks after): a repo only needs one.
const resolveEntryPointFilename = (rootDirectory: string): string | null =>
  AGENT_ENTRY_POINT_FILENAMES.find((filename) => isFile(path.join(rootDirectory, filename))) ??
  null;

// Markdown links (`[text](target)`) plus bare / inline-code relative path
// references (`docs/foo.md`, `./docs/foo.md`, `` `docs/foo.md` ``) whose
// target resolves under `docs/`. Covers the rendered-link form and the
// prose-mention form a short map tends to use. The leading group requires
// a non-path boundary before the optional `./` so a mid-path substring
// like `mydocs/` never counts, while still allowing the common delimiters
// (whitespace, `(`, `` ` ``, `[`, quotes) that precede a real reference.
const DOCS_REFERENCE_PATTERN = new RegExp(
  String.raw`(?:^|[\s(\[\`'"])\.?/?(${DOCS_DIRECTORY_NAME}/[^\s)\`'"\]]+)`,
  "g",
);

const countDocsReferences = (entryPointContent: string): number => {
  let referenceCount = 0;
  for (const match of entryPointContent.matchAll(DOCS_REFERENCE_PATTERN)) {
    if (match[1] !== undefined) referenceCount += 1;
  }
  return referenceCount;
};

// ── docs-structure/entry-point-exists ──────────────────────────────────
const checkEntryPointExists = (entryPointFilename: string | null): Diagnostic[] => {
  if (entryPointFilename !== null) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: AGENT_ENTRY_POINT_FILENAMES[0],
      rule: ENTRY_POINT_EXISTS_RULE_KEY,
      message:
        "No agent entry-point file at the repo root — an agent harness with no top-level instructions file forces every agent to rediscover the project's conventions from scratch",
      help: `Add an \`${AGENT_ENTRY_POINT_FILENAMES[0]}\` at the repo root (or one of: ${AGENT_ENTRY_POINT_FILENAMES.join(
        ", ",
      )}) that maps the project and links into \`${DOCS_DIRECTORY_NAME}/\` for detail`,
    }),
  ];
};

// ── docs-structure/entry-point-is-a-map ─────────────────────────────────
const checkEntryPointIsAMap = (
  rootDirectory: string,
  entryPointFilename: string | null,
): Diagnostic[] => {
  if (entryPointFilename === null) return [];
  const content = readFileOrNull(path.join(rootDirectory, entryPointFilename));
  if (content === null) return [];
  const lineCount = countNonBlankLines(content);
  if (lineCount <= ENTRY_POINT_MAX_LINES) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: entryPointFilename,
      rule: ENTRY_POINT_IS_A_MAP_RULE_KEY,
      message: `${entryPointFilename} is ${lineCount} non-blank lines — a long entry-point is a monolithic manual that defeats progressive disclosure; it should be a short map that delegates detail to \`${DOCS_DIRECTORY_NAME}/\``,
      help: `Trim \`${entryPointFilename}\` to a short map (target ${ENTRY_POINT_MAX_LINES} lines or fewer) and move the detail it carries into focused files under \`${DOCS_DIRECTORY_NAME}/\``,
    }),
  ];
};

// ── docs-structure/docs-directory-exists ────────────────────────────────
const checkDocsDirectoryExists = (rootDirectory: string): Diagnostic[] => {
  const docsDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME);
  const docsDirectoryPresent = isDirectory(docsDirectory);
  const hasMarkdownFile =
    docsDirectoryPresent &&
    readDirectoryEntries(docsDirectory).some(
      (entry) => entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name),
    );
  if (hasMarkdownFile) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: `${DOCS_DIRECTORY_NAME}/`,
      rule: DOCS_DIRECTORY_EXISTS_RULE_KEY,
      message: docsDirectoryPresent
        ? `\`${DOCS_DIRECTORY_NAME}/\` exists but contains no markdown file — without a populated system-of-record directory, detailed guidance has nowhere to live except the entry-point, collapsing progressive disclosure`
        : `No \`${DOCS_DIRECTORY_NAME}/\` directory at the repo root — without a dedicated system-of-record directory, detailed guidance has nowhere to live except the entry-point, collapsing progressive disclosure`,
      help: `Create a \`${DOCS_DIRECTORY_NAME}/\` directory at the repo root with at least one \`.md\` file holding the detailed conventions the entry-point should delegate to`,
    }),
  ];
};

// ── docs-structure/entry-point-links-into-docs ──────────────────────────
const checkEntryPointLinksIntoDocs = (
  rootDirectory: string,
  entryPointFilename: string | null,
): Diagnostic[] => {
  if (entryPointFilename === null) return [];
  // Only meaningful once `docs/` exists — otherwise the missing-docs
  // check already covers the gap and we'd double-report.
  if (!isDirectory(path.join(rootDirectory, DOCS_DIRECTORY_NAME))) return [];
  const content = readFileOrNull(path.join(rootDirectory, entryPointFilename));
  if (content === null) return [];
  if (countDocsReferences(content) >= ENTRY_POINT_MIN_DOCS_LINKS) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: entryPointFilename,
      rule: ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY,
      message: `${entryPointFilename} never references \`${DOCS_DIRECTORY_NAME}/\` — a map that doesn't point into the system of record is just a stub, not progressive disclosure`,
      help: `Link \`${entryPointFilename}\` into the system of record by referencing at least ${ENTRY_POINT_MIN_DOCS_LINKS} file under \`${DOCS_DIRECTORY_NAME}/\` (e.g. \`See [the rule guide](${DOCS_DIRECTORY_NAME}/HOW_TO_WRITE_A_RULE.md)\`)`,
    }),
  ];
};

// ── docs-structure/no-monolithic-instruction-file ───────────────────────
// Markdown files to scan for oversized monoliths: every `.md` directly
// under `docs/` plus every `.md` at the repo root. The entry-point itself
// is excluded here because `entry-point-is-a-map` already governs it with
// a tighter limit — flagging it twice would be noise.
const collectInstructionMarkdownFiles = (
  rootDirectory: string,
  entryPointFilename: string | null,
): string[] => {
  const candidates: string[] = [];
  for (const entry of readDirectoryEntries(rootDirectory)) {
    if (entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name)) {
      candidates.push(entry.name);
    }
  }
  const docsDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME);
  if (isDirectory(docsDirectory)) {
    for (const entry of readDirectoryEntries(docsDirectory)) {
      if (entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name)) {
        candidates.push(path.posix.join(DOCS_DIRECTORY_NAME, entry.name));
      }
    }
  }
  return candidates.filter((relativePath) => relativePath !== entryPointFilename);
};

const checkNoMonolithicInstructionFile = (
  rootDirectory: string,
  entryPointFilename: string | null,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const relativePath of collectInstructionMarkdownFiles(rootDirectory, entryPointFilename)) {
    const content = readFileOrNull(path.join(rootDirectory, relativePath));
    if (content === null) continue;
    const lineCount = countNonBlankLines(content);
    if (lineCount <= MONOLITHIC_DOC_MAX_LINES) continue;
    diagnostics.push(
      buildDocsStructureDiagnostic({
        filePath: relativePath,
        rule: NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY,
        message: `${relativePath} is ${lineCount} non-blank lines — an oversized instruction file should be split into focused, individually-disclosable documents so an agent can fetch only the one it needs`,
        help: `Split \`${relativePath}\` into smaller topic-scoped files (target ${MONOLITHIC_DOC_MAX_LINES} lines or fewer each) under \`${DOCS_DIRECTORY_NAME}/\``,
      }),
    );
  }
  return diagnostics;
};

/**
 * Structural checks enforcing docs structure for progressive disclosure
 * in an agent harness: an entry-point file (AGENTS.md / CLAUDE.md) must
 * exist; it must be a short MAP not a monolithic manual; a `docs/`
 * directory must exist as the system of record; the entry-point must LINK
 * into `docs/`; and no single instruction file may grow into a monolith.
 *
 * Reads files off disk and returns `Diagnostic[]` — the same shape and
 * contract as `checkPnpmHardening`. Returns `[]` for anything it can't
 * read rather than throwing.
 */
export const checkDocsStructure = (rootDirectory: string): Diagnostic[] => {
  const entryPointFilename = resolveEntryPointFilename(rootDirectory);
  return [
    ...checkEntryPointExists(entryPointFilename),
    ...checkEntryPointIsAMap(rootDirectory, entryPointFilename),
    ...checkDocsDirectoryExists(rootDirectory),
    ...checkEntryPointLinksIntoDocs(rootDirectory, entryPointFilename),
    ...checkNoMonolithicInstructionFile(rootDirectory, entryPointFilename),
  ];
};
