# How to Write an AST Rule

An **AST rule** walks a parsed source file and reports a code pattern. It is the
right tool when the thing you check lives *inside* JavaScript / TypeScript
syntax. If instead you are checking a file's existence, location, or length, or
a non-JS config format, write a [structural check](./HOW_TO_WRITE_A_CHECK.md).

Rules live in `packages/oxlint-plugin-harness-doctor/src/plugin/rules/<category>/`
with a co-located `*.test.ts`. The canonical template is
[`security/no-eval.ts`](../packages/oxlint-plugin-harness-doctor/src/plugin/rules/security/no-eval.ts)
— a small, framework-agnostic rule. Read it and its test before writing a new
rule; this guide describes their shape.

## Rule quality bar

A good rule is:

- **Specific** — it catches one clearly named problem.
- **Grounded** — the problem is validated against docs, real code, or issues.
- **Precise** — the detector matches exactly what the diagnostic claims.
- **Low-noise** — a false positive is treated as a correctness bug.
- **Tested adversarially** — tests cover look-alike valid code, not just the
  obvious invalid case.
- **Scoped** — v1 does not try to solve adjacent rule ideas.
- **Readable** — helper names describe exact semantics.

## Define the rule in one sentence

Before writing code, state the rule as:

> This rule catches `<code pattern>` that causes `<specific problem>`.

For the template:

> This rule catches `eval()`, string-bodied `setTimeout` / `setInterval`, and
> `new Function(...)` — all of which run a string as code (code injection).

Then answer:

- What runtime behavior makes this a bug?
- What code shape triggers it, and what shape fixes it?
- What *similar-looking* code is valid and must NOT be flagged?
- What does v1 intentionally skip?

## The rule shape

A rule is an object passed to `defineRule`. The template:

```ts
import { defineRule } from "../../utils/define-rule.js";
import type { Rule } from "../../utils/rule.js";
import type { RuleContext } from "../../utils/rule-context.js";
import { isNodeOfType } from "../../utils/is-node-of-type.js";
import type { EsTreeNodeOfType } from "../../utils/es-tree-node-of-type.js";

export const noEval = defineRule<Rule>({
  id: "no-eval",
  title: "Use of eval()",
  severity: "error",
  recommendation:
    "Use `JSON.parse` for data, or rewrite so the code doesn't build and run code from strings.",
  create: (context: RuleContext) => ({
    CallExpression(node: EsTreeNodeOfType<"CallExpression">) {
      if (isNodeOfType(node.callee, "Identifier") && node.callee.name === "eval") {
        context.report({
          node,
          message: "eval() is a code-injection vulnerability: it runs any string as code.",
        });
      }
    },
  }),
});
```

The fields:

- **`id`** — the rule key, kebab-case. The user references it as
  `harness-doctor/<id>`.
- **`title`** — short human label.
- **`severity`** — `"error"` or `"warning"`.
- **`recommendation`** — the fix, surfaced to the user and the agent.
- **`create(context)`** — returns a visitor object. Each key is an AST node type
  (`CallExpression`, `NewExpression`, `ImportDeclaration`, …); its handler runs
  for every matching node. Call `context.report({ node, message })` to flag one.

The visitor keys are the only injectable surface — the engine handles parsing,
traversal, batching, and output. You only describe *which nodes are bad*.

## Choose detector precision

Classify the rule before implementing:

- **Syntax-only** — the bug is local; node shape alone decides it. The template
  is syntax-only: `eval` / `setTimeout` / `new Function` are recognized by
  callee name and argument shape, no binding resolution needed.
- **Scope-aware** — names must resolve to a specific import or binding (e.g.
  "this `useThing` must be the one imported from `lib`, not a local function").
  Resolve imports and respect shadowing before trusting an identifier's text.
