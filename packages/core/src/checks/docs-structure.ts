import fs from "node:fs";
import path from "node:path";
import {
  AGENT_ENTRY_POINT_FILENAMES,
  BANNED_LONG_LIVED_HARNESS_PATHS,
  CANONICAL_GLOSSARY_FILENAMES,
  COMBINED_AGENTS_MD_MAX_BYTES,
  DOCS_ARCHITECTURE_FILENAME,
  DOCS_BEHAVIOR_INVENTORY_FILENAME,
  DOCS_BEHAVIOR_LEDGER_FILENAME,
  DOCS_DIRECTORY_NAME,
  DOCS_INDEX_FILENAME,
  DOCS_SPEC_CONTRACT_FILENAME,
  DOMAIN_DOC_REQUIRED_FILENAMES,
  ENGINEERING_REQUIRED_DOC_PATHS,
  ENTRY_POINT_MAX_LINES,
  ENTRY_POINT_MIN_DOCS_LINKS,
  MONOLITHIC_DOC_MAX_LINES,
  SPEC_CONTRACT_REQUIRED_SECTIONS,
  SPEC_CONTRACT_SUFFICIENCY_COLUMN_ALIASES,
  STRUCTURE_MD_FILENAME,
  TODO_SPEC_REQUIRED_SECTIONS,
} from "../constants.js";
import { readIgnoreFile } from "../read-ignore-file.js";
import { commandExistsInSignalsMenu, discoverSignalsMenu } from "../signals-menu.js";
import {
  IGNORED_DIRECTORIES,
  isDirectory,
  isFile,
  readDirectoryEntries,
} from "../project-info/index.js";
import type { Diagnostic } from "../types/index.js";
import { compileGlobPattern, InvalidGlobPatternError } from "../utils/match-glob-pattern.js";
import { warnConfigIssue } from "../utils/warn-config-issue.js";

const MARKDOWN_FILE_PATTERN = /\.md$/i;
const MARKDOWN_LINK_PATTERN = /(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g;
const MARKDOWN_REFERENCE_DEFINITION_PATTERN = /^\s*\[[^\]\n]+]:\s+(\S+)/gm;
const HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*#?\s*$/gm;
const FENCED_CODE_BLOCK_PATTERN = /^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1[ \t]*$/gm;

const ENTRY_POINT_EXISTS_RULE_KEY = "docs-structure/entry-point-exists";
const SPEC_CONTRACT_EXISTS_RULE_KEY = "docs-structure/spec-contract-exists";
const SPEC_CONTRACT_SECTIONS_RULE_KEY = "docs-structure/spec-contract-has-required-sections";
const SPEC_CONTRACT_SUFFICIENCY_RULE_KEY =
  "docs-structure/spec-contract-declares-grader-sufficiency";
const PROOF_MENU_COMMAND_EXISTS_RULE_KEY = "docs-structure/proof-menu-command-exists";
const ENGINEERING_DOCS_EXIST_RULE_KEY = "docs-structure/engineering-docs-exist";
const NO_STRUCTURE_MD_RULE_KEY = "docs-structure/no-structure-md";
const AGENTS_BYTE_BUDGET_RULE_KEY = "docs-structure/agents-md-within-byte-budget";
const CLAUDE_SHIM_RULE_KEY = "docs-structure/claude-shim-imports-agents";
const ENTRY_POINT_IS_A_MAP_RULE_KEY = "docs-structure/entry-point-is-a-map";
const DOCS_DIRECTORY_EXISTS_RULE_KEY = "docs-structure/docs-directory-exists";
const ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY = "docs-structure/entry-point-links-into-docs";
const NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY = "docs-structure/no-monolithic-instruction-file";
const DOCS_INDEX_EXISTS_RULE_KEY = "docs-structure/docs-index-exists";
const ARCHITECTURE_MAP_EXISTS_RULE_KEY = "docs-structure/architecture-map-exists";
const SINGLE_CANONICAL_GLOSSARY_RULE_KEY = "docs-structure/single-canonical-glossary";
const TODOS_INDEX_EXISTS_RULE_KEY = "docs-structure/todos-index-exists";
const DOMAIN_DOCS_COMPLETE_RULE_KEY = "docs-structure/domain-docs-complete";
const BANNED_LONG_LIVED_PATH_RULE_KEY = "docs-structure/no-banned-long-lived-path";
const MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY = "docs-structure/markdown-link-target-exists";
const TODO_SPEC_SECTIONS_RULE_KEY = "docs-structure/todo-spec-has-required-sections";
const BEHAVIOR_BASELINE_ARTIFACTS_EXIST_RULE_KEY =
  "docs-structure/behavior-baseline-artifacts-exist";
const BEHAVIOR_INVENTORY_VALID_RULE_KEY = "docs-structure/behavior-inventory-valid";
const BEHAVIOR_LEDGER_VALID_RULE_KEY = "docs-structure/behavior-ledger-valid";
const BEHAVIOR_LEDGER_COVERS_CONFIRMED_RULE_KEY = "docs-structure/behavior-ledger-covers-confirmed";
const BEHAVIOR_LEDGER_TEST_PATH_EXISTS_RULE_KEY = "docs-structure/behavior-ledger-test-path-exists";

export interface DocsStructureOptions {
  readonly docsContract?: boolean;
  readonly baselineCheck?: boolean;
}

interface BuildDiagnosticInput {
  readonly filePath: string;
  readonly rule: string;
  readonly message: string;
  readonly help: string;
  readonly severity?: Diagnostic["severity"];
  readonly line?: number;
  readonly column?: number;
}

interface MarkdownFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly content: string;
}

interface LinkReference {
  readonly target: string;
  readonly line: number;
  readonly column: number;
}

interface MarkdownIgnorePattern {
  readonly negated: boolean;
  readonly matchers: ReadonlyArray<RegExp>;
}

interface MarkdownIgnoreMatcher {
  readonly isIgnored: (relativePath: string, isDirectory: boolean) => boolean;
}

const docsIndexPath = path.posix.join(DOCS_DIRECTORY_NAME, DOCS_INDEX_FILENAME);
const docsArchitecturePath = path.posix.join(DOCS_DIRECTORY_NAME, DOCS_ARCHITECTURE_FILENAME);
const todosIndexPath = path.posix.join(DOCS_DIRECTORY_NAME, "todos", DOCS_INDEX_FILENAME);
const docsSpecContractPath = path.posix.join(DOCS_DIRECTORY_NAME, DOCS_SPEC_CONTRACT_FILENAME);
const behaviorInventoryPath = path.posix.join(
  DOCS_DIRECTORY_NAME,
  DOCS_BEHAVIOR_INVENTORY_FILENAME,
);
const behaviorLedgerPath = path.posix.join(DOCS_DIRECTORY_NAME, DOCS_BEHAVIOR_LEDGER_FILENAME);

