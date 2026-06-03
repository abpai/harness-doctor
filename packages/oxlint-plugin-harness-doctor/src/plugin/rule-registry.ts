// GENERATED FILE — do not edit by hand. Run `pnpm gen` to regenerate.
// Source of truth: every `export const <name> = defineRule({ id: "...", ... })`
// under `src/plugin/rules/<bucket>/<name>.ts`. The rule's `framework` and
// default `category` come from the bucket directory (see
// `scripts/generate-rule-registry.mjs`) — rule files only override
// `category` when needed. Adding a rule is a single-file operation:
// create the rule file, set its `id`, re-run codegen.

import type { Rule } from "./utils/rule.js";

import { noEval } from "./rules/security/no-eval.js";

export const harnessDoctorRules = [
  {
    key: "harness-doctor/no-eval",
    id: "no-eval",
    source: "harness-doctor",
    originallyExternal: false,
    rule: {
      ...noEval,
      framework: "global",
      category: "Security",
    },
  },
] as const;

export const ruleRegistry: Record<string, Rule> = Object.fromEntries(
  harnessDoctorRules.map((rule) => [rule.id, rule.rule]),
);
