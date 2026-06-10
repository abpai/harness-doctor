export interface SkippedCheckInput {
  readonly didDeadCodeFail: boolean;
  readonly deadCodeFailureReason: string | null;
}

export interface SkippedCheckSummary {
  readonly skippedChecks: string[];
  readonly skippedCheckReasons: Record<string, string>;
}

/**
 * Single source of truth for the skipped-check accounting shared by the
 * CLI renderer (`harness-doctor/src/inspect.ts → finalizeAndRender`) and the
 * programmatic shell (`@harness-doctor/api → diagnose()`). Both surface a
 * failed dead-code pass instead of a false "all clear", so the branch
 * logic lives here once.
 */
export const buildSkippedChecks = (input: SkippedCheckInput): SkippedCheckSummary => {
  const skippedChecks: string[] = [];
  if (input.didDeadCodeFail) skippedChecks.push("dead-code");

  const skippedCheckReasons: Record<string, string> = {};
  if (input.didDeadCodeFail && input.deadCodeFailureReason !== null) {
    skippedCheckReasons["dead-code"] = input.deadCodeFailureReason;
  }

  return { skippedChecks, skippedCheckReasons };
};