// Every docs-structure diagnostic shares plugin / severity / category so
// the group reads as one rule family; only the rule key, file, and prose
// differ between checks. Mirrors `buildHardeningDiagnostic` in the
// supply-chain template.
const buildDocsStructureDiagnostic = (input: BuildDiagnosticInput): Diagnostic => ({
  filePath: input.filePath,
  plugin: "harness-doctor",
  rule: input.rule,
  severity: input.severity ?? "warning",
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

const toPosixPath = (filePath: string): string => filePath.split(path.sep).join(path.posix.sep);

const toRelativePosixPath = (rootDirectory: string, absolutePath: string): string =>
  toPosixPath(path.relative(rootDirectory, absolutePath));

const gitignoreCandidatesFor = (
  pattern: string,
  isDirectoryOnly: boolean,
): ReadonlyArray<string> => {
  const anchored = pattern.startsWith("/");
  const normalized = pattern.replace(/^\/+/, "");
  if (normalized.length === 0) return [];
  const hasSlash = normalized.includes("/");
  const candidates = new Set<string>();
  const addCandidate = (candidate: string): void => {
    candidates.add(candidate);
    if (isDirectoryOnly) candidates.add(`${candidate}/**`);
  };
  addCandidate(normalized);
  if (!anchored && !hasSlash) addCandidate(`**/${normalized}`);
  return [...candidates];
};

const compileGitignorePattern = (rawPattern: string): MarkdownIgnorePattern | null => {
  const negated = rawPattern.startsWith("!");
  const unmarked = negated ? rawPattern.slice(1) : rawPattern;
  const isDirectoryOnly = unmarked.endsWith("/");
  const normalized = unmarked.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.length === 0) return null;
  const matchers: RegExp[] = [];
  for (const candidate of gitignoreCandidatesFor(normalized, isDirectoryOnly)) {
    try {
      matchers.push(compileGlobPattern(candidate));
    } catch (error) {
      if (error instanceof InvalidGlobPatternError) {
        warnConfigIssue(`.gitignore: ${error.message}`);
        continue;
      }
      warnConfigIssue(`.gitignore: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return matchers.length === 0 ? null : { negated, matchers };
};

const createMarkdownIgnoreMatcher = (rootDirectory: string): MarkdownIgnoreMatcher => {
  const gitignorePatterns = readIgnoreFile(path.join(rootDirectory, ".gitignore")).flatMap(
    (pattern) => {
      const compiled = compileGitignorePattern(pattern);
      return compiled === null ? [] : [compiled];
    },
  );

  return {
    isIgnored: (relativePath, entryIsDirectory) => {
      const pathSegments = relativePath.split(path.posix.sep);
      if (pathSegments.some((segment) => IGNORED_DIRECTORIES.has(segment))) return true;
      if (
        entryIsDirectory &&
        relativePath.length > 0 &&
        (isFile(path.join(rootDirectory, relativePath, ".git")) ||
          isDirectory(path.join(rootDirectory, relativePath, ".git")))
      ) {
        return true;
      }
      let ignored = false;
      for (const pattern of gitignorePatterns) {
        if (!pattern.matchers.some((matcher) => matcher.test(relativePath))) continue;
        ignored = !pattern.negated;
      }
      return ignored;
    },
  };
};

const hasPath = (rootDirectory: string, relativePath: string): boolean => {
  const absolutePath = path.join(rootDirectory, relativePath);
  return isFile(absolutePath) || isDirectory(absolutePath);
};

const listMarkdownFiles = (
  rootDirectory: string,
  ignoreMatcher: MarkdownIgnoreMatcher,
): MarkdownFile[] => {
  const markdownFiles: MarkdownFile[] = [];
  const visitDirectory = (absoluteDirectory: string): void => {
    for (const entry of readDirectoryEntries(absoluteDirectory)) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = toRelativePosixPath(rootDirectory, absolutePath);
      if (entry.isDirectory()) {
        if (ignoreMatcher.isIgnored(relativePath, true)) continue;
        visitDirectory(absolutePath);
        continue;
      }
      if (!entry.isFile() || !MARKDOWN_FILE_PATTERN.test(entry.name)) continue;
      if (ignoreMatcher.isIgnored(relativePath, false)) continue;
      const content = readFileOrNull(absolutePath);
      if (content === null) continue;
      markdownFiles.push({
        relativePath,
        absolutePath,
        content,
      });
    }
  };

  if (!isDirectory(rootDirectory)) return [];
  visitDirectory(rootDirectory);
  return markdownFiles;
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

const lineColumnForIndex = (content: string, index: number): { line: number; column: number } => {
  const prefix = content.slice(0, index);
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1]?.length ?? 0 };
};

const normalizeMarkdownTarget = (rawTarget: string): string | null => {
  const trimmed = rawTarget.trim();
  if (trimmed.length === 0) return null;
  const withoutAngles =
    trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1) : trimmed;
  const target = withoutAngles.split(/\s+/)[0] ?? "";
  if (
    target.length === 0 ||
    target.startsWith("#") ||
    target.startsWith("mailto:") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return null;
  }
  return target.split("#")[0]?.split("?")[0] ?? null;
};

const collectMarkdownLinks = (file: MarkdownFile): LinkReference[] => {
  const links: LinkReference[] = [];
  const searchableContent = file.content.replace(FENCED_CODE_BLOCK_PATTERN, (block) =>
    block.replace(/[^\r\n]/g, " "),
  );
  for (const pattern of [MARKDOWN_LINK_PATTERN, MARKDOWN_REFERENCE_DEFINITION_PATTERN]) {
    pattern.lastIndex = 0;
    for (const match of searchableContent.matchAll(pattern)) {
      const target = match[1];
      if (target === undefined) continue;
      const normalized = normalizeMarkdownTarget(target);
      if (normalized === null || normalized.length === 0) continue;
      const position = lineColumnForIndex(searchableContent, match.index ?? 0);
      links.push({ target: normalized, ...position });
    }
  }
  return links;
};

const resolveMarkdownLinkTarget = (sourceFile: MarkdownFile, target: string): string =>
  path.resolve(path.dirname(sourceFile.absolutePath), target);

const headingNamesFor = (content: string): Set<string> => {
  const names = new Set<string>();
  HEADING_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(HEADING_PATTERN)) {
    const rawHeading = match[1];
    if (rawHeading === undefined) continue;
    names.add(rawHeading.trim().toLowerCase());
  }
  return names;
};

const hasHeading = (headings: Set<string>, candidates: ReadonlyArray<string>): boolean => {
  for (const heading of headings) {
    for (const candidate of candidates) {
      if (heading === candidate || heading.startsWith(`${candidate} `)) return true;
    }
  }
  return false;
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
      help: `Link \`${entryPointFilename}\` into the system of record by referencing at least ${ENTRY_POINT_MIN_DOCS_LINKS} file under \`${DOCS_DIRECTORY_NAME}/\` (e.g. \`See [the architecture map](${DOCS_DIRECTORY_NAME}/ARCHITECTURE.md)\`)`,
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
  ignoreMatcher: MarkdownIgnoreMatcher,
): string[] => {
  const candidates: string[] = [];
  for (const entry of readDirectoryEntries(rootDirectory)) {
    if (
      entry.isFile() &&
      MARKDOWN_FILE_PATTERN.test(entry.name) &&
      !ignoreMatcher.isIgnored(entry.name, false)
    ) {
      candidates.push(entry.name);
    }
  }
  const docsDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME);
  if (isDirectory(docsDirectory)) {
    for (const entry of readDirectoryEntries(docsDirectory)) {
      if (!entry.isFile() || !MARKDOWN_FILE_PATTERN.test(entry.name)) continue;
      const relativePath = path.posix.join(DOCS_DIRECTORY_NAME, entry.name);
      if (!ignoreMatcher.isIgnored(relativePath, false)) candidates.push(relativePath);
    }
  }
  return candidates.filter((relativePath) => relativePath !== entryPointFilename);
};

const checkNoMonolithicInstructionFile = (
  rootDirectory: string,
  entryPointFilename: string | null,
  ignoreMatcher: MarkdownIgnoreMatcher,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const relativePath of collectInstructionMarkdownFiles(
    rootDirectory,
    entryPointFilename,
    ignoreMatcher,
  )) {
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

// A directory entry that resolves to a regular file, following symlinks. The
// rest of the scanner's `isFile()` helper follows symlinks, but `Dirent.isFile()`
// is false for a symlink — so a symlinked `docs/INDEX.md` (this repo's own README
// is a symlink) would otherwise look absent to the canonical-case checks.
const entryResolvesToFile = (directory: string, entry: fs.Dirent): boolean =>
  entry.isFile() || (entry.isSymbolicLink() && isFile(path.join(directory, entry.name)));

// A canonical-case existence check. `isFile` resolves through the OS, which is
// case-insensitive on macOS/Windows — so `isFile("docs/INDEX.md")` returns true
// even when the real file is `docs/index.md`, which would hide the rename hint
// on those systems and make the check non-deterministic across filesystems. This
// compares directory-entry names exactly instead, so the result is identical on
// case-sensitive and case-insensitive filesystems.
const hasCanonicalCaseFile = (rootDirectory: string, expectedPath: string): boolean => {
  const expectedDirectory = path.posix.dirname(expectedPath);
  const expectedFilename = path.posix.basename(expectedPath);
  const absoluteDirectory =
    expectedDirectory === "."
      ? rootDirectory
      : path.join(rootDirectory, ...expectedDirectory.split(path.posix.sep));
  if (!isDirectory(absoluteDirectory)) return false;
  return readDirectoryEntries(absoluteDirectory).some(
    (entry) => entryResolvesToFile(absoluteDirectory, entry) && entry.name === expectedFilename,
  );
};

const findCaseVariantPath = (rootDirectory: string, expectedPath: string): string | null => {
  const expectedDirectory = path.posix.dirname(expectedPath);
  const expectedFilename = path.posix.basename(expectedPath);
  const absoluteDirectory =
    expectedDirectory === "."
      ? rootDirectory
      : path.join(rootDirectory, ...expectedDirectory.split(path.posix.sep));
  if (!isDirectory(absoluteDirectory)) return null;
  for (const entry of readDirectoryEntries(absoluteDirectory)) {
    if (!entryResolvesToFile(absoluteDirectory, entry)) continue;
    if (entry.name === expectedFilename) continue;
    if (entry.name.toLowerCase() !== expectedFilename.toLowerCase()) continue;
    return expectedDirectory === "." ? entry.name : path.posix.join(expectedDirectory, entry.name);
  }
  return null;
};

// ── docs-structure/docs-index-exists ────────────────────────────────────
const checkDocsIndexExists = (rootDirectory: string): Diagnostic[] => {
  if (hasCanonicalCaseFile(rootDirectory, docsIndexPath)) return [];
  const caseVariantPath = findCaseVariantPath(rootDirectory, docsIndexPath);
  if (caseVariantPath !== null) {
    return [
      buildDocsStructureDiagnostic({
        filePath: caseVariantPath,
        rule: DOCS_INDEX_EXISTS_RULE_KEY,
        message: `Found \`${caseVariantPath}\`; rename to \`${docsIndexPath}\` — case-sensitive systems and agents expect the canonical route exactly`,
        help: `Rename \`${caseVariantPath}\` to \`${docsIndexPath}\``,
      }),
    ];
  }
  return [
    buildDocsStructureDiagnostic({
      filePath: docsIndexPath,
      rule: DOCS_INDEX_EXISTS_RULE_KEY,
      message:
        "docs/ has no INDEX.md — without a table of contents, agents have to grep the docs tree instead of following a stable route map",
      help: `Add \`${docsIndexPath}\` that links to architecture, engineering, design, glossary, todos, and domain docs that exist in this repo`,
    }),
  ];
};

// ── docs-structure/architecture-map-exists ──────────────────────────────
const checkArchitectureMapExists = (rootDirectory: string): Diagnostic[] => {
  if (isFile(path.join(rootDirectory, docsArchitecturePath))) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: docsArchitecturePath,
      rule: ARCHITECTURE_MAP_EXISTS_RULE_KEY,
      message:
        "docs/ has no ARCHITECTURE.md — agents need one current map of domains and package layering before they edit shared behavior",
      help: `Add a compact \`${docsArchitecturePath}\` that describes current system shape, package boundaries, and where deeper domain docs live`,
    }),
  ];
};

// ── docs-structure/single-canonical-glossary ────────────────────────────
// A glossary is an EARNED surface (created on demonstrated need), so a
// missing glossary is never a finding — only competing duplicates are.
const checkCanonicalGlossary = (rootDirectory: string): Diagnostic[] => {
  const presentGlossaries = CANONICAL_GLOSSARY_FILENAMES.filter((filename) =>
    isFile(path.join(rootDirectory, filename)),
  );
  if (presentGlossaries.length <= 1) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: presentGlossaries[0] ?? CANONICAL_GLOSSARY_FILENAMES[0],
      rule: SINGLE_CANONICAL_GLOSSARY_RULE_KEY,
      message: `Multiple glossary files exist (${presentGlossaries.join(
        ", ",
      )}) — competing vocabularies drift and make agents choose synonyms at random`,
      help: `Choose one canonical glossary, link it from \`${docsIndexPath}\`, and turn the other files into links or remove them`,
    }),
  ];
};

