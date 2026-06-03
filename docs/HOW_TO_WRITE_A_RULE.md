# How to write a rule

A rule catches a pattern in source code. You describe which nodes in the parsed
syntax tree are bad; the engine handles everything else — finding files,
parsing them, walking the tree, batching the work, printing the results. Your
job is narrow and well-defined: look at a node, decide if it's the thing you're
hunting, and if so, report it.

That narrowness is the whole pleasure of writing rules here. You're never
wrangling file IO or output formatting. You're answering one question, over and
over, as the engine hands you nodes: _is this the bug?_

If the thing you want to check isn't inside source code — a missing file, a
directory that's too deep, an entry-point that's grown too long — you don't want
a rule at all. You want a [structural check](./HOW_TO_WRITE_A_CHECK.md).

Rules live in
[`packages/oxlint-plugin-harness-doctor/src/plugin/rules/<bucket>/`](../packages/oxlint-plugin-harness-doctor/src/plugin/rules),
each next to its own `*.test.ts`. The template is
[`security/no-eval.ts`](../packages/oxlint-plugin-harness-doctor/src/plugin/rules/security/no-eval.ts).
It's small and framework-agnostic, and everything below uses it as the running
example — read it once before you start.

## Start with a sentence

Before any code, finish this sentence out loud:

> This rule catches `<code pattern>` that causes `<specific problem>`.

For the template:

> This rule catches `eval()`, string-bodied `setTimeout` / `setInterval`, and
> `new Function(...)` — all of which run a string as code, which is a
> code-injection risk.

If you can't fill in both halves crisply, you're not ready to write the rule —
you're still discovering it. A vague pattern produces a noisy rule, and a noisy
rule gets disabled. So before moving on, answer four questions:

