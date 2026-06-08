import fs from "node:fs";
import path from "node:path";
import {
  AGENT_ENTRY_POINT_FILENAMES,
  BANNED_LONG_LIVED_HARNESS_PATHS,
  CANONICAL_GLOSSARY_FILENAMES,
  DOCS_ARCHITECTURE_FILENAME,
  DOCS_DIRECTORY_NAME,
  DOCS_INDEX_FILENAME,
  DOMAIN_DOC_REQUIRED_FILENAMES,
  ENTRY_POINT_MAX_LINES,
  ENTRY_POINT_MIN_DOCS_LINKS,
  MONOLITHIC_DOC_MAX_LINES,
} from "../constants.js";
import { isDirectory, isFile, readDirectoryEntries } from "../project-info/index.js";
import type { Diagnostic } from "../types/index.js";

const MARKDOWN_FILE_PATTERN = /\.md$/i;
const MARKDOWN_LINK_PATTERN = /(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g;
const MARKDOWN_REFERENCE_DEFINITION_PATTERN = /^\s*\[[^\]\n]+]:\s+(\S+)/gm;
const HEADING_PATTERN = /^#{1,6}\s+(.+?)\s*#?\s*$/gm;
const FENCED_CODE_BLOCK_PATTERN = /^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1[ \t]*$/gm;

const ENTRY_POINT_EXISTS_RULE_KEY = "docs-structure/entry-point-exists";
const ENTRY_POINT_IS_A_MAP_RULE_KEY = "docs-structure/entry-point-is-a-map";
const DOCS_DIRECTORY_EXISTS_RULE_KEY = "docs-structure/docs-directory-exists";
const ENTRY_POINT_LINKS_INTO_DOCS_RULE_KEY = "docs-structure/entry-point-links-into-docs";
const NO_MONOLITHIC_INSTRUCTION_FILE_RULE_KEY = "docs-structure/no-monolithic-instruction-file";
const DOCS_INDEX_EXISTS_RULE_KEY = "docs-structure/docs-index-exists";
const ARCHITECTURE_MAP_EXISTS_RULE_KEY = "docs-structure/architecture-map-exists";
const CANONICAL_GLOSSARY_EXISTS_RULE_KEY = "docs-structure/canonical-glossary-exists";
const SINGLE_CANONICAL_GLOSSARY_RULE_KEY = "docs-structure/single-canonical-glossary";
const TODOS_INDEX_EXISTS_RULE_KEY = "docs-structure/todos-index-exists";
const DOMAIN_DOCS_COMPLETE_RULE_KEY = "docs-structure/domain-docs-complete";
const BANNED_LONG_LIVED_PATH_RULE_KEY = "docs-structure/no-banned-long-lived-path";
const MARKDOWN_LINK_TARGET_EXISTS_RULE_KEY = "docs-structure/markdown-link-target-exists";
const TODO_SPEC_SECTIONS_RULE_KEY = "docs-structure/todo-spec-has-required-sections";

export interface DocsStructureOptions {
  readonly docsContract?: boolean;
}