// ── docs-structure/todos-index-exists ───────────────────────────────────
const checkTodosIndexExists = (
  rootDirectory: string,
  options: DocsStructureOptions,
): Diagnostic[] => {
  const todosDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME, "todos");
  const shouldRequireTodosIndex = options.docsContract === true || isDirectory(todosDirectory);
  if (!shouldRequireTodosIndex || hasCanonicalCaseFile(rootDirectory, todosIndexPath)) return [];
  const caseVariantPath = findCaseVariantPath(rootDirectory, todosIndexPath);
  if (caseVariantPath !== null) {
    return [
      buildDocsStructureDiagnostic({
        filePath: caseVariantPath,
        rule: TODOS_INDEX_EXISTS_RULE_KEY,
        message: `Found \`${caseVariantPath}\`; rename to \`${todosIndexPath}\` — case-sensitive systems and agents expect the canonical route exactly`,
        help: `Rename \`${caseVariantPath}\` to \`${todosIndexPath}\``,
      }),
    ];
  }
  return [
    buildDocsStructureDiagnostic({
      filePath: todosIndexPath,
      rule: TODOS_INDEX_EXISTS_RULE_KEY,
      message:
        "The Harness docs contract needs docs/todos/INDEX.md — durable follow-up specs need one visible queue instead of being stranded in PR notes",
      help: `Add \`${todosIndexPath}\` listing open todo specs, or set \`docsContract: false\` if this repo intentionally has no durable todo queue`,
    }),
  ];
};

// ── docs-structure/domain-docs-complete ─────────────────────────────────
const checkDomainDocsComplete = (rootDirectory: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const domainsDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME, "domains");
  if (!isDirectory(domainsDirectory)) return diagnostics;
  for (const entry of readDirectoryEntries(domainsDirectory)) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const domainRelativePath = path.posix.join(DOCS_DIRECTORY_NAME, "domains", entry.name);
    const missing = DOMAIN_DOC_REQUIRED_FILENAMES.filter(
      (filename) => !isFile(path.join(domainsDirectory, entry.name, filename)),
    );
    if (missing.length === 0) continue;
    diagnostics.push(
      buildDocsStructureDiagnostic({
        filePath: `${domainRelativePath}/`,
        rule: DOMAIN_DOCS_COMPLETE_RULE_KEY,
        message: `${domainRelativePath}/ is missing ${missing.join(
          ", ",
        )} — domain docs should be boring and complete so agents can find code, invariants, and validation the same way every time`,
        help: `Add the missing files under \`${domainRelativePath}/\`: ${DOMAIN_DOC_REQUIRED_FILENAMES.join(
          ", ",
        )}`,
      }),
    );
  }
  return diagnostics;
};

// ── docs-structure/spec-contract-exists ─────────────────────────────────
const checkSpecContractExists = (rootDirectory: string): Diagnostic[] => {
  if (isFile(path.join(rootDirectory, docsSpecContractPath))) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: docsSpecContractPath,
      rule: SPEC_CONTRACT_EXISTS_RULE_KEY,
      message:
        "docs/ has no SPEC_CONTRACT.md — without a spec contract, task intake cannot know which acceptance criteria this repo can verify, so specs arrive promising proofs the repo cannot produce",
      help: `Add \`${docsSpecContractPath}\` with a quality bar, a proof menu (change type → validation command → proof artifact) derived from the repo's real validation surfaces, and escalation boundaries`,
    }),
  ];
};

// ── docs-structure/spec-contract-has-required-sections ──────────────────
const checkSpecContractSections = (rootDirectory: string): Diagnostic[] => {
  const content = readFileOrNull(path.join(rootDirectory, docsSpecContractPath));
  if (content === null) return [];
  const headings = headingNamesFor(content);
  const missingSections = SPEC_CONTRACT_REQUIRED_SECTIONS.filter(
    (section) => !hasHeading(headings, [section]),
  );
  if (missingSections.length === 0) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: docsSpecContractPath,
      rule: SPEC_CONTRACT_SECTIONS_RULE_KEY,
      message: `${docsSpecContractPath} is missing sections (${missingSections.join(
        ", ",
      )}) — a spec contract needs a quality bar, a proof menu, and escalation boundaries to be consumable by task intake`,
      help: `Add the missing sections to \`${docsSpecContractPath}\`; every proof-menu row must reference a validation command that exists and runs`,
    }),
  ];
};

// ── docs-structure/spec-contract-declares-grader-sufficiency ────────────
// Opt-in (docsContract): the proof menu must say whether each change type's
// auto-grader is sufficient for "done" (`auto`) or needs human sign-off
// (`human-gate`) — without it a false-green merges broken work in an
// unattended loop. We inspect only the proof-menu table's HEADER row, so a
// stray data cell or an unrelated table never false-passes.
const SUFFICIENCY_COLUMN_ALIAS_SET: ReadonlySet<string> = new Set(
  SPEC_CONTRACT_SUFFICIENCY_COLUMN_ALIASES,
);

