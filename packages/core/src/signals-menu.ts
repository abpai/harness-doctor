import fs from "node:fs";
import path from "node:path";
import {
  isDirectory,
  isFile,
  isPlainObject,
  listWorkspacePackages,
  readDirectoryEntries,
} from "./project-info/index.js";
import type { CiCommandSignal, PackageScriptSignal, SignalsMenu } from "./types/signals.js";
import { warnConfigIssue } from "./utils/warn-config-issue.js";

interface PackageJsonWithScripts {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
}

interface YamlKeyValue {
  readonly key: string;
  readonly value: string;
  readonly isListItem: boolean;
}

interface WorkflowParseResult {
  readonly commands: CiCommandSignal[];
  readonly didWarn: boolean;
}

const PACKAGE_JSON_FILE = "package.json";
const WORKFLOWS_DIRECTORY_SEGMENTS = [".github", "workflows"] as const;
const WORKFLOWS_DIRECTORY_POSIX = WORKFLOWS_DIRECTORY_SEGMENTS.join(path.posix.sep);
const WORKFLOW_FILE_PATTERN = /\.ya?ml$/i;
const MAKEFILE_NAME = "Makefile";
const JUSTFILE_NAMES = ["justfile", "Justfile"];
const WORKSPACE_ROOT_LABEL = "";

export const createEmptySignalsMenu = (): SignalsMenu => ({
  packageScripts: [],
  ciCommands: [],
  makeTargets: [],
  justRecipes: [],
});

const warnSignalsIssue = (message: string): void => {
  warnConfigIssue(`signals: ${message}`);
};

const readTextFileOrNull = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnSignalsIssue(`skipping ${filePath}: ${message}`);
    return null;
  }
};

const readPackageJsonOrNull = (packageJsonPath: string): PackageJsonWithScripts | null => {
  const content = readTextFileOrNull(packageJsonPath);
  if (content === null) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isPlainObject(parsed)) {
      warnSignalsIssue(`skipping ${packageJsonPath}: package.json root is not an object`);
      return null;
    }
    const scripts = parsed.scripts;
    if (scripts !== undefined && !isPlainObject(scripts)) {
      warnSignalsIssue(`skipping scripts in ${packageJsonPath}: scripts is not an object`);
      return {
        ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
      };
    }
    const stringScripts: Record<string, string> = {};
    if (isPlainObject(scripts)) {
      for (const [name, command] of Object.entries(scripts)) {
        if (typeof command !== "string") {
          warnSignalsIssue(
            `skipping script ${name} in ${packageJsonPath}: command is not a string`,
          );
          continue;
        }
        stringScripts[name] = command;
      }
    }
    return {
      ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
      ...(Object.keys(stringScripts).length > 0 ? { scripts: stringScripts } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnSignalsIssue(`skipping malformed JSON ${packageJsonPath}: ${message}`);
    return null;
  }
};

const workspaceLabelFor = (
  rootDirectory: string,
  packageDirectory: string,
  packageJson: PackageJsonWithScripts | null,
  fallbackName: string,
): string | null => {
  if (path.resolve(packageDirectory) === path.resolve(rootDirectory)) return null;
  if (typeof packageJson?.name === "string" && packageJson.name.length > 0) {
    return packageJson.name;
  }
  if (fallbackName.length > 0) return fallbackName;
  return path.relative(rootDirectory, packageDirectory).split(path.sep).join(path.posix.sep);
};

const discoverPackageScripts = (rootDirectory: string): PackageScriptSignal[] => {
  const rootPackageJsonPath = path.join(rootDirectory, PACKAGE_JSON_FILE);
  if (!isFile(rootPackageJsonPath)) return [];

  let workspacePackages: ReturnType<typeof listWorkspacePackages>;
  try {
    workspacePackages = listWorkspacePackages(rootDirectory);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnSignalsIssue(`skipping workspace discovery: ${message}`);
    workspacePackages = [];
  }

  const packageDirectories =
    workspacePackages.length > 0
      ? workspacePackages
      : [{ name: path.basename(rootDirectory), directory: rootDirectory }];

  const scripts: PackageScriptSignal[] = [];
  const seenDirectories = new Set<string>();
  for (const workspacePackage of packageDirectories) {
    const packageDirectory = path.resolve(workspacePackage.directory);
    if (seenDirectories.has(packageDirectory)) continue;
    seenDirectories.add(packageDirectory);
    const packageJson = readPackageJsonOrNull(path.join(packageDirectory, PACKAGE_JSON_FILE));
    if (packageJson?.scripts === undefined) continue;
    const workspace = workspaceLabelFor(
      rootDirectory,
      packageDirectory,
      packageJson,
      workspacePackage.name,
    );
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      scripts.push({ workspace, name, command });
    }
  }
  return scripts.sort((left, right) => {
    const leftWorkspace = left.workspace ?? WORKSPACE_ROOT_LABEL;
    const rightWorkspace = right.workspace ?? WORKSPACE_ROOT_LABEL;
    return (
      leftWorkspace.localeCompare(rightWorkspace) ||
      left.name.localeCompare(right.name) ||
      left.command.localeCompare(right.command)
    );
  });
};

