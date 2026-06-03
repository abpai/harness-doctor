import type { ProjectInfo } from "../types/index.js";

/**
 * Harness Doctor is framework-agnostic: any discovered project is analyzable.
 * Project discovery already rejects paths without a `package.json` (the
 * `no-project` failure), so every {@link ProjectInfo} that reaches this gate is
 * a real project whose structural and docs-structure checks apply universally —
 * regardless of which framework, if any, it uses.
 */
export const isAnalyzableProject = (project: ProjectInfo): boolean =>
  project.rootDirectory.trim().length > 0;