interface ProofMenuLine {
  readonly text: string;
  readonly line: number;
}

// Lines under the `## Proof menu` heading, up to the next heading.
const proofMenuSectionLineEntries = (content: string): ProofMenuLine[] => {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((lineText) => /^#{1,6}\s+proof menu\b/i.test(lineText.trim()));
  if (start === -1) return [];
  const entries: ProofMenuLine[] = [];
  for (let lineIndex = start + 1; lineIndex < lines.length; lineIndex += 1) {
    const text = lines[lineIndex] ?? "";
    if (/^#{1,6}\s+/.test(text.trim())) break;
    entries.push({ text, line: lineIndex + 1 });
  }
  return entries;
};

const proofMenuSectionLines = (content: string): string[] =>
  proofMenuSectionLineEntries(content).map((entry) => entry.text);

// A markdown table separator row (`| --- | :--: |`): pipes, colons, spaces,
// and at least one dash, nothing else.
const isTableDelimiterRow = (lineText: string): boolean =>
  lineText.includes("-") && /^[\s|:-]+$/.test(lineText.trim());

// True when the proof-menu table's header row — the `|`-row directly above the
// `| --- |` separator — carries a sufficiency-named column.
const declaresSufficiencyColumn = (content: string): boolean => {
  const lines = proofMenuSectionLines(content);
  return lines.some(
    (lineText, index) =>
      lineText.includes("|") &&
      isTableDelimiterRow(lines[index + 1] ?? "") &&
      lineText
        .split("|")
        .some((cell) => SUFFICIENCY_COLUMN_ALIAS_SET.has(cell.trim().toLowerCase())),
  );
};

const checkSpecContractDeclaresSufficiency = (
  rootDirectory: string,
  options: DocsStructureOptions,
): Diagnostic[] => {
  if (options.docsContract !== true) return [];
  const content = readFileOrNull(path.join(rootDirectory, docsSpecContractPath));
  if (content === null) return [];
  if (declaresSufficiencyColumn(content)) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: docsSpecContractPath,
      rule: SPEC_CONTRACT_SUFFICIENCY_RULE_KEY,
      message: `${docsSpecContractPath} proof menu has no Sufficiency column — intake and grading can't tell whether a change type's auto-grader is sufficient evidence for "done" or needs human sign-off, so a false-green merges broken work in an unattended loop`,
      help: "Add a `Sufficiency` column to each proof-menu row marking whether its auto-grader is sufficient (`auto`) or the change needs human review (`human-gate`)",
    }),
  ];
};

interface ProofMenuTable {
  readonly headers: string[];
  readonly rows: ReadonlyArray<{ readonly cells: string[]; readonly line: number }>;
  readonly headerLine: number;
}

interface MarkdownTable {
  readonly headers: string[];
  readonly rows: ReadonlyArray<{ readonly cells: string[]; readonly line: number }>;
  readonly headerLine: number;
}

interface ProofMenuCommandCell {
  readonly commands: string[];
  readonly isValid: boolean;
}

const REQUIRED_PROOF_MENU_COLUMNS = [
  "change type",
  "lane",
  "validation command",
  "proof artifact",
  "sufficiency",
];
const PROOF_MENU_LANES = new Set(["fast", "full"]);
const PROOF_MENU_SUFFICIENCY_VALUES = new Set(["auto", "human-gate"]);
const BACKTICK_COMMAND_PATTERN = /`([^`\n]+)`/g;

const normalizeProofMenuHeader = (header: string): string =>
  header.trim().toLowerCase().replace(/\s+/g, " ");

const parseMarkdownTableCells = (lineText: string): string[] | null => {
  const trimmedLine = lineText.trim();
  if (!trimmedLine.includes("|")) return null;
  const withoutLeadingPipe = trimmedLine.startsWith("|") ? trimmedLine.slice(1) : trimmedLine;
  const withoutTrailingPipe = withoutLeadingPipe.endsWith("|")
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe;
  const cells = withoutTrailingPipe.split("|").map((cell) => cell.trim());
  return cells.length === 0 ? null : cells;
};

const findMarkdownTables = (content: string): MarkdownTable[] => {
  const lines = content.split(/\r?\n/).map((text, index) => ({ text, line: index + 1 }));
  const tables: MarkdownTable[] = [];
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const delimiter = lines[lineIndex];
    const header = lines[lineIndex - 1];
    if (delimiter === undefined || header === undefined) continue;
    if (!isTableDelimiterRow(delimiter.text)) continue;
    const headers = parseMarkdownTableCells(header.text);
    if (headers === null) continue;
    const rows: Array<{ cells: string[]; line: number }> = [];
    for (let rowIndex = lineIndex + 1; rowIndex < lines.length; rowIndex += 1) {
      const row = lines[rowIndex];
      if (row === undefined) continue;
      if (row.text.trim().length === 0) break;
      const cells = parseMarkdownTableCells(row.text);
      if (cells === null) break;
      rows.push({ cells, line: row.line });
    }
    tables.push({ headers, rows, headerLine: header.line });
  }
  return tables;
};

const findBestMarkdownTable = (
  content: string,
  requiredColumns: ReadonlyArray<string>,
): MarkdownTable | null => {
  let bestTable: MarkdownTable | null = null;
  let bestMatchCount = -1;
  for (const table of findMarkdownTables(content)) {
    const headers = new Set(table.headers.map(normalizeBehaviorHeader));
    const matchCount = requiredColumns.filter((column) => headers.has(column)).length;
    if (matchCount <= bestMatchCount) continue;
    bestTable = table;
    bestMatchCount = matchCount;
    if (matchCount === requiredColumns.length) break;
  }
  return bestTable;
};

const findProofMenuTable = (content: string): ProofMenuTable | null => {
  const lines = proofMenuSectionLineEntries(content);
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const delimiter = lines[lineIndex];
    const header = lines[lineIndex - 1];
    if (delimiter === undefined || header === undefined) continue;
    if (!isTableDelimiterRow(delimiter.text)) continue;
    const headers = parseMarkdownTableCells(header.text);
    if (headers === null) continue;
    const rows: Array<{ cells: string[]; line: number }> = [];
    for (let rowIndex = lineIndex + 1; rowIndex < lines.length; rowIndex += 1) {
      const row = lines[rowIndex];
      if (row === undefined) continue;
      if (row.text.trim().length === 0) break;
      const cells = parseMarkdownTableCells(row.text);
      if (cells === null) break;
      rows.push({ cells, line: row.line });
    }
    return { headers, rows, headerLine: header.line };
  }
  return null;
};

const commandCellCommands = (cell: string): ProofMenuCommandCell => {
  const commands: string[] = [];
  const remainder = cell.replace(BACKTICK_COMMAND_PATTERN, (_match, command: string) => {
    if (command.trim().length > 0) commands.push(command.trim());
    return "";
  });
  return {
    commands,
    isValid: commands.length > 0 && remainder.trim().length === 0,
  };
};

const buildProofMenuDiagnostic = (input: {
  readonly message: string;
  readonly help: string;
  readonly line: number;
}): Diagnostic =>
  buildDocsStructureDiagnostic({
    filePath: docsSpecContractPath,
    rule: PROOF_MENU_COMMAND_EXISTS_RULE_KEY,
    severity: "error",
    line: input.line,
    message: input.message,
    help: input.help,
  });

const commandColumnIndex = (
  headerIndexes: ReadonlyMap<string, number>,
  columnName: string,
): number | null => headerIndexes.get(columnName) ?? null;

const checkProofMenuCommandsExist = (rootDirectory: string): Diagnostic[] => {
  const content = readFileOrNull(path.join(rootDirectory, docsSpecContractPath));
  if (content === null) return [];
  const table = findProofMenuTable(content);
  if (table === null) return [];

  const headerIndexes = new Map<string, number>();
  for (let headerIndex = 0; headerIndex < table.headers.length; headerIndex += 1) {
    headerIndexes.set(normalizeProofMenuHeader(table.headers[headerIndex] ?? ""), headerIndex);
  }

  const missingColumns = REQUIRED_PROOF_MENU_COLUMNS.filter(
    (columnName) => !headerIndexes.has(columnName),
  );
  if (missingColumns.length > 0) {
    return [
      buildProofMenuDiagnostic({
        line: table.headerLine,
        message: `${docsSpecContractPath} proof menu is missing required columns (${missingColumns.join(
          ", ",
        )}) — proof rows must be machine-readable before validation commands can be verified`,
        help: "Use columns `Change type`, `Lane`, `Validation command`, `Proof artifact`, and `Sufficiency` in the proof-menu table",
      }),
    ];
  }

  const laneIndex = commandColumnIndex(headerIndexes, "lane");
  const validationCommandIndex = commandColumnIndex(headerIndexes, "validation command");
  const sufficiencyIndex = commandColumnIndex(headerIndexes, "sufficiency");
  if (laneIndex === null || validationCommandIndex === null || sufficiencyIndex === null) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const signals = discoverSignalsMenu(rootDirectory);

  for (const row of table.rows) {
    if (row.cells.length !== table.headers.length) {
      diagnostics.push(
        buildProofMenuDiagnostic({
          line: row.line,
          message: `${docsSpecContractPath} proof-menu row has ${row.cells.length} cells but the header has ${table.headers.length} — the row is not machine-readable`,
          help: "Keep every proof-menu row aligned with the header columns so each validation command can be statically verified",
        }),
      );
      continue;
    }

    const lane = row.cells[laneIndex]?.trim() ?? "";
    if (!PROOF_MENU_LANES.has(lane)) {
      diagnostics.push(
        buildProofMenuDiagnostic({
          line: row.line,
          message: `${docsSpecContractPath} proof-menu row declares Lane \`${lane}\` — expected \`fast\` or \`full\``,
          help: "Set Lane to `fast` or `full` so intake can choose a deterministic validation lane",
        }),
      );
      continue;
    }

    const sufficiency = row.cells[sufficiencyIndex]?.trim() ?? "";
    if (!PROOF_MENU_SUFFICIENCY_VALUES.has(sufficiency)) {
      diagnostics.push(
        buildProofMenuDiagnostic({
          line: row.line,
          message: `${docsSpecContractPath} proof-menu row declares Sufficiency \`${sufficiency}\` — expected \`auto\` or \`human-gate\``,
          help: "Set Sufficiency to `auto` or `human-gate` so proof consumers know whether human review is required",
        }),
      );
      continue;
    }

    const commandCell = commandCellCommands(row.cells[validationCommandIndex] ?? "");
    if (!commandCell.isValid) {
      diagnostics.push(
        buildProofMenuDiagnostic({
          line: row.line,
          message: `${docsSpecContractPath} proof-menu Validation command cell must contain only backtick-wrapped commands`,
          help: "Replace prose with one or more command spans like `pnpm test:contract`; put explanatory text in the Proof artifact column",
        }),
      );
      continue;
    }

    for (const command of commandCell.commands) {
      if (commandExistsInSignalsMenu(command, signals)) continue;
      diagnostics.push(
        buildProofMenuDiagnostic({
          line: row.line,
          message: `${docsSpecContractPath} proof menu references \`${command}\`, but that command was not found in package scripts, Makefile targets, or just recipes`,
          help: "Update the proof-menu command to an existing signal or add the missing package script, make target, or just recipe",
        }),
      );
    }
  }

  return diagnostics;
};

