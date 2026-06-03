export { diagnose, diagnoseProjects } from "./diagnose.js";

export type {
  DiagnoseOptions,
  DiagnoseProjectsInput,
  DiagnoseProjectsResult,
  DiagnoseResult,
  Diagnostic,
  ProjectDefinition,
  ProjectInfo,
  ProjectResult,
  ProjectResultError,
  ProjectResultOk,
  HarnessDoctorConfig,
  ScoreResult,
} from "@harness-doctor/core";
export {
  HarnessDoctorError,
  ProjectNotFoundError,
  NoReactDependencyError,
  PackageJsonNotFoundError,
  NotADirectoryError,
  AmbiguousProjectError,
  isHarnessDoctorError,
} from "@harness-doctor/core";
