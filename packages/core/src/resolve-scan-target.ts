import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfigWithSource } from "./load-config.js";
import { isDirectory, NotADirectoryError, ProjectNotFoundError } from "./project-info/index.js";
import { resolveConfigRootDir } from "./resolve-config-root-dir.js";
import type { HarnessDoctorConfig } from "./types/index.js";

export interface ResolveDiagnoseTargetOptions {
  // Retained for caller compatibility (the CLI passes `allowAmbiguous`).
  // The framework-agnostic boilerplate no longer auto-walks into nested
  // subprojects, so this flag is currently inert.
  readonly allowAmbiguous?: boolean;
}

export interface ResolvedScanTarget {
  /** Absolute path the scan should run against. */
  readonly resolvedDirectory: string;
  /** The originally-requested directory, resolved to an absolute path. */
  readonly requestedDirectory: string;
  /** The loaded user config, or `null` when no config file was found. */
  readonly userConfig: HarnessDoctorConfig | null;
  /**
   * Directory of the `harness.config.*` / `package.json` that
   * supplied `userConfig`. `null` when no config was loaded. Used as
   * the resolution base for `userConfig.plugins` entries.
   */
  readonly configSourceDirectory: string | null;
  /**
   * `true` when the config's `rootDir` redirected the scan away from
   * the requested directory. Callers can use this to surface a
   * "redirected" hint to the user.
   */
  readonly didRedirectViaRootDir: boolean;
}

/**
 * The canonical entry-point translation shared by every public shell
 * (`inspect()`, `diagnose()`, and the CLI's `inspectAction`):
 *
 *   1. Resolve the requested directory to absolute.
 *   2. Load `harness.config.*` / `package.json#harnessDoctor` if present.
 *   3. Honor `config.rootDir` to redirect the scan to a nested
 *      project root, if configured.
 *
 * Throws `ProjectNotFoundError` when the resolved directory does not
 * exist.
 *
 * Before this helper existed, the same three-step dance was reproduced
 * in `api/diagnose.ts`, `harness-doctor/inspect.ts`, and the CLI's
 * `cli/commands/inspect.ts` — each loading the config independently
 * (the orchestrator's `Config.layerNode` then loads it a fourth time
 * via its own cache). Routing through `resolveScanTarget` keeps every
 * shell in agreement on what "the scan directory" means.
 */
export const resolveScanTarget = async (
  requestedDirectory: string,
  _options: ResolveDiagnoseTargetOptions = {},
): Promise<ResolvedScanTarget> => {
  const absoluteRequested = path.resolve(requestedDirectory);
  const loadedConfig = await loadConfigWithSource(absoluteRequested);
  const userConfig = loadedConfig?.config ?? null;
  const configSourceDirectory = loadedConfig?.sourceDirectory ?? null;
  const redirectedDirectory = resolveConfigRootDir(userConfig, configSourceDirectory);
  const resolvedDirectory = redirectedDirectory ?? absoluteRequested;

  if (!isDirectory(resolvedDirectory)) {
    throw existsSync(resolvedDirectory)
      ? new NotADirectoryError(resolvedDirectory)
      : new ProjectNotFoundError(resolvedDirectory, { kind: "missing-path" });
  }

  return {
    resolvedDirectory,
    requestedDirectory: absoluteRequested,
    userConfig,
    configSourceDirectory,
    didRedirectViaRootDir: redirectedDirectory !== null,
  };
};