const REQUIRED_BEHAVIOR_INVENTORY_COLUMNS = [
  "id",
  "area",
  "behavior",
  "entry points",
  "existing proof",
  "missing proof",
  "confidence",
  "risk",
  "status",
  "priority",
  "notes",
] as const;

const REQUIRED_BEHAVIOR_LEDGER_COLUMNS = [
  "id",
  "status",
  "capture type",
  "test paths",
  "run command",
  "run evidence",
  "confidence",
  "remaining gap",
] as const;

const BEHAVIOR_ID_PATTERN = /^B-\d{3,}$/;
const BEHAVIOR_CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const BEHAVIOR_RISK_VALUES = new Set(["high", "medium", "low"]);
const BEHAVIOR_INVENTORY_STATUS_VALUES = new Set([
  "proposed",
  "confirmed",
  "corrected",
  "skip",
  "deferred",
  "stale",
]);
const BEHAVIOR_PRIORITY_VALUES = new Set(["P0", "P1", "P2"]);
const BEHAVIOR_LEDGER_STATUS_VALUES = new Set(["captured", "bug-pinned", "gap", "failed", "stale"]);
const BEHAVIOR_CAPTURE_TYPE_VALUES = new Set([
  "unit",
  "integration",
  "golden",
  "snapshot",
  "screenshot",
  "contract",
  "none",
]);

interface BehaviorInventoryRow {
  readonly id: string;
  readonly status: string;
  readonly priority: string;
  readonly risk: string;
}

interface BehaviorLedgerRow {
  readonly id: string;
  readonly status: string;
  readonly testPaths: string[];
}

const normalizeBehaviorHeader = (header: string): string =>
  header.trim().toLowerCase().replace(/\s+/g, " ");

const markdownTableHeaderIndexes = (table: MarkdownTable): Map<string, number> => {
  const headerIndexes = new Map<string, number>();
  for (let headerIndex = 0; headerIndex < table.headers.length; headerIndex += 1) {
    headerIndexes.set(normalizeBehaviorHeader(table.headers[headerIndex] ?? ""), headerIndex);
  }
  return headerIndexes;
};

const tableMissingColumns = (
  table: MarkdownTable,
  requiredColumns: ReadonlyArray<string>,
): string[] => {
  const present = new Set(table.headers.map(normalizeBehaviorHeader));
  return requiredColumns.filter((column) => !present.has(column));
};

const buildBehaviorDiagnostic = (input: {
  readonly filePath: string;
  readonly rule: string;
  readonly message: string;
  readonly help: string;
  readonly line?: number;
  readonly severity?: Diagnostic["severity"];
}): Diagnostic =>
  buildDocsStructureDiagnostic({
    filePath: input.filePath,
    rule: input.rule,
    line: input.line,
    severity: input.severity,
    message: input.message,
    help: input.help,
  });

const stripMarkdownPathReference = (value: string): string =>
  value
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/^\.\//, "")
    .replace(/:\d+(?::\d+)?$/, "");

const pathReferencesFromCell = (cell: string): string[] => {
  const backtickValues = [...cell.matchAll(BACKTICK_COMMAND_PATTERN)]
    .map((match) => stripMarkdownPathReference(match[1] ?? ""))
    .filter((value) => value.length > 0 && value !== "none");
  if (backtickValues.length > 0) return backtickValues;
  return cell
    .split(/[,;]/)
    .map(stripMarkdownPathReference)
    .filter((value) => value.length > 0 && value !== "none");
};

const isHighPriorityConfirmedInventoryRow = (row: BehaviorInventoryRow): boolean =>
  (row.status === "confirmed" || row.status === "corrected") &&
  (row.priority === "P0" || row.priority === "P1");