const leadingWhitespace = (lineText: string): string => lineText.match(/^\s*/)?.[0] ?? "";

const indentationWidth = (lineText: string): number => leadingWhitespace(lineText).length;

const stripYamlInlineComment = (rawValue: string): string => {
  let activeQuote: '"' | "'" | null = null;
  for (let charIndex = 0; charIndex < rawValue.length; charIndex += 1) {
    const currentChar = rawValue[charIndex];
    if (activeQuote !== null) {
      if (currentChar === activeQuote) activeQuote = null;
      continue;
    }
    if (currentChar === '"' || currentChar === "'") {
      activeQuote = currentChar;
      continue;
    }
    if (currentChar !== "#") continue;
    const previousChar = rawValue[charIndex - 1];
    if (charIndex === 0 || (previousChar !== undefined && /\s/.test(previousChar))) {
      return rawValue.slice(0, charIndex);
    }
  }
  return rawValue;
};

const unquoteScalar = (value: string): string => value.replace(/^["']|["']$/g, "");

const findYamlKeyColon = (lineText: string): number => {
  let activeQuote: '"' | "'" | null = null;
  for (let charIndex = 0; charIndex < lineText.length; charIndex += 1) {
    const currentChar = lineText[charIndex];
    if (activeQuote !== null) {
      if (currentChar === activeQuote) activeQuote = null;
      continue;
    }
    if (currentChar === '"' || currentChar === "'") {
      activeQuote = currentChar;
      continue;
    }
    if (currentChar === ":") return charIndex;
  }
  return -1;
};

const parseYamlKeyValue = (lineText: string): YamlKeyValue | null => {
  const trimmedLine = lineText.trim();
  if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) return null;
  const isListItem = trimmedLine.startsWith("- ");
  const unlisted = isListItem ? trimmedLine.slice(2).trimStart() : trimmedLine;
  const colonIndex = findYamlKeyColon(unlisted);
  if (colonIndex <= 0) return null;
  const key = unquoteScalar(unlisted.slice(0, colonIndex).trim());
  if (key.length === 0) return null;
  const value = stripYamlInlineComment(unlisted.slice(colonIndex + 1)).trim();
  return { key, value, isListItem };
};

const isBlockScalarMarker = (value: string): boolean => /^[>|][+-]?$/.test(value);

const collectBlockScalar = (
  lines: string[],
  startIndex: number,
  parentIndent: number,
  marker: string,
): { command: string | null; nextIndex: number } => {
  const blockLines: string[] = [];
  let lineIndex = startIndex + 1;
  let blockIndent: number | null = null;

  while (lineIndex < lines.length) {
    const lineText = lines[lineIndex] ?? "";
    const trimmedLine = lineText.trim();
    const indent = indentationWidth(lineText);
    if (trimmedLine.length > 0 && indent <= parentIndent) break;
    if (trimmedLine.length === 0) {
      blockLines.push("");
      lineIndex += 1;
      continue;
    }
    if (blockIndent === null) blockIndent = indent;
    blockLines.push(lineText.slice(Math.min(blockIndent, lineText.length)));
    lineIndex += 1;
  }

  if (blockLines.length === 0) return { command: null, nextIndex: lineIndex };
  const command = marker.startsWith(">")
    ? blockLines
        .map((lineText) => lineText.trim())
        .join(" ")
        .trim()
    : blockLines.join("\n").trimEnd();
  return { command: command.length > 0 ? command : null, nextIndex: lineIndex };
};

const parseWorkflowCommands = (
  workflowPath: string,
  relativeWorkflowPath: string,
): WorkflowParseResult => {
  const content = readTextFileOrNull(workflowPath);
  if (content === null) return { commands: [], didWarn: true };
  const lines = content.split(/\r?\n/);
  if (lines.some((lineText) => /^\t+/.test(lineText))) {
    warnSignalsIssue(`skipping malformed workflow ${relativeWorkflowPath}: tab indentation`);
    return { commands: [], didWarn: true };
  }

  const commandsByJob = new Map<string, string[]>();
  let jobsIndent: number | null = null;
  let jobIndent: number | null = null;
  let currentJob: string | null = null;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const lineText = lines[lineIndex] ?? "";
    const indent = indentationWidth(lineText);
    const keyValue = parseYamlKeyValue(lineText);

    if (keyValue?.key === "jobs" && !keyValue.isListItem) {
      jobsIndent = indent;
      jobIndent = null;
      currentJob = null;
      lineIndex += 1;
      continue;
    }

    if (jobsIndent === null) {
      lineIndex += 1;
      continue;
    }

    if (lineText.trim().length > 0 && indent <= jobsIndent) {
      jobsIndent = null;
      jobIndent = null;
      currentJob = null;
      continue;
    }

    if (keyValue !== null && !keyValue.isListItem && indent > jobsIndent) {
      if (jobIndent === null) jobIndent = indent;
      if (indent === jobIndent) {
        currentJob = keyValue.key;
        if (!commandsByJob.has(currentJob)) commandsByJob.set(currentJob, []);
        lineIndex += 1;
        continue;
      }
    }

    if (
      currentJob !== null &&
      jobIndent !== null &&
      indent > jobIndent &&
      keyValue?.key === "run"
    ) {
      const commandList = commandsByJob.get(currentJob);
      if (commandList === undefined) {
        lineIndex += 1;
        continue;
      }
      if (isBlockScalarMarker(keyValue.value)) {
        const block = collectBlockScalar(lines, lineIndex, indent, keyValue.value);
        if (block.command === null) {
          warnSignalsIssue(`skipping empty run block in ${relativeWorkflowPath} job ${currentJob}`);
        } else {
          commandList.push(block.command);
        }
        lineIndex = block.nextIndex;
        continue;
      }
      const command = unquoteScalar(keyValue.value);
      if (command.length > 0) commandList.push(command);
    }

    lineIndex += 1;
  }

  return {
    commands: [...commandsByJob.entries()]
      .filter((entry) => entry[1].length > 0)
      .map(([job, commands]) => ({ workflow: relativeWorkflowPath, job, commands })),
    didWarn: false,
  };
};

