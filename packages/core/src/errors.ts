import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AmbiguousProjectError, ProjectNotFoundError } from "./project-info/errors.js";

export class ConfigParseFailed extends Schema.TaggedErrorClass<ConfigParseFailed>()(
  "ConfigParseFailed",
  {
    path: Schema.String,
    cause: Schema.Unknown,
  },
) {
  get message() {
    return `Failed to parse harness-doctor config at ${this.path}: ${Cause.pretty(Cause.fail(this.cause))}`;
  }
}

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()("ProjectNotFound", {
  directory: Schema.String,
}) {
  get message() {
    return `Could not find a project at ${this.directory}`;
  }
}

export class AmbiguousProject extends Schema.TaggedErrorClass<AmbiguousProject>()(
  "AmbiguousProject",
  {
    directory: Schema.String,
    candidates: Schema.Array(Schema.String),
  },
) {
  get message() {
    return `Ambiguous project at ${this.directory}: found ${this.candidates.length} candidates (${this.candidates.join(", ")})`;
  }
}

export class DeadCodeAnalysisFailed extends Schema.TaggedErrorClass<DeadCodeAnalysisFailed>()(
  "DeadCodeAnalysisFailed",
  {
    cause: Schema.Unknown,
  },
) {
  get message() {
    return `Dead-code analysis failed: ${Cause.pretty(Cause.fail(this.cause))}`;
  }
}

export class GitInvocationFailed extends Schema.TaggedErrorClass<GitInvocationFailed>()(
  "GitInvocationFailed",
  {
    args: Schema.Array(Schema.String),
    directory: Schema.String,
    cause: Schema.Unknown,
  },
) {
  get message() {
    return `git ${this.args.join(" ")} (cwd=${this.directory}) failed: ${Cause.pretty(Cause.fail(this.cause))}`;
  }
}

export class GitBaseBranchMissing extends Schema.TaggedErrorClass<GitBaseBranchMissing>()(
  "GitBaseBranchMissing",
  {
    branch: Schema.String,
  },
) {
  get message() {
    return `Diff base branch "${this.branch}" does not exist (run \`git fetch\` to update remote refs).`;
  }
}

export class GitBaseBranchInvalid extends Schema.TaggedErrorClass<GitBaseBranchInvalid>()(
  "GitBaseBranchInvalid",
  {
    detail: Schema.String,
  },
) {
  get message() {
    return this.detail;
  }
}

export const HarnessDoctorErrorReason = Schema.Union([
  ConfigParseFailed,
  ProjectNotFound,
  AmbiguousProject,
  DeadCodeAnalysisFailed,
  GitInvocationFailed,
  GitBaseBranchMissing,
  GitBaseBranchInvalid,
]);

export type HarnessDoctorErrorReason = Schema.Schema.Type<typeof HarnessDoctorErrorReason>;

export class HarnessDoctorError extends Schema.TaggedErrorClass<HarnessDoctorError>()(
  "HarnessDoctorError",
  {
    reason: HarnessDoctorErrorReason,
  },
) {
  get message() {
    return this.reason.message;
  }
}

export const formatHarnessDoctorError = (error: HarnessDoctorError): string => error.reason.message;

export const isHarnessDoctorError = (error: unknown): error is HarnessDoctorError =>
  error instanceof HarnessDoctorError;

/**
 * Tagged-reason → legacy thrown-class boundary shared by every public
 * shell (`inspect()` in `harness-doctor`, `diagnose()` in `@harness-doctor/api`).
 *
 * `Effect.catchReasons` dispatches on the tagged-error sub-channel
 * without manual `instanceof` checks. Each handler converts a tagged
 * reason into the historical thrown class advertised by the legacy
 * public-API contract (via `Effect.die`, which `Effect.runPromise`
 * re-throws unchanged). The `orElse` branch re-`die`s the original
 * `HarnessDoctorError` instance so advanced callers can still narrow on
 * `error.reason._tag` while grep-stderr users keep the same
 * `error.message` they always saw.
 *
 * Adding a new legacy thrown class is a one-line change on the
 * `Effect.catchReasons` map — both shells pick it up automatically.
 */
export const restoreLegacyThrow = <Value, Requirements>(
  effect: Effect.Effect<Value, HarnessDoctorError, Requirements>,
): Effect.Effect<Value, never, Requirements> =>
  effect.pipe(
    Effect.catchReasons(
      "HarnessDoctorError",
      {
        ProjectNotFound: (reason) => Effect.die(new ProjectNotFoundError(reason.directory)),
        AmbiguousProject: (reason) =>
          Effect.die(new AmbiguousProjectError(reason.directory, [...reason.candidates])),
      },
      // Re-die the tagged class itself — its `message` getter is the
      // same one the legacy `new Error(error.message)` path produced,
      // and keeping the tagged shape lets advanced callers do
      // `_tag` dispatch on `error.reason`.
      (_reason, error) => Effect.die(error),
    ),
  );