const checkBehaviorInventory = (
  rootDirectory: string,
): { readonly rows: BehaviorInventoryRow[]; readonly diagnostics: Diagnostic[] } => {
  const content = readFileOrNull(path.join(rootDirectory, behaviorInventoryPath));
  if (content === null) return { rows: [], diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const table = findBestMarkdownTable(content, REQUIRED_BEHAVIOR_INVENTORY_COLUMNS);
  if (table === null) {
    return {
      rows: [],
      diagnostics: [
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          message: `${behaviorInventoryPath} has no markdown table — baseline inventory must be parseable before agents can resume across the human ratification gate`,
          help: "Use the required behavior inventory table header from the harness baseline template",
        }),
      ],
    };
  }
  const missingColumns = tableMissingColumns(table, REQUIRED_BEHAVIOR_INVENTORY_COLUMNS);
  if (missingColumns.length > 0) {
    diagnostics.push(
      buildBehaviorDiagnostic({
        filePath: behaviorInventoryPath,
        rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
        line: table.headerLine,
        message: `${behaviorInventoryPath} is missing required columns (${missingColumns.join(
          ", ",
        )}) — the inventory must be machine-readable for baseline resume and fleet reporting`,
        help: "Use columns `ID`, `Area`, `Behavior`, `Entry points`, `Existing proof`, `Missing proof`, `Confidence`, `Risk`, `Status`, `Priority`, and `Notes`",
      }),
    );
    return { rows: [], diagnostics };
  }
  const headerIndexes = markdownTableHeaderIndexes(table);
  const idIndex = headerIndexes.get("id") ?? 0;
  const entryPointsIndex = headerIndexes.get("entry points") ?? 3;
  const confidenceIndex = headerIndexes.get("confidence") ?? 6;
  const riskIndex = headerIndexes.get("risk") ?? 7;
  const statusIndex = headerIndexes.get("status") ?? 8;
  const priorityIndex = headerIndexes.get("priority") ?? 9;
  const rows: BehaviorInventoryRow[] = [];
  const seenIds = new Set<string>();
  for (const row of table.rows) {
    if (row.cells.length !== table.headers.length) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row has ${row.cells.length} cells but the header has ${table.headers.length} — the row is not machine-readable`,
          help: "Keep every behavior inventory row aligned with the header columns",
        }),
      );
      continue;
    }
    const id = row.cells[idIndex]?.trim() ?? "";
    const entryPoints = row.cells[entryPointsIndex]?.trim() ?? "";
    const confidence = (row.cells[confidenceIndex]?.trim() ?? "").toLowerCase();
    const risk = (row.cells[riskIndex]?.trim() ?? "").toLowerCase();
    const status = (row.cells[statusIndex]?.trim() ?? "").toLowerCase();
    const priority = (row.cells[priorityIndex]?.trim() ?? "").toUpperCase();
    if (!BEHAVIOR_ID_PATTERN.test(id)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row uses behavior ID \`${id}\` — expected stable IDs like \`B-001\``,
          help: "Assign a stable `B-001` style ID and preserve it across refreshes",
        }),
      );
      continue;
    }
    if (seenIds.has(id)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} repeats behavior ID \`${id}\` — inventory IDs must be unique so ledger rows can refer to exactly one behavior`,
          help: "Give each inventory row a unique stable behavior ID",
        }),
      );
    }
    seenIds.add(id);
    if (entryPoints.length === 0 && status !== "deferred" && status !== "skip") {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row ${id} has no entry point evidence — inventory behavior needs concrete code routes`,
          help: "Add at least one file or file:line reference in the Entry points column, or mark the row deferred/skip",
        }),
      );
    }
    if (!BEHAVIOR_CONFIDENCE_VALUES.has(confidence)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row ${id} has Confidence \`${confidence}\` — expected high, medium, or low`,
          help: "Set Confidence to `high`, `medium`, or `low`",
        }),
      );
    }
    if (!BEHAVIOR_RISK_VALUES.has(risk)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row ${id} has Risk \`${risk}\` — expected high, medium, or low`,
          help: "Set Risk to `high`, `medium`, or `low`",
        }),
      );
    }
    if (!BEHAVIOR_INVENTORY_STATUS_VALUES.has(status)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row ${id} has Status \`${status}\` — expected proposed, confirmed, corrected, skip, deferred, or stale`,
          help: "Use one of the allowed behavior inventory statuses",
        }),
      );
    }
    if (!BEHAVIOR_PRIORITY_VALUES.has(priority)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorInventoryPath,
          rule: BEHAVIOR_INVENTORY_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorInventoryPath} row ${id} has Priority \`${priority}\` — expected P0, P1, or P2`,
          help: "Set Priority to `P0`, `P1`, or `P2`",
        }),
      );
    }
    rows.push({ id, status, priority, risk });
  }
  return { rows, diagnostics };
};

const checkBehaviorLedger = (
  rootDirectory: string,
  inventoryRows: ReadonlyArray<BehaviorInventoryRow>,
): Diagnostic[] => {
  const content = readFileOrNull(path.join(rootDirectory, behaviorLedgerPath));
  const inScopeRows = inventoryRows.filter(isHighPriorityConfirmedInventoryRow);
  if (content === null) {
    if (inScopeRows.length === 0) return [];
    return inScopeRows.map((row) =>
      buildBehaviorDiagnostic({
        filePath: behaviorLedgerPath,
        rule: BEHAVIOR_LEDGER_COVERS_CONFIRMED_RULE_KEY,
        severity: "error",
        message: `${behaviorLedgerPath} is missing, but ${row.id} is confirmed/corrected ${row.priority} behavior — ratified baseline behavior needs a terminal ledger outcome`,
        help: `Run \`harness baseline capture\` for ${row.id}, or change its inventory status/priority if it is not in scope`,
      }),
    );
  }
  const diagnostics: Diagnostic[] = [];
  const table = findBestMarkdownTable(content, REQUIRED_BEHAVIOR_LEDGER_COLUMNS);
  if (table === null) {
    return [
      buildBehaviorDiagnostic({
        filePath: behaviorLedgerPath,
        rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
        message: `${behaviorLedgerPath} has no markdown table — baseline ledger must be parseable before agents can trust captured proof`,
        help: "Use the required behavior ledger table header from the harness baseline template",
      }),
    ];
  }
  const missingColumns = tableMissingColumns(table, REQUIRED_BEHAVIOR_LEDGER_COLUMNS);
  if (missingColumns.length > 0) {
    diagnostics.push(
      buildBehaviorDiagnostic({
        filePath: behaviorLedgerPath,
        rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
        line: table.headerLine,
        message: `${behaviorLedgerPath} is missing required columns (${missingColumns.join(
          ", ",
        )}) — the ledger must be machine-readable for doctor and CI checks`,
        help: "Use columns `ID`, `Status`, `Capture type`, `Test paths`, `Run command`, `Run evidence`, `Confidence`, and `Remaining gap`",
      }),
    );
    return diagnostics;
  }
  const headerIndexes = markdownTableHeaderIndexes(table);
  const idIndex = headerIndexes.get("id") ?? 0;
  const statusIndex = headerIndexes.get("status") ?? 1;
  const captureTypeIndex = headerIndexes.get("capture type") ?? 2;
  const testPathsIndex = headerIndexes.get("test paths") ?? 3;
  const runCommandIndex = headerIndexes.get("run command") ?? 4;
  const runEvidenceIndex = headerIndexes.get("run evidence") ?? 5;
  const confidenceIndex = headerIndexes.get("confidence") ?? 6;
  const inventoryIds = new Set(inventoryRows.map((row) => row.id));
  const ledgerRows: BehaviorLedgerRow[] = [];
  const ledgerIds = new Set<string>();
  for (const row of table.rows) {
    if (row.cells.length !== table.headers.length) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row has ${row.cells.length} cells but the header has ${table.headers.length} — the row is not machine-readable`,
          help: "Keep every behavior ledger row aligned with the header columns",
        }),
      );
      continue;
    }
    const id = row.cells[idIndex]?.trim() ?? "";
    const status = (row.cells[statusIndex]?.trim() ?? "").toLowerCase();
    const captureType = (row.cells[captureTypeIndex]?.trim() ?? "").toLowerCase();
    const testPaths = pathReferencesFromCell(row.cells[testPathsIndex] ?? "");
    const runCommand = row.cells[runCommandIndex]?.trim() ?? "";
    const runEvidence = row.cells[runEvidenceIndex]?.trim() ?? "";
    const confidence = (row.cells[confidenceIndex]?.trim() ?? "").toLowerCase();
    if (!BEHAVIOR_ID_PATTERN.test(id)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row uses behavior ID \`${id}\` — expected stable IDs like \`B-001\``,
          help: "Use the behavior ID from docs/BEHAVIOR_INVENTORY.md",
        }),
      );
      continue;
    }
    if (ledgerIds.has(id)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} repeats behavior ID \`${id}\` — one behavior should have one current ledger outcome`,
          help: "Merge duplicate ledger rows or mark the obsolete row stale outside the table",
        }),
      );
    }
    ledgerIds.add(id);
    if (inventoryIds.size > 0 && !inventoryIds.has(id)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} references ${id}, but that ID is not present in ${behaviorInventoryPath}`,
          help: "Add the missing inventory row or remove the orphaned ledger entry",
        }),
      );
    }
    if (!BEHAVIOR_LEDGER_STATUS_VALUES.has(status)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row ${id} has Status \`${status}\` — expected captured, bug-pinned, gap, failed, or stale`,
          help: "Use one of the allowed behavior ledger statuses",
        }),
      );
    }
    if (!BEHAVIOR_CAPTURE_TYPE_VALUES.has(captureType)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row ${id} has Capture type \`${captureType}\` — expected unit, integration, golden, snapshot, screenshot, contract, or none`,
          help: "Use one of the allowed behavior capture types",
        }),
      );
    }
    if (!BEHAVIOR_CONFIDENCE_VALUES.has(confidence)) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row ${id} has Confidence \`${confidence}\` — expected high, medium, or low`,
          help: "Set Confidence to `high`, `medium`, or `low`",
        }),
      );
    }
    if ((status === "captured" || status === "bug-pinned") && runCommand.length === 0) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row ${id} is ${status} but has no Run command — proof-backed rows must say how to rerun the proof`,
          help: "Add the exact test command used to verify this behavior",
        }),
      );
    }
    if ((status === "captured" || status === "bug-pinned") && runEvidence.length === 0) {
      diagnostics.push(
        buildBehaviorDiagnostic({
          filePath: behaviorLedgerPath,
          rule: BEHAVIOR_LEDGER_VALID_RULE_KEY,
          line: row.line,
          message: `${behaviorLedgerPath} row ${id} is ${status} but has no Run evidence — proof-backed rows need the pass result and repo snapshot`,
          help: "Record evidence such as `3/3 green at <sha>`",
        }),
      );
    }
    if (status === "captured" || status === "bug-pinned") {
      if (testPaths.length === 0) {
        diagnostics.push(
          buildBehaviorDiagnostic({
            filePath: behaviorLedgerPath,
            rule: BEHAVIOR_LEDGER_TEST_PATH_EXISTS_RULE_KEY,
            severity: "error",
            line: row.line,
            message: `${behaviorLedgerPath} row ${id} is ${status} but has no test path — proof-backed rows must point to committed tests, snapshots, or fixtures`,
            help: "Add one or more test/snapshot/fixture paths in the Test paths column",
          }),
        );
      }
      for (const testPath of testPaths) {
        if (hasPath(rootDirectory, testPath)) continue;
        diagnostics.push(
          buildBehaviorDiagnostic({
            filePath: behaviorLedgerPath,
            rule: BEHAVIOR_LEDGER_TEST_PATH_EXISTS_RULE_KEY,
            severity: "error",
            line: row.line,
            message: `${behaviorLedgerPath} row ${id} references missing test path \`${testPath}\` — behavior proof has drifted or was never committed`,
            help: `Add the missing proof file, update the Test paths cell, or mark ${id} as gap/stale if proof no longer exists`,
          }),
        );
      }
    }
    if (BEHAVIOR_LEDGER_STATUS_VALUES.has(status)) {
      ledgerRows.push({ id, status, testPaths });
    }
  }
  const ledgerById = new Map(ledgerRows.map((row) => [row.id, row]));
  for (const inventoryRow of inScopeRows) {
    if (ledgerById.has(inventoryRow.id)) continue;
    diagnostics.push(
      buildBehaviorDiagnostic({
        filePath: behaviorLedgerPath,
        rule: BEHAVIOR_LEDGER_COVERS_CONFIRMED_RULE_KEY,
        severity: "error",
        message: `${inventoryRow.id} is confirmed/corrected ${inventoryRow.priority} behavior in ${behaviorInventoryPath}, but ${behaviorLedgerPath} has no terminal outcome for it`,
        help: `Run \`harness baseline capture\` for ${inventoryRow.id}, or change its inventory status/priority if it is not in scope`,
      }),
    );
  }
  return diagnostics;
};

