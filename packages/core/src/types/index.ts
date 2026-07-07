export type {
  DiagnosticSurface,
  FailOnLevel,
  HarnessDoctorConfig,
  HarnessDoctorIgnoreOverride,
  RuleSeverityControls,
  RuleSeverityOverride,
  SurfaceControls,
} from "./config.js";
export type {
  DiagnoseOptions,
  DiagnoseProjectsInput,
  DiagnoseProjectsResult,
  DiagnoseResult,
  ProjectDefinition,
  ProjectResult,
  ProjectResultError,
  ProjectResultOk,
} from "./diagnose.js";
export type { CleanedDiagnostic, Diagnostic } from "./diagnostic.js";
export type { HandleErrorOptions } from "./handle-error.js";
export type {
  DiffInfo,
  InspectOptions,
  InspectResult,
  JsonReport,
  JsonReportDiffInfo,
  JsonReportError,
  JsonReportMode,
  JsonReportProjectEntry,
  JsonReportSummary,
} from "./inspect.js";
export type { Framework, PackageJson, ProjectInfo, WorkspacePackage } from "./project-info.js";
export type { PromptMultiselectChoiceState, PromptMultiselectContext } from "./prompts.js";
export type { ScoreResult, RulePriority, RuleTier } from "./score.js";
export type { CiCommandSignal, PackageScriptSignal, SignalsMenu } from "./signals.js";
