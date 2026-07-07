# Spec contract

Specs executed against this repo must meet this bar. A spec that promises a
proof not listed in the proof menu is invalid — extend the menu (and the
validation surface behind it) first.

## Quality bar

A spec is ready when it:

- Is self-contained: an agent with no prior context can execute it.
- Names a goal as a user-visible outcome, not an implementation.
- Lists acceptance criteria that each map to a proof in the menu below.
- Names the packages/files it expects to touch, when known.
- States what is out of scope.
- Ends with an end-to-end verification step drawn from the proof menu.

## Proof menu

| Change type               | Lane | Validation command              | Proof artifact             | Sufficiency |
| ------------------------- | ---- | ------------------------------- | -------------------------- | ----------- |
| Core/API/CLI logic        | full | `pnpm test`                     | passing run output         | auto        |
| Types or public API shape | full | `pnpm typecheck`                | clean exit                 | auto        |
| Lint rules or check logic | full | `pnpm test`                     | passing run + fixture diff | auto        |
| Formatting / style        | full | `pnpm format:check` `pnpm lint` | clean exits                | auto        |
| Build artifacts           | full | `pnpm build`                    | clean exit                 | auto        |

`Sufficiency` says whether the validation command is sufficient evidence for
"done" (`auto`) or the change needs human sign-off (`human-gate`). A false-green
merges broken work in an unattended loop, which is worse than a false-red.

## Escalation boundaries

Agents stop and surface instead of guessing when:

- An acceptance criterion cannot be proven with the menu above.
- The change alters published package names, versions, or release flow.
- The spec's scope and the code's reality conflict.

Recovery prefers reversible-by-construction (transactional or idempotent,
flag-gated) over a documented rollback; a written rollback is the fallback only
for the irreducibly irreversible.
