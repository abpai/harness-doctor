import {
  LOCAL_SCORE_ERROR_PENALTY_POINTS,
  LOCAL_SCORE_WARNING_PENALTY_POINTS,
  PERFECT_SCORE,
  SCORE_GOOD_THRESHOLD,
  SCORE_OK_THRESHOLD,
} from "./constants.js";
import type { Diagnostic, ScoreResult } from "./types/index.js";

// Human-readable banding for the deterministic local score. Mirrors the
// `SCORE_GOOD_THRESHOLD` / `SCORE_OK_THRESHOLD` bands the renderer already
// uses to colorize the score bar, so the offline label and the bar agree.
const labelForScore = (score: number): string => {
  if (score >= PERFECT_SCORE) return "Excellent";
  if (score >= SCORE_GOOD_THRESHOLD) return "Good";
  if (score >= SCORE_OK_THRESHOLD) return "Needs work";
  return "At risk";
};

/**
 * Deterministic, offline replacement for the hosted score API. Penalizes
 * each diagnostic by severity (errors weigh twice a warning), then clamps
 * the result into the `[0, PERFECT_SCORE]` band — no network, no
 * randomness, so the same diagnostic set always yields the same score and
 * the boilerplate's score test can assert exact integers.
 *
 * `sourceFileCount` is accepted for forward-compatibility (error-density
 * normalization) but intentionally unused in the v1 formula: keeping the
 * score purely count-based makes it trivially testable and stable across
 * file-count noise.
 */
export const calculateLocalScore = (
  diagnostics: ReadonlyArray<Diagnostic>,
  _sourceFileCount: number,
): ScoreResult => {
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;

  const penalty =
    errorCount * LOCAL_SCORE_ERROR_PENALTY_POINTS +
    warningCount * LOCAL_SCORE_WARNING_PENALTY_POINTS;
  const score = Math.max(0, Math.min(PERFECT_SCORE, PERFECT_SCORE - penalty));

  return { score, label: labelForScore(score) };
};
