import { highlighter, OUTPUT_MEASURE_WIDTH_CHARS } from "@harness-doctor/core";

export const buildSectionDivider = (): string =>
  highlighter.dim(`  ${"─".repeat(OUTPUT_MEASURE_WIDTH_CHARS)}`);
