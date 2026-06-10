import fs from "node:fs";
import path from "node:path";
import { ProjectNotFoundError } from "./errors.js";
import type { Framework, PackageJson, ProjectInfo } from "../types/index.js";
import { isDirectory } from "./utils/is-directory.js";
import { isFile } from "./utils/is-file.js";
import { countSourceFiles } from "./count-source-files.js";
import { detectFramework } from "./detect-framework.js";
import { findInWorkspacePackageJsons } from "./find-in-workspace-package-jsons.js";
import { findMonorepoRoot, isMonorepoRoot } from "./find-monorepo-root.js";
import { readPackageJson } from "./read-package-json.js";

export { discoverSubprojects } from "./discover-subprojects.js";
export { formatFrameworkName } from "./detect-framework.js";
export { listWorkspacePackages } from "./list-workspace-packages.js";

const cachedProjectInfos = new Map<string, ProjectInfo>();

// HACK: paired with clearConfigCache — exposed so programmatic API
// consumers can re-detect after the project's package.json /
// tsconfig.json / monorepo manifests change between diagnose() calls.
export const clearProjectCache = (): void => {
  cachedProjectInfos.clear();
};

const detectFrameworkFromPackageJson = (packageJson: PackageJson): Framework =>
  detectFramework({
    ...packageJson.peerDependencies,
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  });

/**
 * Best-effort framework label for score / display metadata. Resolution
 * order: the scanned root's own dependencies, then any workspace
 * package's, then (when scanning a workspace subdirectory) the monorepo
 * root's. The checks themselves never gate on this value.
 */
const resolveFramework = (directory: string, packageJson: PackageJson): Framework => {
  const rootFramework = detectFrameworkFromPackageJson(packageJson);
  if (rootFramework !== "unknown") return rootFramework;

  const workspaceFramework = findInWorkspacePackageJsons(
    directory,
    packageJson,
    (workspacePackageJson) => {
      const framework = detectFrameworkFromPackageJson(workspacePackageJson);
      return framework === "unknown" ? null : framework;
    },
  );
  if (workspaceFramework !== null) return workspaceFramework;

  if (!isMonorepoRoot(directory)) {
    const monorepoRoot = findMonorepoRoot(directory);
    const monorepoPackageJsonPath = monorepoRoot ? path.join(monorepoRoot, "package.json") : null;
    if (monorepoPackageJsonPath !== null && isFile(monorepoPackageJsonPath)) {
      return detectFrameworkFromPackageJson(readPackageJson(monorepoPackageJsonPath));
    }
  }

  return "unknown";
};

export const discoverProject = (directory: string): ProjectInfo => {
  const cached = cachedProjectInfos.get(directory);
  if (cached !== undefined) return cached;
  if (!isDirectory(directory)) {
    throw new ProjectNotFoundError(directory, { kind: "missing-path" });
  }

  const packageJsonPath = path.join(directory, "package.json");
  const packageJson = isFile(packageJsonPath) ? readPackageJson(packageJsonPath) : null;

  const projectInfo: ProjectInfo = {
    rootDirectory: directory,
    projectName: packageJson?.name ?? path.basename(directory),
    framework: packageJson ? resolveFramework(directory, packageJson) : "unknown",
    hasTypeScript: fs.existsSync(path.join(directory, "tsconfig.json")),
    sourceFileCount: countSourceFiles(directory),
  };
  cachedProjectInfos.set(directory, projectInfo);
  return projectInfo;
};
