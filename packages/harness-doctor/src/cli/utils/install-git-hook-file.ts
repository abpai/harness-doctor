import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { GIT_HOOK_EXECUTABLE_MODE } from "./constants.js";
import {
  ensureTrailingNewline,
  LEGACY_HOOK_RUNNER_RELATIVE_PATH,
  HARNESS_DOCTOR_COMMAND,
  runGit,
} from "./git-hook-shared.js";
import {
  GitHookKind,
  type InstallGitHookOptions,
  type InstallGitHookResult,
} from "./git-hook-types.js";

const HARNESS_DOCTOR_BLOCK_START = "# harness-doctor hook start";
const HARNESS_DOCTOR_BLOCK_END = "# harness-doctor hook end";
const LEGACY_MANAGED_BLOCK_START = "# harness-doctor hook launcher start";
const LEGACY_MANAGED_BLOCK_END = "# harness-doctor hook launcher end";
const HARNESS_DOCTOR_BLOCK_PATTERN = new RegExp(
  `(?:${HARNESS_DOCTOR_BLOCK_START}[\\s\\S]*?${HARNESS_DOCTOR_BLOCK_END}\\n?|${LEGACY_MANAGED_BLOCK_START}[\\s\\S]*?${LEGACY_MANAGED_BLOCK_END}\\n?)`,
);
const SHEBANG = "#!/bin/sh";
const SHEBANG_PREFIX = "#!";
const LOCAL_HARNESS_DOCTOR_BIN = "./node_modules/.bin/harness-doctor";
const PNPM_HARNESS_DOCTOR_COMMAND = "pnpm dlx @andypai/harness-doctor@latest --staged --fail-on warning";
const NPX_HARNESS_DOCTOR_COMMAND = "npx --yes @andypai/harness-doctor@latest --staged --fail-on warning";

const buildHarnessDoctorHookBlock = (): string =>
  [
    HARNESS_DOCTOR_BLOCK_START,
    "harness_doctor_scan_staged_files() {",
    `  if [ -x "${LOCAL_HARNESS_DOCTOR_BIN}" ]; then`,
    `    "${LOCAL_HARNESS_DOCTOR_BIN}" ${HARNESS_DOCTOR_COMMAND.replace("harness-doctor ", "")}`,
    "    return",
    "  fi",
    "",
    "  if command -v harness-doctor >/dev/null 2>&1; then",
    `    ${HARNESS_DOCTOR_COMMAND}`,
    "    return",
    "  fi",
    "",
    "  if command -v pnpm >/dev/null 2>&1; then",
    `    ${PNPM_HARNESS_DOCTOR_COMMAND}`,
    "    return",
    "  fi",
    "",
    "  if command -v npx >/dev/null 2>&1; then",
    `    ${NPX_HARNESS_DOCTOR_COMMAND}`,
    "    return",
    "  fi",
    "",
    "  printf '%s\\n' \"harness-doctor: command not found; skipping staged scan.\"",
    "}",
    "",
    'harness_doctor_output=$(mktemp "${TMPDIR:-/tmp}/harness-doctor-hook.XXXXXX")',
    'if harness_doctor_scan_staged_files > "$harness_doctor_output" 2>&1; then',
    '  rm -f "$harness_doctor_output"',
    "else",
    '  rm -f "$harness_doctor_output"',
    `  printf '%s\\n' "Harness Doctor found staged regressions." "Run ${HARNESS_DOCTOR_COMMAND} to inspect." "Want them fixed? Ask your agent to run that command and resolve the findings." >&2`,
    "fi",
    HARNESS_DOCTOR_BLOCK_END,
  ].join("\n");

const mergeHookContent = (existingContent: string): string => {
  const hookBlock = `${buildHarnessDoctorHookBlock()}\n`;

  if (HARNESS_DOCTOR_BLOCK_PATTERN.test(existingContent)) {
    return ensureTrailingNewline(existingContent.replace(HARNESS_DOCTOR_BLOCK_PATTERN, hookBlock));
  }

  if (existingContent.length === 0) return `${SHEBANG}\n\n${hookBlock}`;

  const normalizedExistingContent = ensureTrailingNewline(existingContent);

  if (normalizedExistingContent.startsWith(SHEBANG_PREFIX)) {
    const [shebangLine, ...remainingLines] = normalizedExistingContent.split("\n");
    return [shebangLine, "", hookBlock.trimEnd(), ...remainingLines].join("\n");
  }

  return `${SHEBANG}\n\n${hookBlock}${normalizedExistingContent}`;
};

export const removeLegacyManagedRunner = (projectRoot: string): void => {
  const runnerPath = path.join(projectRoot, LEGACY_HOOK_RUNNER_RELATIVE_PATH);
  rmSync(runnerPath, { force: true });
  for (const directory of [path.dirname(runnerPath), path.join(projectRoot, ".harness-doctor")]) {
    try {
      rmdirSync(directory);
    } catch {}
  }
};

export const installDirectGitHook = (options: InstallGitHookOptions): InstallGitHookResult => {
  const didHookExist = existsSync(options.hookPath);
  const existingContent = didHookExist ? readFileSync(options.hookPath, "utf8") : "";
  const nextContent = mergeHookContent(existingContent);

  if (options.hooksPathConfig !== undefined) {
    runGit(options.projectRoot, ["config", "core.hooksPath", options.hooksPathConfig]);
  }

  mkdirSync(path.dirname(options.hookPath), { recursive: true });
  writeFileSync(options.hookPath, nextContent);
  chmodSync(options.hookPath, GIT_HOOK_EXECUTABLE_MODE);
  removeLegacyManagedRunner(options.projectRoot);

  return {
    hookPath: options.hookPath,
    kind: options.kind ?? GitHookKind.Git,
    status: didHookExist ? "updated" : "created",
  };
};
