import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  Config,
  DeadCode,
  Files,
  Git,
  Progress,
  Project,
  Reporter,
  Score,
} from "@harness-doctor/core";
import type { ProgressHandle, HarnessDoctorConfig } from "@harness-doctor/core";
import { spinner } from "./spinner.js";

export interface BuildRuntimeLayersInput {
  readonly directory: string;
  readonly hasConfigOverride: boolean;
  readonly userConfig: HarnessDoctorConfig | null;
  readonly configSourceDirectory: string | null;
  readonly shouldRunDeadCode: boolean;
  /**
   * Whether the run should compute a score. `false` swaps
   * `Score.layerLocal` for `Score.layerOf(null)` so the orchestrator's
   * Score service is a no-op for `--no-score` runs.
   */
  readonly shouldComputeScore: boolean;
  /**
   * Whether the scan spinners should render on stderr. Set `false` for
   * `--score-only` / `--silent` runs — the orchestrator's `Progress`
   * lifecycle becomes a noop instead of emitting frames into a quiet
   * stream.
   */
  readonly shouldShowProgressSpinners: boolean;
}

/**
 * Adapts the CLI's existing `spinner()` helper (an ora wrapper that
 * already handles non-interactive demotion + `setSpinnerSilent`) into
 * a `ProgressHandle` factory the orchestrator can drive via the
 * `Progress` service.
 */
const buildSpinnerProgressHandle = (text: string): ProgressHandle => {
  const oraHandle = spinner(text).start();
  return {
    update: (displayText: string) => Effect.sync(() => oraHandle.update(displayText)),
    succeed: (displayText: string) => Effect.sync(() => oraHandle.succeed(displayText)),
    fail: (displayText: string) => Effect.sync(() => oraHandle.fail(displayText)),
    stop: () => Effect.sync(() => oraHandle.stop()),
  };
};

/**
 * Composes the production layer stack for `inspect()`'s
 * `Effect.runPromise(Effect.provide(...))` call. Lives outside
 * `inspect.ts` so the orchestrator stays focused on Effect program
 * construction and post-scan rendering — layer wiring is its own
 * concern with its own contract.
 *
 * Same service shape as `@harness-doctor/api → diagnose()`'s
 * `buildDiagnoseLayer`, with the differences specific to the CLI path:
 *
 * - **Config**: when the caller passes `configOverride`, the
 *   already-loaded config is provided via `Config.layerOf` instead
 *   of re-loading from disk.
 * - **Score**: `layerLocal` (deterministic, offline) for normal runs;
 *   `layerOf(null)` only when the caller passed `--no-score`. The
 *   orchestrator applies the `"score"` surface filter to the diagnostic
 *   set before calling `Score.compute`, so the in-band score matches what
 *   the public-API contract documents.
 * - **Progress**: `layerOra` wired to the CLI's existing ora-backed
 *   spinner helper for terminal feedback; `layerNoop` for silent /
 *   score-only runs.
 */
export const buildRuntimeLayers = (input: BuildRuntimeLayersInput) => {
  const deadCodeLayer = input.shouldRunDeadCode ? DeadCode.layerNode : DeadCode.layerOf([]);
  const scoreLayer = input.shouldComputeScore ? Score.layerLocal : Score.layerOf(null);
  const progressLayer = input.shouldShowProgressSpinners
    ? Progress.layerOra(buildSpinnerProgressHandle)
    : Progress.layerNoop;
  const configLayer = input.hasConfigOverride
    ? Config.layerOf({
        config: input.userConfig,
        resolvedDirectory: input.directory,
        // `configSourceDirectory` is non-null when `inspect()` loaded
        // the config from disk itself (the CLI path) and `null` only
        // when the caller passed `configOverride` programmatically
        // without a corresponding file.
        configSourceDirectory: input.configSourceDirectory,
      })
    : Config.layerNode;

  return Layer.mergeAll(
    Project.layerNode,
    configLayer,
    Files.layerNode,
    Git.layerNode,
    deadCodeLayer,
    progressLayer,
    Reporter.layerNoop,
    scoreLayer,
  );
};