const checkBehaviorBaselineArtifacts = (
  rootDirectory: string,
  options: DocsStructureOptions,
): Diagnostic[] => {
  const behaviorInventoryExists = isFile(path.join(rootDirectory, behaviorInventoryPath));
  const behaviorLedgerExists = isFile(path.join(rootDirectory, behaviorLedgerPath));
  const artifactDiagnostics: Diagnostic[] = [];
  if (options.baselineCheck === true && !behaviorInventoryExists) {
    artifactDiagnostics.push(
      buildBehaviorDiagnostic({
        filePath: behaviorInventoryPath,
        rule: BEHAVIOR_BASELINE_ARTIFACTS_EXIST_RULE_KEY,
        message: `${behaviorInventoryPath} is missing — baseline checks need a ratifiable behavior inventory before agents can capture legacy behavior systematically`,
        help: "Run `harness baseline inventory`, review the generated behavior list, then run `harness baseline capture` for approved rows",
      }),
    );
  }
  if (options.baselineCheck === true && behaviorInventoryExists && !behaviorLedgerExists) {
    artifactDiagnostics.push(
      buildBehaviorDiagnostic({
        filePath: behaviorLedgerPath,
        rule: BEHAVIOR_BASELINE_ARTIFACTS_EXIST_RULE_KEY,
        message: `${behaviorLedgerPath} is missing — baseline checks need a ledger of captured, bug-pinned, gap, failed, or stale behavior outcomes`,
        help: "Run `harness baseline capture` after inventory review so each approved behavior has a durable outcome row",
      }),
    );
  }
  const inventory = checkBehaviorInventory(rootDirectory);
  return [
    ...artifactDiagnostics,
    ...inventory.diagnostics,
    ...checkBehaviorLedger(rootDirectory, inventory.rows),
  ];
};

// ── docs-structure/engineering-docs-exist ───────────────────────────────
const checkEngineeringDocsExist = (
  rootDirectory: string,
  options: DocsStructureOptions,
): Diagnostic[] => {
  if (options.docsContract !== true) return [];
  return ENGINEERING_REQUIRED_DOC_PATHS.filter(
    (relativePath) => !isFile(path.join(rootDirectory, relativePath)),
  ).map((relativePath) =>
    buildDocsStructureDiagnostic({
      filePath: relativePath,
      rule: ENGINEERING_DOCS_EXIST_RULE_KEY,
      message: `The Harness docs contract needs ${relativePath} — agents need canonical commands and a change-type → validation map before they can prove their work end-to-end`,
      help: `Add \`${relativePath}\` (validate every command by running it), or leave \`docsContract\` unset/false if this repo has not adopted the strict contract`,
    }),
  );
};

// ── docs-structure/no-structure-md ──────────────────────────────────────
const checkNoStructureMd = (rootDirectory: string): Diagnostic[] => {
  if (!isFile(path.join(rootDirectory, STRUCTURE_MD_FILENAME))) return [];
  return [
    buildDocsStructureDiagnostic({
      filePath: STRUCTURE_MD_FILENAME,
      rule: NO_STRUCTURE_MD_RULE_KEY,
      message:
        "STRUCTURE.md is a non-canonical structure map — the contract route is docs/ARCHITECTURE.md linked from docs/INDEX.md, and a parallel root map drifts from it",
      help: `Move durable structure information into \`${docsArchitecturePath}\`, route to it from \`${docsIndexPath}\`, and delete \`${STRUCTURE_MD_FILENAME}\`; repos mid-migration can set \`"harness-doctor/${NO_STRUCTURE_MD_RULE_KEY}": "off"\` in harness.config`,
    }),
  ];
};

// ── docs-structure/agents-md-within-byte-budget ─────────────────────────
// Codex loads the AGENTS.md files on the directory chain from the repo root
// down to its cwd — `project_doc_max_bytes` caps each chain, not the sum of
// every AGENTS.md in the repo — so the budget is judged against the heaviest
// root→leaf chain.
const isDirectoryOnChainTo = (ancestor: string, leaf: string): boolean =>
  ancestor === "." || ancestor === leaf || leaf.startsWith(`${ancestor}/`);

const checkCombinedAgentsByteBudget = (
  markdownFiles: ReadonlyArray<MarkdownFile>,
): Diagnostic[] => {
  const agentsFiles = markdownFiles
    .filter((file) => path.posix.basename(file.relativePath) === AGENT_ENTRY_POINT_FILENAMES[0])
    .map((file) => ({
      file,
      directory: path.posix.dirname(file.relativePath),
      bytes: Buffer.byteLength(file.content, "utf-8"),
    }));
  let worstChain: typeof agentsFiles = [];
  let worstLeafDirectory = ".";
  let worstBytes = 0;
  for (const leaf of agentsFiles) {
    const chain = agentsFiles.filter((candidate) =>
      isDirectoryOnChainTo(candidate.directory, leaf.directory),
    );
    const chainBytes = chain.reduce((total, entry) => total + entry.bytes, 0);
    if (chainBytes > worstBytes) {
      worstBytes = chainBytes;
      worstChain = chain;
      worstLeafDirectory = leaf.directory;
    }
  }
  if (worstBytes <= COMBINED_AGENTS_MD_MAX_BYTES) return [];
  const heaviest = worstChain.reduce((max, entry) => (entry.bytes > max.bytes ? entry : max));
  const chainLabel =
    worstLeafDirectory === "."
      ? "at the repo root"
      : `on the root → \`${worstLeafDirectory}\` chain`;
  return [
    buildDocsStructureDiagnostic({
      filePath: heaviest.file.relativePath,
      rule: AGENTS_BYTE_BUDGET_RULE_KEY,
      message: `${AGENT_ENTRY_POINT_FILENAMES[0]} content ${chainLabel} is ${worstBytes} bytes across ${worstChain.length} file(s) — Codex silently stops loading project docs past its ${COMBINED_AGENTS_MD_MAX_BYTES}-byte budget, so guidance beyond the cap is dropped without warning`,
      help: `Trim or consolidate the ${AGENT_ENTRY_POINT_FILENAMES[0]} files on that chain until their combined size is under ${COMBINED_AGENTS_MD_MAX_BYTES} bytes; move depth into \`${DOCS_DIRECTORY_NAME}/\` files that load on demand`,
    }),
  ];
};

