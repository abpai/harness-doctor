import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AmbiguousProjectError,
  discoverProject as discoverProjectSync,
  NoReactDependencyError,
  PackageJsonNotFoundError,
  ProjectNotFoundError,
} from "../project-info/index.js";
import type { ProjectInfo } from "../types/index.js";
import {
  AmbiguousProject,
  NoReactDependency,
  ProjectNotFound,
  HarnessDoctorError,
} from "../errors.js";

const translateProjectInfoError = (cause: unknown, directory: string): HarnessDoctorError => {
  if (cause instanceof NoReactDependencyError) {
    return new HarnessDoctorError({ reason: new NoReactDependency({ directory: cause.directory }) });
  }
  if (cause instanceof ProjectNotFoundError) {
    return new HarnessDoctorError({ reason: new ProjectNotFound({ directory: cause.directory }) });
  }
  if (cause instanceof PackageJsonNotFoundError) {
    return new HarnessDoctorError({ reason: new ProjectNotFound({ directory: cause.directory }) });
  }
  if (cause instanceof AmbiguousProjectError) {
    return new HarnessDoctorError({
      reason: new AmbiguousProject({
        directory: cause.directory,
        candidates: cause.candidates,
      }),
    });
  }
  return new HarnessDoctorError({ reason: new ProjectNotFound({ directory }) });
};

export class Project extends Context.Service<
  Project,
  {
    readonly discover: (directory: string) => Effect.Effect<ProjectInfo, HarnessDoctorError>;
  }
>()("harness-doctor/Project") {
  static readonly layerNode = Layer.succeed(
    Project,
    Project.of({
      // `Effect.fn("Project.discover")` adds an OTel-compatible span
      // name to every invocation. Canonical eval pattern from
      // `harness-doctor-evals/src/Runner.ts` / `HarnessDoctorV2.ts` —
      // free observability with zero runtime cost when no tracer
      // layer is provided.
      discover: Effect.fn("Project.discover")(function* (directory: string) {
        return yield* Effect.try({
          try: () => discoverProjectSync(directory),
          catch: (cause) => translateProjectInfoError(cause, directory),
        });
      }),
    }),
  );

  static readonly layerOf = (projectInfo: ProjectInfo): Layer.Layer<Project> =>
    Layer.succeed(
      Project,
      Project.of({
        discover: () => Effect.succeed(projectInfo),
      }),
    );
}
