import * as Effect from "effect/Effect";
import { layerOtlp } from "@harness-doctor/core";

/**
 * Installs the tracing backend for the inspect program. When the user's OTLP
 * exporter is configured (`HARNESS_DOCTOR_OTLP_ENDPOINT` +
 * `HARNESS_DOCTOR_OTLP_AUTH_HEADER`), Effect's span instrumentation exports to
 * it; otherwise `layerOtlp` is a no-op layer, leaving Effect's native in-memory
 * tracer untouched.
 */
export const applyObservability = <A, E, R>(
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => program.pipe(Effect.provide(layerOtlp));
