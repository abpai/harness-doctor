import path from "node:path";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Filter from "effect/Filter";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import type {
  Diagnostic,
  DiagnosticSurface,
  ProjectInfo,
  HarnessDoctorConfig,
  ScoreResult,
} from "./types/index.js";
import { buildDiagnosticPipeline } from "./build-diagnostic-pipeline.js";
import { checkDocsStructure } from "./checks/docs-structure.js";
import { checkPnpmHardening } from "./checks/pnpm-hardening.js";
import { DEFAULT_SHOW_WARNINGS } from "./constants.js";
import { deadCodeMaySurfaceWhenWarningsHidden } from "./utils/dead-code-may-surface.js";
import { HarnessDoctorError } from "./errors.js";
import { filterDiagnosticsForSurface } from "./filter-for-surface.js";
import { Config, type ResolvedConfig } from "./services/config.js";
import { DeadCode } from "./services/dead-code.js";
import { Files } from "./services/files.js";
import { Git } from "./services/git.js";
import { Progress } from "./services/progress.js";
import { Project } from "./services/project.js";
import { Reporter } from "./services/reporter.js";
import { Score } from "./services/score.js";
import type { ScoreRequestMetadata } from "./calculate-score.js";
import { resolveGithubActionsScoreMetadata } from "./utils/resolve-github-actions-score-metadata.js";

export interface InspectInput {
  readonly directory: string;
  readonly includePaths: ReadonlyArray<string>;
  readonly respectInlineDisables: boolean;
  /**
   * Per-call override for `HarnessDoctorConfig.warnings`. When omitted,
   * the loaded config's `warnings` value wins (defaulting to `true`),
   * so warnings surface unless the user opts out via `--no-warnings` or
   * `warnings: false`.
   */
  readonly warnings?: boolean;
  /** Whether dead-code analysis runs. Gated also on `!isDiffMode`. */
  readonly runDeadCode: boolean;
  /** Marks the run as CI-originated for the Score API. */
  readonly isCi: boolean;
  /** harness-doctor release version sent with score requests. */
  readonly doctorVersion?: string;
  /** Enables best-effort authenticated local GitHub permission lookup for score metadata. */
  readonly resolveLocalGithubViewerPermission?: boolean;
  /**
   * Diagnostic surface fed to the Score service. Defaults to `"score"`,
   * which excludes weak-signal rule families from the score so they
   * can't dilute the headline number. Public-API shells (`inspect()` /
   * `diagnose()`) leave this at the default; pass `"cli"` (or any other
   * surface) to score against an unfiltered diagnostic set.
   *
   * The returned `InspectOutput.diagnostics` is always the full
   * per-element-filtered list — surface filtering only affects scoring.
   */
  readonly scoreSurface?: DiagnosticSurface;
  /**
   * Suppresses the orchestrator's own persistent "Scanned N files"
   * success line. The live scan spinner still runs for feedback but
   * clears on completion instead of leaving a status line behind. The
   * CLI sets this when scanning multiple projects so it can render a
   * single aggregate "Scanned N files" line in their place — the
   * per-project file count + scan duration are surfaced on
   * `InspectOutput` for that summary.
   */
  readonly suppressScanSummary?: boolean;
}

export interface InspectOutput {
  readonly project: ProjectInfo;
  readonly userConfig: HarnessDoctorConfig | null;
  readonly resolvedDirectory: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  readonly score: ScoreResult | null;
  readonly scoreMetadata: ScoreRequestMetadata;
  /** `false` when run-dead-code was disabled, diff/staged mode, or analysis crashed. */
  readonly didDeadCodeFail: boolean;
  readonly deadCodeFailureReason: string | null;
  /**
   * Number of files the scan considered (the changed-file count in diff
   * mode, the project source-file count otherwise). Surfaced so a
   * caller that sets `suppressScanSummary` can render its own aggregate
   * "Scanned N files" line.
   */
  readonly scannedFileCount: number;
  /**
   * Absolute paths of every file this scan considered. Used by the
   * multi-project summary to count UNIQUE files across projects:
   * nested workspace packages (a parent whose tree contains a child
   * package) would otherwise double-count the shared files when their
   * per-project counts are summed.
   */
  readonly scannedFilePaths: ReadonlyArray<string>;
  /** Wall-clock duration of the scan phase, in milliseconds. */
  readonly scanElapsedMilliseconds: number;
}

