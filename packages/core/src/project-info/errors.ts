/**
 * Narrow errors raised by the project-discovery helpers
 * (`discoverProject` / `resolveDiagnoseTarget` / `readPackageJson`).
 *
 * These extend `Error` directly — they are NOT the tagged
 * `HarnessDoctorError` from `../errors.js` (that one wraps every
 * runtime-pipeline failure as a `Schema.TaggedErrorClass` for
 * `Effect.catchReasons` dispatch). The split is intentional:
 *
 * - Discovery happens BEFORE the Effect runtime takes over — at the
 *   `diagnose()` / CLI entry point — and throws plain JS exceptions
 *   so callers can `try/catch` without an Effect-layer-aware
 *   `instanceof` check.
 * - The Project service (`services/project.ts → translateProjectInfoError`)
 *   translates each of these into the equivalent tagged-error
 *   `reason` before re-raising inside the Effect pipeline, so the
 *   runtime never sees a non-tagged failure.
 *
 * If you're inside the Effect runtime, use the tagged
 * `HarnessDoctorError` from `../errors.js` instead.
 */

/**
 * Distinguishes the two situations that both surface as "no project here", so
 * the rendered message matches reality:
 *
 * - `no-project` (default): the path exists but has no project — no
 *   `package.json` at the root and no discoverable nested subproject.
 * - `missing-path`: the resolved scan target does not exist on disk at all
 *   (a typo, a stale temp path, a monorepo subdir that isn't present). The
 *   generic "expected a package.json" guidance is misleading here, so point
 *   at the missing path instead.
 */
export interface ProjectNotFoundOptions extends ErrorOptions {
  readonly kind?: "no-project" | "missing-path";
}

export class ProjectNotFoundError extends Error {
  override readonly name = "ProjectNotFoundError";
  readonly directory: string;
  readonly kind: "no-project" | "missing-path";

  constructor(directory: string, options?: ProjectNotFoundOptions) {
    const kind = options?.kind ?? "no-project";
    super(
      kind === "missing-path"
        ? `Scan target "${directory}" does not exist. Check the path and try again.`
        : `No project found in ${directory}. Expected a package.json at the directory root or in a nested subproject.`,
      options,
    );
    this.directory = directory;
    this.kind = kind;
  }
}

export class PackageJsonNotFoundError extends Error {
  override readonly name = "PackageJsonNotFoundError";
  readonly directory: string;

  constructor(directory: string, options?: ErrorOptions) {
    super(`No package.json found in ${directory}`, options);
    this.directory = directory;
  }
}

export class NotADirectoryError extends Error {
  override readonly name = "NotADirectoryError";
  readonly resolvedPath: string;

  constructor(resolvedPath: string, options?: ErrorOptions) {
    super(
      `Resolved scan target "${resolvedPath}" is not a directory. Ensure the path exists and points to a project directory, not a file.`,
      options,
    );
    this.resolvedPath = resolvedPath;
  }
}

export class AmbiguousProjectError extends Error {
  override readonly name = "AmbiguousProjectError";
  readonly directory: string;
  readonly candidates: readonly string[];

  constructor(directory: string, candidates: readonly string[], options?: ErrorOptions) {
    super(
      `Multiple projects found under ${directory} (${candidates.length} candidates): ${candidates.join(", ")}. Re-run diagnose() with one of those subdirectories, or iterate them yourself.`,
      options,
    );
    this.directory = directory;
    this.candidates = candidates;
  }
}

export const isProjectDiscoveryError = (
  value: unknown,
): value is
  | ProjectNotFoundError
  | PackageJsonNotFoundError
  | NotADirectoryError
  | AmbiguousProjectError =>
  value instanceof ProjectNotFoundError ||
  value instanceof PackageJsonNotFoundError ||
  value instanceof NotADirectoryError ||
  value instanceof AmbiguousProjectError;