- **Path-aware** — order and branches matter (e.g. "flag a return only if a
  mutation happened earlier on the same path"). Model only the control flow the
  rule's claim requires.

Prefer the least precise tier that is still correct — every added tier is more
surface for false positives.

## Inspect node fields, not source text

Read the node's structured fields rather than the raw text. The template checks
`node.callee.name === "eval"` and, for the string-body case, that
`node.arguments[0]` is a `Literal` whose `value` is a string:

```ts
if (
  isNodeOfType(node.callee, "Identifier") &&
  (node.callee.name === "setTimeout" || node.callee.name === "setInterval") &&
  isNodeOfType(node.arguments?.[0], "Literal") &&
  typeof node.arguments[0].value === "string"
) {
  context.report({ node, message: `Passing a string to ${node.callee.name}() runs it as code.` });
}
```

Guidance:

- Use `isNodeOfType(node, "Type")` to narrow before reading type-specific fields
  — it both guards at runtime and narrows the TypeScript type.
- Distinguish static from dynamic: `obj.foo` and `obj["foo"]` resolve to a known
  property name; `obj[name]` does not. Only match known names on static access.
- Explicitly skip nested functions/classes unless the rule means to descend into
  them — they are a common false-positive source.

## Reuse existing utilities

Before adding a helper, search
`packages/oxlint-plugin-harness-doctor/src/plugin/utils/` for an existing one.
The template depends only on the core primitives:

- `defineRule` — registers the rule.
- `isNodeOfType` / `EsTreeNodeOfType` — type-narrowing on nodes.
- `RuleContext` / `Rule` — the rule and report types.

Add a utility only when two or more call sites need the same non-trivial AST
logic. One utility per file in `utils/`, named for exact behavior
(`getStaticMemberPropertyName`, not `getName`).

## Design the test suite

Co-locate `<id>.test.ts` and drive the rule through the `runRule` harness. Cover
both directions adversarially — the template's seven cases are the model:

```ts
import { describe, expect, it } from "vite-plus/test";
import { runRule } from "../../../test-utils/run-rule.js";
import { noEval } from "./no-eval.js";

describe("no-eval", () => {
  it("flags a direct eval() call", () => {
    const result = runRule(noEval, `eval("doThing()");`);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("eval()");
  });

  it("does NOT flag JSON.parse", () => {
    const result = runRule(noEval, `const data = JSON.parse(input);`);
    expect(result.diagnostics).toHaveLength(0);
  });
});
```

Include:

- **Invalid cases** — each distinct bad shape the rule claims to catch
  (`eval`, string `setTimeout`, string `setInterval`, `new Function`).
- **Valid look-alikes** — code that resembles the bug but is fine
  (`JSON.parse`, a plain call, `setTimeout` with a *function* argument).
- **Scope / shadowing cases** — when the rule is scope-aware, a locally
  shadowed name must not fire.
- **Regression cases** — one per real bug found in review.

Vary the shapes; do not copy one template repeatedly.

## Naming, comments

- Names describe exact behavior: `isOriginalStateReference`, not `isRef`.
- Comment only non-obvious AST tradeoffs or v1 boundaries, prefixed `// HACK:`
  when the code is a workaround. Never narrate obvious code.

## Verify locally

```bash
pnpm gen        # regenerate the rule registry after adding/removing a rule
pnpm typecheck
pnpm lint
pnpm exec vp test run packages/oxlint-plugin-harness-doctor/src/plugin/rules/<category>/<id>.test.ts
```

**The registry is codegen output.** `src/plugin/rule-registry.ts` and
`src/rules.ts` are generated by `scripts/generate-rule-registry.mjs`, which
scans every non-test `*.ts` under `src/plugin/rules/<category>/`. After adding or
removing a rule file, run `pnpm gen` — never hand-edit the generated files, and
never leave a half-deleted rule file behind (it will be auto-reimported and
break the build).

## Common failure modes

- Using name heuristics where import resolution is required.
- Walking nested functions as if they execute immediately.
- Treating dynamic computed properties (`obj[name]`) as static names.
- Mixing a related v2 idea into v1.
- Writing tests that mirror the implementation instead of real code.

## Checklist

- [ ] Bug defined in one sentence; runtime reason documented.
- [ ] Detector precision chosen (syntax-only / scope-aware / path-aware).
- [ ] Detector reads node fields, not source text; narrows with `isNodeOfType`.
- [ ] Existing utilities reused; new ones justified and one-per-file.
- [ ] Tests cover invalid, valid look-alike, and shadowing cases.
- [ ] `pnpm gen` run; `typecheck`, `lint`, and the co-located test pass.