/**
 * Hooks the caller participates in without owning the orchestration.
 * Today the CLI uses `beforeScan` to render the project-detection
 * block before the checks run; `afterScan` is invoked once the checks
 * (and any dead-code pass) finish. Per-phase spinner reporting is owned
 * by the `Progress` service — the caller provides `Progress.layerOra`
 * or `Progress.layerNoop` rather than threading spinner handles
 * through hooks.
 */
export interface InspectHooks<HooksR = never> {
  readonly beforeScan?: (
    project: ProjectInfo,
    includePaths: ReadonlyArray<string> | undefined,
  ) => Effect.Effect<void, never, HooksR>;
  readonly afterScan?: (didFail: boolean) => Effect.Effect<void, never, HooksR>;
}

const NO_HOOKS: Required<InspectHooks<never>> = {
  beforeScan: () => Effect.void,
  afterScan: () => Effect.void,
};

const filterMapNullable = <Input, Output>(
  transform: (value: Input) => Output | null,
): Filter.Filter<Input, Output> =>
  Filter.fromPredicateOption((value) => {
    const result = transform(value);
    return result === null ? Option.none() : Option.some(result);
  });

const fileReader =
  (filesService: Files["Service"], rootDirectory: string) =>
  (filePath: string): string[] | null => {
    const lines = Effect.runSync(filesService.readLines({ filePath, rootDirectory }));
    return lines === null ? null : [...lines];
  };

const DEAD_CODE_FAIL_TEXT = "Scanning failed (dead-code analysis, non-fatal).";

const toPosixPath = (filePath: string): string => filePath.split(path.sep).join(path.posix.sep);

/**
 * The full inspect orchestration as a single composable Effect.
 *
 * Phases:
 *
 *   1. Config.resolve(directory) → Project.discover → Git metadata
 *   2. beforeScan hook (e.g. CLI renders the project-detection block)
 *   3. deterministic checks (docs-structure + pnpm hardening), filtered
 *      to the changed files in diff / staged mode
 *   4. DeadCode.run (full scans only). GitHub viewer permission runs
 *      as a background fiber during this phase.
 *   5. afterScan hook
 *   6. Reporter.finalize
 *   7. Score.compute against the surface-filtered diagnostic set
 *
 * The orchestrator owns spinner lifecycle via `Progress`; callers
 * choose `Progress.layerOra(...)` for CLI feedback or
 * `Progress.layerNoop` for silent / programmatic runs.
 */
export const runInspect = <HooksR = never>(
  input: InspectInput,
  hooks: InspectHooks<HooksR> = {},
): Effect.Effect<
  InspectOutput,
  HarnessDoctorError,
  Project | Config | DeadCode | Files | Git | Progress | Reporter | Score | HooksR