- What runtime behavior makes this a bug?
- What code shape triggers it, and what shape fixes it?
- What code _looks_ like the bug but is actually fine? (This is the one people
  skip, and it's the one that decides whether the rule is any good.)
- What is this rule deliberately _not_ trying to catch in its first version?

## The shape of a rule

A rule is an object you hand to `defineRule`. Here's the core of the template,
trimmed to one of its three checks:

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
    "Use `JSON.parse` for data, or rewrite the code so it doesn't build and run code from strings.",
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

Five fields carry the rule:

- **`id`** — the key, kebab-case. Users reference it as `harness-doctor/<id>`.
- **`title`** — a short human label.
- **`severity`** — `"error"` or `"warning"`.
- **`recommendation`** — the fix. It reaches both the human reading the report
  and the agent acting on it, so make it actionable, not a restatement of the
  problem.
- **`create(context)`** — returns the **visitor**: an object whose keys are AST
  node types and whose values are handlers. The engine calls your handler once
  for every node of that type in the file. Inside it, you call
  `context.report({ node, message })` to flag a node.

The visitor keys are your only injection point. You don't traverse anything
yourself — you say "show me every `CallExpression`" by naming it, and the engine
brings them to you. The template names two: `CallExpression` (for `eval` and the
string-bodied timers) and `NewExpression` (for `new Function`).

## Where the bucket comes from

You may have noticed the rule never declares a category or a framework. It
doesn't need to — the **bucket directory it lives in** supplies both. A rule in
`rules/security/` is a security rule; one in `rules/performance/` is a
performance rule. That's why `no-eval` lives under `security/` and says nothing
about it.

This matters for a practical reason: **the registry is generated, not
hand-written.**
[`scripts/generate-rule-registry.mjs`](../packages/oxlint-plugin-harness-doctor/scripts/generate-rule-registry.mjs)
scans every non-test rule file, reads its `id`, and infers framework and default
category from the bucket. Adding a rule is genuinely a one-file operation: drop
the file in the right bucket, set its `id`, regenerate. Never edit
`rule-registry.ts` or `rules.ts` by hand — they carry a "generated, do not edit"
header for a reason, and your changes will be erased the next time codegen runs.

## Pick the least precise detector that still works

Rules come in three tiers of precision. Reach for the simplest one your claim
allows, because every step up in power is another step up in false positives.

**Syntax-only.** The node's shape alone decides it; no surrounding context
matters. The template is syntax-only — `eval` is recognized by its callee name,
the string timers by callee name plus a string first argument. Nothing needs to
be resolved or remembered. Most good rules live here.

**Scope-aware.** You need to know what a name actually refers to. "This
`useThing` must be the one imported from `lib`, not a local function with the
same name" is a scope-aware claim. Resolve the import and respect shadowing
before you trust an identifier's text — a bare name is not proof of origin.

**Path-aware.** Order and branching matter. "Flag this return only if a mutation
already happened earlier on the same path" can't be answered by shape alone; you
have to model the control flow. Model only as much of it as the claim needs, and
no more.

When in doubt, start syntax-only and let a failing test push you up a tier. A
rule that's more precise than its claim requires is just extra surface area for
bugs.

## Read the node, not the text

Always reason about the structured node, never the raw source string. The
string-timer check is a good illustration: it doesn't pattern-match text, it
inspects fields.

```ts
if (
  isNodeOfType(node.callee, "Identifier") &&
  (node.callee.name === "setTimeout" || node.callee.name === "setInterval") &&
  isNodeOfType(node.arguments?.[0], "Literal") &&
  typeof node.arguments[0].value === "string"
) {
  context.report({
    node,
    message: `Passing a string to ${node.callee.name}() runs it as code.`,
  });
}
```

Three habits keep this kind of code honest:

- **Narrow before you read.** `isNodeOfType(node, "Type")` guards at runtime
  _and_ narrows the TypeScript type, so the field accesses after it are both
  safe and type-checked. Reach for it before touching any type-specific field.
- **Tell static apart from dynamic.** `obj.foo` and `obj["foo"]` name a property
  you can match; `obj[name]` does not. Only match on names you can actually see.
- **Decide about nested scopes on purpose.** A handler fires for matching nodes
  _anywhere_ in the file, including inside nested functions and classes. If your
  rule shouldn't descend into them, skip them explicitly — forgetting to is a
  classic false-positive source.

## Borrow before you build

Before writing a helper, look in
[`src/plugin/utils/`](../packages/oxlint-plugin-harness-doctor/src/plugin/utils)
for one that already exists. The template leans entirely on the core primitives
and adds nothing of its own:

- `defineRule` registers the rule.
- `isNodeOfType` / `EsTreeNodeOfType` narrow nodes at runtime and in the types.
- `RuleContext` / `Rule` type the rule and its `report` call.

Add a utility only when two or more call sites need the same non-trivial AST
logic, and give it a name that states exactly what it does:
`getStaticMemberPropertyName`, not `getName`. One utility per file.

## Test both directions, adversarially

Co-locate `<id>.test.ts` and drive the rule through the `runRule` harness. The
point of the suite isn't to prove the rule fires — that's easy. It's to prove
the rule _doesn't_ fire on code that merely resembles the bug.

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

A suite worth trusting covers four kinds of case:

- **Each bad shape** the rule claims — for the template, that's `eval`, string
  `setTimeout`, string `setInterval`, and `new Function`. One per distinct
  shape.
- **Valid look-alikes** — `JSON.parse`, a plain function call, `setTimeout` with
  a _function_ instead of a string. These are the cases that catch over-eager
  matching.
- **Scope and shadowing**, when the rule is scope-aware — a locally shadowed
  name must not fire.
- **Regressions** — one case for every real false positive or miss you find in
  review, so it can never come back.

Vary the shapes. A suite that pastes the same example with one word changed
tests one thing four times.

## Verify it

Work from the plugin package
(`packages/oxlint-plugin-harness-doctor`). Its `typecheck` and `test` scripts
both regenerate the registry first, so the loop is short:

```bash
pnpm gen        # regenerate the registry after adding or removing a rule
pnpm typecheck  # also regenerates, then type-checks
pnpm test       # also regenerates, then runs every rule's tests
```

To run only your rule while iterating:

```bash
pnpm exec vp test run src/plugin/rules/<bucket>/<id>.test.ts
```

And before you commit, confirm the generated registry on disk is current —
CI runs exactly this and fails on a stale registry:

```bash
pnpm gen:check
```

## The usual ways rules go wrong

Most bad rules fail in one of a handful of predictable ways. If something feels
off, start here:

- Matching on a name where you actually needed to resolve an import.
- Walking into nested functions as though they run where they're written.
- Treating a dynamic `obj[name]` access as if it named a known property.
- Letting a half-formed "v2" idea bleed into the rule and widen its claim.
- Writing tests that mirror the implementation instead of exercising real code.

## Checklist

- [ ] The bug fits in one sentence, and you know what valid code looks like next
      to it.
- [ ] Precision tier chosen deliberately (syntax-only / scope-aware /
      path-aware) — the least powerful one that works.
- [ ] The detector reads node fields and narrows with `isNodeOfType`; it never
      matches raw text.
- [ ] Existing utilities reused; any new one is justified and one-per-file.
- [ ] Tests cover every bad shape, the valid look-alikes, and shadowing.
- [ ] `pnpm gen` run, and `typecheck`, `lint`, and the co-located test pass.