interface BuildDiagnosticInput {
  readonly filePath: string;
  readonly rule: string;
  readonly message: string;
  readonly help: string;
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

const docsIndexPath = path.posix.join(DOCS_DIRECTORY_NAME, DOCS_INDEX_FILENAME);
const docsArchitecturePath = path.posix.join(DOCS_DIRECTORY_NAME, DOCS_ARCHITECTURE_FILENAME);
const todosIndexPath = path.posix.join(DOCS_DIRECTORY_NAME, "todos", DOCS_INDEX_FILENAME);

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

const toPosixPath = (filePath: string): string => filePath.split(path.sep).join(path.posix.sep);

const toRelativePosixPath = (rootDirectory: string, absolutePath: string): string =>
  toPosixPath(path.relative(rootDirectory, absolutePath));

const hasPath = (rootDirectory: string, relativePath: string): boolean => {
  const absolutePath = path.join(rootDirectory, relativePath);
  return isFile(absolutePath) || isDirectory(absolutePath);
};

const listMarkdownFiles = (rootDirectory: string): MarkdownFile[] => {
  const markdownFiles: MarkdownFile[] = [];
  const visitDirectory = (absoluteDirectory: string): void => {
    for (const entry of readDirectoryEntries(absoluteDirectory)) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const absolutePath = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visitDirectory(absolutePath);
        continue;
      }
      if (!entry.isFile() || !MARKDOWN_FILE_PATTERN.test(entry.name)) continue;
      const content = readFileOrNull(absolutePath);
      if (content === null) continue;
      markdownFiles.push({
        relativePath: toRelativePosixPath(rootDirectory, absolutePath),
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

// ── docs-structure/docs-index-exists ────────────────────────────────────
const checkDocsIndexExists = (rootDirectory: string): Diagnostic[] => {
  if (isFile(path.join(rootDirectory, docsIndexPath))) return [];
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

// ── docs-structure/canonical-glossary-exists / single-canonical-glossary ─
const checkCanonicalGlossary = (rootDirectory: string): Diagnostic[] => {
  const presentGlossaries = CANONICAL_GLOSSARY_FILENAMES.filter((filename) =>
    isFile(path.join(rootDirectory, filename)),
  );
  if (presentGlossaries.length === 1) return [];
  if (presentGlossaries.length === 0) {
    return [
      buildDocsStructureDiagnostic({
        filePath: CANONICAL_GLOSSARY_FILENAMES[0],
        rule: CANONICAL_GLOSSARY_EXISTS_RULE_KEY,
        message:
          "No canonical glossary found — non-obvious project terms will keep spreading as inconsistent synonyms in docs, code, issues, and agent handoffs",
        help: `Add \`${CANONICAL_GLOSSARY_FILENAMES[0]}\`, or keep one existing convention (${CANONICAL_GLOSSARY_FILENAMES.join(
          ", ",
        )}) and link it from \`${docsIndexPath}\``,
      }),
    ];
  }
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
  if (!shouldRequireTodosIndex || isFile(path.join(rootDirectory, todosIndexPath))) return [];
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
const checkMarkdownLinkTargets = (rootDirectory: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  for (const file of listMarkdownFiles(rootDirectory)) {
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
const checkTodoSpecSections = (rootDirectory: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const todosDirectory = path.join(rootDirectory, DOCS_DIRECTORY_NAME, "todos");
  if (!isDirectory(todosDirectory)) return diagnostics;
  for (const entry of readDirectoryEntries(todosDirectory)) {
    if (
      !entry.isFile() ||
      !MARKDOWN_FILE_PATTERN.test(entry.name) ||
      entry.name === DOCS_INDEX_FILENAME
    ) {
      continue;
    }
    const relativePath = path.posix.join(DOCS_DIRECTORY_NAME, "todos", entry.name);
    const content = readFileOrNull(path.join(todosDirectory, entry.name));
    if (content === null) continue;
    const headings = headingNamesFor(content);
    const missingSections = [
      hasHeading(headings, ["status"]) ? null : "Status",
      hasHeading(headings, ["scope"]) ? null : "Scope",
      hasHeading(headings, ["start here", "start points"]) ? null : "Start here",
      hasHeading(headings, ["invariants", "invariant"]) ? null : "Invariants",
      hasHeading(headings, ["validation"]) ? null : "Validation",
      hasHeading(headings, ["close when", "close condition", "done when"]) ? null : "Close when",
    ].filter((section): section is string => section !== null);
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
  return [
    ...checkEntryPointExists(entryPointFilename),
    ...checkEntryPointIsAMap(rootDirectory, entryPointFilename),
    ...checkDocsDirectoryExists(rootDirectory),
    ...checkEntryPointLinksIntoDocs(rootDirectory, entryPointFilename),
    ...checkNoMonolithicInstructionFile(rootDirectory, entryPointFilename),
    ...checkDocsIndexExists(rootDirectory),
    ...checkArchitectureMapExists(rootDirectory),
    ...checkCanonicalGlossary(rootDirectory),
    ...checkTodosIndexExists(rootDirectory, options),
    ...checkDomainDocsComplete(rootDirectory),
    ...checkBannedLongLivedPaths(rootDirectory),
    ...checkMarkdownLinkTargets(rootDirectory),
    ...checkTodoSpecSections(rootDirectory),
  ];
};