> =>
  Effect.gen(function* () {
    const projectService = yield* Project;
    const configService = yield* Config;
    const filesService = yield* Files;
    const reporterService = yield* Reporter;
    const scoreService = yield* Score;
    const deadCodeService = yield* DeadCode;
    const gitService = yield* Git;
    const progressService = yield* Progress;

    const resolvedConfig: ResolvedConfig = yield* configService.resolve(input.directory);
    const scanDirectory = resolvedConfig.resolvedDirectory;

    const project = yield* projectService.discover(scanDirectory);
    const [repo, sha, defaultBranch] = yield* Effect.all(
      [
        gitService
          .githubRepo(scanDirectory)
          .pipe(Effect.orElseSucceed(() => null as string | null)),
        gitService.headSha(scanDirectory).pipe(Effect.orElseSucceed(() => null as string | null)),
        gitService
          .defaultBranch(scanDirectory)
          .pipe(Effect.orElseSucceed(() => null as string | null)),
      ],
      { concurrency: 3 },
    );
    const githubActionsScoreMetadata = input.isCi ? resolveGithubActionsScoreMetadata() : {};
    const githubViewerPermissionFiber = yield* Effect.forkChild(
      input.resolveLocalGithubViewerPermission === true && !input.isCi && repo !== null
        ? gitService
            .githubViewerPermission({ directory: scanDirectory, repo })
            .pipe(Effect.orElseSucceed(() => null as string | null))
        : Effect.succeed(null as string | null),
    );

    const isDiffMode = input.includePaths.length > 0;
    const includePaths = isDiffMode ? [...input.includePaths] : undefined;

    // Absolute paths of the exact file set the scan considers, captured ONLY
    // for the multi-project summary (the sole consumer), which signals via
    // `suppressScanSummary`. Gating avoids a redundant full-tree walk on
    // every single-project / `diagnose()` run.
    const scannedFilePaths = input.suppressScanSummary
      ? (includePaths ?? (yield* filesService.listSourceFiles(scanDirectory))).map((relativePath) =>
          path.resolve(scanDirectory, relativePath),
        )
      : [];

    const beforeScan = hooks.beforeScan ?? NO_HOOKS.beforeScan;
    const afterScan = hooks.afterScan ?? NO_HOOKS.afterScan;
    yield* beforeScan(project, includePaths);

    const showWarnings = input.warnings ?? resolvedConfig.config?.warnings ?? DEFAULT_SHOW_WARNINGS;

    const transform = buildDiagnosticPipeline({
      rootDirectory: scanDirectory,
      userConfig: resolvedConfig.config,
      readFileLinesSync: fileReader(filesService, scanDirectory),
      respectInlineDisables: input.respectInlineDisables,
      showWarnings,
    });

    const applyPerElementPipeline = <ToEnv>(rawStream: Stream.Stream<Diagnostic, never, ToEnv>) =>
      rawStream.pipe(
        Stream.filterMap(filterMapNullable<Diagnostic, Diagnostic>(transform.apply)),
        Stream.tap((diagnostic) => reporterService.emit(diagnostic)),
      );

    const deadCodeFailure = yield* Ref.make<{ didFail: boolean; reason: string | null }>({
      didFail: false,
      reason: null,
    });

    const scanProgress = yield* progressService.start("Scanning...");
    const scanStartTime = Date.now();

    // ── Phase: deterministic checks ────────────────────────────────
    // The docs-structure / supply-chain checks are repo-level and cheap,
    // so they run on every scan. In diff / staged mode their findings
    // are narrowed to the changed files, keeping the "only complain
    // about what this change touched" contract.
    const changedFileSet = isDiffMode
      ? new Set((includePaths ?? []).map((relativePath) => toPosixPath(relativePath)))
      : null;
    const environmentDiagnostics: ReadonlyArray<Diagnostic> = [
      ...checkPnpmHardening(scanDirectory),
      ...checkDocsStructure(scanDirectory, {
        docsContract: resolvedConfig.config?.docsContract === true,
      }),
    ].filter(
      (diagnostic) =>
        changedFileSet === null || changedFileSet.has(toPosixPath(diagnostic.filePath)),
    );
    const envCollected = yield* Stream.runCollect(
      applyPerElementPipeline(Stream.fromIterable(environmentDiagnostics)),
    );

    // Dead-code analysis only ever emits `"warning"`-severity diagnostics
    // (the `deslop` plugin, all `Maintainability`). Warnings show by
    // default, so this normally runs; only when the user opts out via
    // `--no-warnings` / `warnings: false` is that output filtered out
    // before it reaches any surface or the score, making the expensive
    // pass (separate worker, large heap, long timeout) pure wasted work —
    // so skip it then, unless a severity override restamps dead-code
    // findings to `"warn"`/`"error"` so they survive the global hide.
    const shouldRunDeadCode =
      input.runDeadCode &&
      !isDiffMode &&
      (showWarnings || deadCodeMaySurfaceWhenWarningsHidden(resolvedConfig.config));
    const deadCodeCollected = !shouldRunDeadCode
      ? []
      : yield* scanProgress.update("Analyzing dead code...").pipe(
          Effect.andThen(
            Stream.runCollect(
              applyPerElementPipeline(
                deadCodeService
                  .run({ rootDirectory: scanDirectory, userConfig: resolvedConfig.config })
                  .pipe(
                    Stream.catchTag("HarnessDoctorError", (error: HarnessDoctorError) =>
                      Stream.unwrap(
                        Effect.gen(function* () {
                          yield* Ref.set(deadCodeFailure, {
                            didFail: true,
                            reason: error.message,
                          });
                          return Stream.empty as Stream.Stream<Diagnostic, never>;
                        }),
                      ),
                    ),
                  ),
              ),
            ),
          ),
        );
    const deadCodeFailureState = yield* Ref.get(deadCodeFailure);
    yield* afterScan(deadCodeFailureState.didFail);

    const scanElapsedMilliseconds = Date.now() - scanStartTime;
    const scanElapsedSeconds = (scanElapsedMilliseconds / 1000).toFixed(1);
    const totalFileCount = includePaths?.length ?? project.sourceFileCount;

    if (deadCodeFailureState.didFail) {
      yield* scanProgress.fail(DEAD_CODE_FAIL_TEXT);
    } else if (input.suppressScanSummary) {
      yield* scanProgress.stop();
    } else {
      yield* scanProgress.succeed(
        `Scanned ${totalFileCount} ${totalFileCount === 1 ? "file" : "files"} in ${scanElapsedSeconds}s`,
      );
    }

    yield* reporterService.finalize;

    const finalDiagnostics: ReadonlyArray<Diagnostic> = [...envCollected, ...deadCodeCollected];

    const githubViewerPermission = yield* Fiber.join(githubViewerPermissionFiber);
    const scoreMetadata: ScoreRequestMetadata = {
      ...(repo !== null ? { repo } : {}),
      ...(sha !== null ? { sha } : {}),
      framework: project.framework,
      sourceFileCount: project.sourceFileCount,
      ...(defaultBranch !== null ? { defaultBranch } : {}),
      ...(input.doctorVersion !== undefined ? { doctorVersion: input.doctorVersion } : {}),
      ...githubActionsScoreMetadata,
      ...(githubViewerPermission !== null ? { githubViewerPermission } : {}),
    };

    const scoreSurface: DiagnosticSurface = input.scoreSurface ?? "score";
    const scoreDiagnostics = filterDiagnosticsForSurface(
      [...finalDiagnostics],
      scoreSurface,
      resolvedConfig.config,
    );
    const score = yield* scoreService.compute({
      diagnostics: scoreDiagnostics,
      isCi: input.isCi,
      metadata: scoreMetadata,
    });

    return {
      project,
      userConfig: resolvedConfig.config,
      resolvedDirectory: scanDirectory,
      diagnostics: finalDiagnostics,
      score,
      scoreMetadata,
      didDeadCodeFail: deadCodeFailureState.didFail,
      deadCodeFailureReason: deadCodeFailureState.reason,
      scannedFileCount: totalFileCount,
      scannedFilePaths,
      scanElapsedMilliseconds,
    };
  }).pipe(
    Effect.withSpan("runInspect", {
      attributes: {
        "inspect.directory": input.directory,
        "inspect.includePathCount": input.includePaths.length,
        "inspect.runDeadCode": input.runDeadCode,
        "inspect.isCi": input.isCi,
        "inspect.scoreSurface": input.scoreSurface ?? "score",
      },
    }),
  );
