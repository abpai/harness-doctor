import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import type { Diagnostic, HarnessDoctorConfig } from "../types/index.js";
import { checkDeadCode } from "../check-dead-code.js";
import { DeadCodeAnalysisFailed, HarnessDoctorError } from "../errors.js";

interface DeadCodeInput {
  readonly rootDirectory: string;
  readonly userConfig: HarnessDoctorConfig | null;
}

/**
 * `DeadCode` runs whole-project reachability analysis and streams
 * diagnostics. Reachability is a whole-project property — the
 * orchestrator skips this pass in `--diff` / `--staged` mode by
 * providing `layerOf([])`. Failures are folded by the orchestrator
 * into `skippedChecks: ["dead-code"]` without sinking the scan.
 *
 * Stream-shape (matching `Linter.run`) so the orchestrator can
 * `Stream.concat(linter.run, deadCode.run)` symmetrically.
 */
export class DeadCode extends Context.Service<
  DeadCode,
  {
    readonly run: (input: DeadCodeInput) => Stream.Stream<Diagnostic, HarnessDoctorError>;
  }
>()("harness-doctor/DeadCode") {
  static readonly layerNode = Layer.succeed(
    DeadCode,
    DeadCode.of({
      run: (input) =>
        Stream.unwrap(
          // `Effect.fn("DeadCode.run")` so the dead-code analysis
          // surfaces as a single named span in OTel traces (parent
          // of the per-call `Effect.tryPromise`).
          Effect.fn("DeadCode.run")(function* () {
            return yield* Effect.tryPromise({
              try: () =>
                checkDeadCode({
                  rootDirectory: input.rootDirectory,
                  userConfig: input.userConfig,
                }),
              catch: (cause) =>
                new HarnessDoctorError({ reason: new DeadCodeAnalysisFailed({ cause }) }),
            }).pipe(Effect.map((diagnostics) => Stream.fromIterable(diagnostics)));
          })(),
        ),
    }),
  );

  static readonly layerOf = (diagnostics: ReadonlyArray<Diagnostic>): Layer.Layer<DeadCode> =>
    Layer.succeed(
      DeadCode,
      DeadCode.of({
        run: () => Stream.fromIterable(diagnostics),
      }),
    );
}
