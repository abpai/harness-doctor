import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Diagnostic, ScoreResult } from "../types/index.js";
import { calculateScore, type ScoreRequestMetadata } from "../calculate-score.js";
import { calculateLocalScore } from "../calculate-local-score.js";

interface ComputeInput {
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  readonly isCi?: boolean;
  readonly metadata?: ScoreRequestMetadata;
}

export class Score extends Context.Service<
  Score,
  {
    readonly compute: (input: ComputeInput) => Effect.Effect<ScoreResult | null>;
  }
>()("harness-doctor/Score") {
  /**
   * Hosted score API. Network failures collapse to `null` rather than
   * propagating through the error channel — score isn't load-bearing
   * for the linter contract, and the renderer distinguishes "user
   * opted out" from "we tried and failed" via a separate `noScoreMessage`
   * the caller picks based on `--no-score`.
   *
   * `Effect.fn("Score.compute")` wraps the body so the effect carries
   * an OpenTelemetry-compatible span name out of the box (canonical
   * eval pattern from `harness-doctor-evals/src/Runner.ts`). Zero runtime
   * cost when no tracing layer is provided; surfaces in
   * `Otlp.layerJson` traces when one is.
   */
  static readonly layerHttp = Layer.succeed(
    Score,
    Score.of({
      compute: Effect.fn("Score.compute")(function* (input: ComputeInput) {
        return yield* Effect.promise(() =>
          calculateScore([...input.diagnostics], {
            isCi: input.isCi,
            metadata: input.metadata,
          }).catch((): ScoreResult | null => null),
        );
      }),
    }),
  );

  /**
   * Deterministic, offline score — the DEFAULT layer for the boilerplate.
   * Wraps `calculateLocalScore` in `Effect.succeed` (no `fetch`, no
   * `Effect.promise`) so a scan scores the same way every time with no
   * network dependency. `layerHttp` remains available as an opt-in for
   * integrators who host their own score API.
   */
  static readonly layerLocal = Layer.succeed(
    Score,
    Score.of({
      compute: (input: ComputeInput) =>
        Effect.sync(() =>
          calculateLocalScore([...input.diagnostics], input.metadata?.sourceFileCount ?? 0),
        ).pipe(Effect.withSpan("Score.compute")),
    }),
  );

  static readonly layerOf = (result: ScoreResult | null): Layer.Layer<Score> =>
    Layer.succeed(
      Score,
      Score.of({
        compute: () => Effect.succeed(result),
      }),
    );
}