const discoverCiCommands = (rootDirectory: string): CiCommandSignal[] => {
  const workflowsDirectory = path.join(rootDirectory, ...WORKFLOWS_DIRECTORY_SEGMENTS);
  if (!isDirectory(workflowsDirectory)) return [];
  const commands: CiCommandSignal[] = [];
  for (const entry of readDirectoryEntries(workflowsDirectory).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.isFile() || !WORKFLOW_FILE_PATTERN.test(entry.name)) continue;
    const relativeWorkflowPath = path.posix.join(WORKFLOWS_DIRECTORY_POSIX, entry.name);
    const result = parseWorkflowCommands(
      path.join(workflowsDirectory, entry.name),
      relativeWorkflowPath,
    );
    if (result.didWarn) continue;
    commands.push(...result.commands);
  }
  return commands.sort(
    (left, right) =>
      left.workflow.localeCompare(right.workflow) || left.job.localeCompare(right.job),
  );
};

const parseMakeTargets = (content: string): string[] => {
  const targets = new Set<string>();
  for (const lineText of content.split(/\r?\n/)) {
    if (lineText.trim().length === 0 || /^\s/.test(lineText) || lineText.trim().startsWith("#")) {
      continue;
    }
    const colonIndex = lineText.indexOf(":");
    if (colonIndex <= 0) continue;
    const targetText = lineText.slice(0, colonIndex).trim();
    if (targetText.startsWith(".") || targetText.includes("=")) continue;
    for (const target of targetText.split(/\s+/)) {
      if (target.length === 0 || target.includes("%")) continue;
      targets.add(target);
    }
  }
  return [...targets].sort((left, right) => left.localeCompare(right));
};

const discoverMakeTargets = (rootDirectory: string): string[] => {
  const makefilePath = path.join(rootDirectory, MAKEFILE_NAME);
  if (!isFile(makefilePath)) return [];
  const content = readTextFileOrNull(makefilePath);
  return content === null ? [] : parseMakeTargets(content);
};

const parseJustRecipes = (content: string): string[] => {
  const recipes = new Set<string>();
  for (const lineText of content.split(/\r?\n/)) {
    if (lineText.trim().length === 0 || /^\s/.test(lineText) || lineText.trim().startsWith("#")) {
      continue;
    }
    const trimmedLine = lineText.trim();
    if (trimmedLine.startsWith("set ") || trimmedLine.startsWith("alias ")) continue;
    const match = /^@?([A-Za-z0-9_.-]+)(?:\s[^:=]*)?:/.exec(trimmedLine);
    const recipe = match?.[1];
    if (recipe === undefined || recipe.length === 0) continue;
    recipes.add(recipe);
  }
  return [...recipes].sort((left, right) => left.localeCompare(right));
};

