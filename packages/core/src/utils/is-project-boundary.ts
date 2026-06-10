import fs from "node:fs";
import path from "node:path";
import { isMonorepoRoot } from "../project-info/find-monorepo-root.js";

/**
 * True when `directory` looks like a project root we shouldn't walk
 * past — either the working tree's git root (a `.git` entry sits
 * here) or an npm/pnpm/yarn/bun monorepo root.
 *
 * Used as the stop-condition for the ancestor walk performed by
 * `loadConfigWithSource`.
 */
export const isProjectBoundary = (directory: string): boolean =>
  fs.existsSync(path.join(directory, ".git")) || isMonorepoRoot(directory);