// ── docs-structure/claude-shim-imports-agents ───────────────────────────
// Claude Code reads only CLAUDE.md while other agents read AGENTS.md, so
// wherever the two sit side by side — at the repo root or in a nested
// subtree (nearest-file precedence) — the CLAUDE.md must be a shim
// importing AGENTS.md, otherwise the pair drifts into competing
// instructions.
const CLAUDE_SHIM_IMPORT_PATTERN = /(^|\s)@AGENTS\.md(\s|$)/;

const checkClaudeShimImportsAgents = (markdownFiles: ReadonlyArray<MarkdownFile>): Diagnostic[] => {
  const agentsDirectories = new Set(
    markdownFiles
      .filter((file) => path.posix.basename(file.relativePath) === AGENT_ENTRY_POINT_FILENAMES[0])
      .map((file) => path.posix.dirname(file.relativePath)),
  );
  return markdownFiles
    .filter(
      (file) =>
        path.posix.basename(file.relativePath) === "CLAUDE.md" &&
        agentsDirectories.has(path.posix.dirname(file.relativePath)) &&
        !CLAUDE_SHIM_IMPORT_PATTERN.test(file.content),
    )
    .map((file) =>
      buildDocsStructureDiagnostic({
        filePath: file.relativePath,
        rule: CLAUDE_SHIM_RULE_KEY,
        message: `${file.relativePath} exists alongside AGENTS.md but never imports it — Claude Code reads only CLAUDE.md and other agents read AGENTS.md, so two free-standing entry points drift into competing instructions`,
        help: "Make CLAUDE.md a shim whose content is the import line `@AGENTS.md` (Claude Code's import syntax), keeping AGENTS.md the single source of truth",
      }),
    );
};

// ── docs-structure/no-banned-long-lived-path ────────────────────────────
const checkBannedLongLivedPaths = (rootDirectory: string): Diagnostic[] =>
  BANNED_LONG_LIVED_HARNESS_PATHS.filter((relativePath) =>
    hasPath(rootDirectory, relativePath),
  ).map((relativePath) =>
    buildDocsStructureDiagnostic({
      filePath: relativePath,
      rule: BANNED_LONG_LIVED_PATH_RULE_KEY,
      message: `${relativePath} is a banned long-lived harness path — agent utilities, generated reports, historical plans, and vendor mirrors should not become permanent product-repo clutter`,
      help: `Remove \`${relativePath}\`, move durable knowledge into the smallest relevant docs file, or keep scanner/tooling output outside the product repo`,
    }),
  );

// ── docs-structure/markdown-link-target-exists ──────────────────────────
const checkMarkdownLinkTargets = (
  rootDirectory: string,
  markdownFiles: ReadonlyArray<MarkdownFile>,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const file of markdownFiles) {
    for (const link of collectMarkdownLinks(file)) {
      const absoluteTarget = resolveMarkdownLinkTarget(file, link.target);
      const relativeTarget = path.relative(rootDirectory, absoluteTarget);
      const isInsideRoot = relativeTarget.length === 0 || !relativeTarget.startsWith("..");
      if (!isInsideRoot || isFile(absoluteTarget) || isDirectory(absoluteTarget)) {
        continue;
      }
      diagnostics.push(
        buildDocsStructureDiagnostic({
          filePath: file.relativePath,
          rule: MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY,
          line: link.line,
          column: link.column,
          message: `${file.relativePath} links to missing target \`${link.target}\` — stale routes make agents trust docs that no longer match the repo`,
          help: `Fix or remove the link to \`${link.target}\`; if the destination moved, update the route to the current repo path`,
        }),
      );
    }
  }
  return diagnostics;
};

// ── docs-structure/todo-spec-has-required-sections ──────────────────────
const checkTodoSpecSections = (
  rootDirectory: string,
  ignoreMatcher: MarkdownIgnoreMatcher,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const todosDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME, "todos");
  if (!isDirectory(todosDirectory)) return diagnostics;
  for (const entry of readDirectoryEntries(todosDirectory)) {
    if (
      !entry.isFile() ||
      !MARKDOWN_FILE_PATTERN.test(entry.name) ||
      // Skip any case variant of INDEX.md — the todos-index check owns that file
      // (and emits the rename hint for a lowercase variant), so treating it as a
      // todo spec here would double-flag it with a bogus missing-sections finding.
      entry.name.toLowerCase() === DOCS_INDEX_FILENAME.toLowerCase()
    ) {
      continue;
    }
    const relativePath = path.posix.join(DOCS_DIRECTORY_NAME, "todos", entry.name);
    if (ignoreMatcher.isIgnored(relativePath, false)) continue;
    const content = readFileOrNull(path.join(todosDirectory, entry.name));
    if (content === null) continue;
    const headings = headingNamesFor(content);
    const missingSections = TODO_SPEC_REQUIRED_SECTIONS.filter(
      (section) => !hasHeading(headings, section.aliases),
    ).map((section) => section.label);
    if (missingSections.length === 0) continue;
    diagnostics.push(
      buildDocsStructureDiagnostic({
        filePath: relativePath,
        rule: TODO_SPEC_SECTIONS_RULE_KEY,
        message: `${relativePath} is missing todo-spec sections (${missingSections.join(
          ", ",
        )}) — durable follow-up specs need status, scope, start points, invariants, validation, and a close condition to be pick-up-ready`,
        help: `Add the missing sections to \`${relativePath}\`, or move the note back to PR/issue context if it is not a real deferred spec`,
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
 * into `docs/`; deterministic docs-contract routes must exist; and no
 * single instruction file may grow into a monolith.
 *
 * Reads files off disk and returns `Diagnostic[]` — the same shape and
 * contract as `checkPnpmHardening`. Returns `[]` for anything it can't
 * read rather than throwing.
 */
export const checkDocsStructure = (
  rootDirectory: string,
  options: DocsStructureOptions = {},
): Diagnostic[] => {
  const entryPointFilename = resolveEntryPointFilename(rootDirectory);
  const ignoreMatcher = createMarkdownIgnoreMatcher(rootDirectory);
  const markdownFiles = listMarkdownFiles(rootDirectory, ignoreMatcher);
  return [
    ...checkEntryPointExists(entryPointFilename),
    ...checkEntryPointIsAMap(rootDirectory, entryPointFilename),
    ...checkDocsDirectoryExists(rootDirectory),
    ...checkEntryPointLinksIntoDocs(rootDirectory, entryPointFilename),
    ...checkNoMonolithicInstructionFile(rootDirectory, entryPointFilename, ignoreMatcher),
    ...checkDocsIndexExists(rootDirectory),
    ...checkArchitectureMapExists(rootDirectory),
    ...checkCanonicalGlossary(rootDirectory),
    ...checkSpecContractExists(rootDirectory),
    ...checkSpecContractSections(rootDirectory),
    ...checkSpecContractDeclaresSufficiency(rootDirectory, options),
    ...checkProofMenuCommandsExist(rootDirectory),
    ...checkBehaviorBaselineArtifacts(rootDirectory, options),
    ...checkEngineeringDocsExist(rootDirectory, options),
    ...checkNoStructureMd(rootDirectory),
    ...checkCombinedAgentsByteBudget(markdownFiles),
    ...checkClaudeShimImportsAgents(markdownFiles),
    ...checkTodosIndexExists(rootDirectory, options),
    ...checkDomainDocsComplete(rootDirectory),
    ...checkBannedLongLivedPaths(rootDirectory),
    ...checkMarkdownLinkTargets(rootDirectory, markdownFiles),
    ...checkTodoSpecSections(rootDirectory, ignoreMatcher),
  ];
};