const discoverJustRecipes = (rootDirectory: string): string[] => {
  const justfileName = JUSTFILE_NAMES.find((filename) =>
    isFile(path.join(rootDirectory, filename)),
  );
  if (justfileName === undefined) return [];
  const content = readTextFileOrNull(path.join(rootDirectory, justfileName));
  return content === null ? [] : parseJustRecipes(content);
};

const tokenizeCommand = (command: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let activeQuote: '"' | "'" | null = null;
  let didEscape = false;

  for (const currentChar of command.trim()) {
    if (didEscape) {
      current += currentChar;
      didEscape = false;
      continue;
    }
    if (currentChar === "\\" && activeQuote !== "'") {
      didEscape = true;
      continue;
    }
    if (activeQuote !== null) {
      if (currentChar === activeQuote) {
        activeQuote = null;
      } else {
        current += currentChar;
      }
      continue;
    }
    if (currentChar === '"' || currentChar === "'") {
      activeQuote = currentChar;
      continue;
    }
    if (/\s/.test(currentChar)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += currentChar;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
};

const matchesWorkspace = (actualWorkspace: string | null, requestedWorkspace: string): boolean =>
  actualWorkspace !== null && actualWorkspace === requestedWorkspace;

const hasPackageScript = (
  signals: SignalsMenu,
  scriptName: string,
  workspace: string | null = null,
): boolean =>
  signals.packageScripts.some(
    (script) =>
      script.name === scriptName &&
      (workspace === null || matchesWorkspace(script.workspace, workspace)),
  );

const resolvePnpmScriptName = (
  tokens: string[],
): { scriptName: string | null; workspace: string | null } => {
  let workspace: string | null = null;
  let tokenIndex = 1;
  while (tokenIndex < tokens.length) {
    const token = tokens[tokenIndex] ?? "";
    if (token === "--filter" || token === "-F") {
      workspace = tokens[tokenIndex + 1] ?? null;
      tokenIndex += 2;
      continue;
    }
    if (token.startsWith("--filter=")) {
      workspace = token.slice("--filter=".length);
      tokenIndex += 1;
      continue;
    }
    if (token.startsWith("-")) {
      tokenIndex += 1;
      continue;
    }
    if (token === "run") {
      return { scriptName: tokens[tokenIndex + 1] ?? null, workspace };
    }
    return { scriptName: token, workspace };
  }
  return { scriptName: null, workspace };
};

const resolveNpmScriptName = (tokens: string[]): string | null => {
  const runIndex = tokens.indexOf("run");
  if (runIndex === -1) return null;
  return tokens[runIndex + 1] ?? null;
};

const firstCommandOperand = (tokens: string[]): string | null => {
  for (let tokenIndex = 1; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex] ?? "";
    if (token.length === 0 || token.includes("=")) continue;
    if (token.startsWith("-")) continue;
    return token;
  }
  return null;
};

export const commandExistsInSignalsMenu = (command: string, signals: SignalsMenu): boolean => {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) return false;
  const executable = tokens[0] ?? "";
  if (tokens.length === 1 && hasPackageScript(signals, executable)) return true;

  if (executable === "pnpm") {
    const { scriptName, workspace } = resolvePnpmScriptName(tokens);
    return scriptName !== null && hasPackageScript(signals, scriptName, workspace);
  }

  if (executable === "npm") {
    const scriptName = resolveNpmScriptName(tokens);
    return scriptName !== null && hasPackageScript(signals, scriptName);
  }

  if (executable === "make") {
    const target = firstCommandOperand(tokens);
    return target !== null && signals.makeTargets.includes(target);
  }

  if (executable === "just") {
    const recipe = firstCommandOperand(tokens);
    return recipe !== null && signals.justRecipes.includes(recipe);
  }

  return false;
};

export const discoverSignalsMenu = (rootDirectory: string): SignalsMenu => {
  try {
    return {
      packageScripts: discoverPackageScripts(rootDirectory),
      ciCommands: discoverCiCommands(rootDirectory),
      makeTargets: discoverMakeTargets(rootDirectory),
      justRecipes: discoverJustRecipes(rootDirectory),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnSignalsIssue(`discovery failed: ${message}`);
    return createEmptySignalsMenu();
  }
};
