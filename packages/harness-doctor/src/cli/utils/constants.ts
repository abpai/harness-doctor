// Exit code for processes terminated by SIGINT (Ctrl-C), per POSIX
// (128 + signal number). Used by exit-gracefully.ts on SIGINT/SIGTERM.
export const SIGINT_EXIT_CODE = 130;

// Exit code for a terminal hangup, per POSIX (128 + SIGHUP = 129). Used by
// guard-stdin.ts when the TTY backing an interactive prompt goes away
// mid-read (`read EIO`), so the CLI exits like an interrupted run instead of
// crashing on the uncaught stdin stream error.
export const TERMINAL_HANGUP_EXIT_CODE = 129;

// Length of the `[node, script]` prefix that precedes user arguments in
// `process.argv`. Shared by the argv processors (flag stripping, help
// normalization, the `-V` alias).
export const NODE_ARGUMENT_COUNT = 2;

export const STAGED_FILES_TEMP_DIR_PREFIX = "harness-doctor-staged-";

export const GIT_HOOK_EXECUTABLE_MODE = 0o755;

export const AGENT_HOOK_TIMEOUT_SECONDS = 120;

// Cap on files listed per rule in the agent-handoff prompt so it stays a
// compact, passable CLI argument.
export const HANDOFF_MAX_FILES_PER_RULE = 3;

export const SCORE_HEADER_ANIMATION_FRAME_COUNT = 40;
export const SCORE_HEADER_ANIMATION_FRAME_DELAY_MS = 50;
export const PERFECT_SCORE_RAINBOW_FRAME_COUNT = 16;
export const PERFECT_SCORE_RAINBOW_FRAME_DELAY_MS = 50;

// First-run onboarding animation cadences: welcome typewriter + holds, the
// category count-up, and the score projection.
export const WELCOME_TYPEWRITER_CHAR_DELAY_MS = 32;
export const WELCOME_INTER_LINE_DELAY_MS = 500;
export const WELCOME_EXPLANATION_HOLD_MS = 2000;
export const WELCOME_HOLD_MS = 1000;
// The category breakdown reveals one issue at a time (errors then warnings,
// category by category). Small/medium breakdowns step by a single unit per
// frame; `MAX_STEPS` caps the frame budget so a huge repo's reveal stays short
// (the per-step increment grows instead).
export const CATEGORY_COUNTUP_MAX_STEPS = 24;
export const CATEGORY_COUNTUP_FRAME_DELAY_MS = 70;
// Beat to hold on the settled category tally before the detail blocks reveal,
// so the at-a-glance breakdown reads before the report scrolls on.
export const CATEGORY_COUNTUP_SETTLE_HOLD_MS = 1000;
export const SCORE_PROJECTION_FRAME_COUNT = 16;
export const SCORE_PROJECTION_FRAME_DELAY_MS = 35;
// Terminal rows from the cursor (sitting just after the "you could improve"
// line) up to the score bar, so the projection redraw lands on the bar row:
// improve line, blank, face-bottom, branding, bar.
export const SCORE_PROJECTION_BAR_ROWS_ABOVE_CURSOR = 5;

// Last-resort fallback when buildJsonReportError itself throws — keeps
// stdout valid JSON so downstream parsers don't see a half-written report.
export const INTERNAL_ERROR_JSON_FALLBACK =
  '{"schemaVersion":1,"ok":false,"error":{"message":"Internal error","name":"Error","chain":[]}}\n';
