import { isLintableSourceFile } from "./is-lintable-source-file.js";

const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;

// Harness-surface files outside the JS/TS extension gate that the
// deterministic checks report on: the docs corpus (markdown, including
// AGENTS.md / CLAUDE.md), the `.cursorrules` entry-point fallback, and
// the pnpm supply-chain manifest.
const HARNESS_SURFACE_BASENAMES = new Set([".cursorrules", "pnpm-workspace.yaml"]);

const basenameOf = (filePath: string): string => {
  const normalized = filePath.split("\\").join("/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

/**
 * Whether a changed / staged file is worth scanning. Broader than
 * `isLintableSourceFile`: diff and staged modes narrow the
 * docs-structure and supply-chain findings to the changed files, so the
 * markdown corpus and harness manifests must survive the filter or a
 * docs-only commit would always scan clean.
 */
export const isScannableFile = (filePath: string): boolean =>
  isLintableSourceFile(filePath) ||
  MARKDOWN_FILE_PATTERN.test(filePath) ||
  HARNESS_SURFACE_BASENAMES.has(basenameOf(filePath));
