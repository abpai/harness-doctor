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

| Change type               | Validation command                          | Proof artifact             |
| ------------------------- | ------------------------------------------- | -------------------------- |
| Core/API/CLI logic        | `pnpm test`                                 | passing run output         |
| Types or public API shape | `pnpm typecheck`                            | clean exit                 |
| Lint rules or check logic | `pnpm test` + a fixture exercising the rule | passing run + fixture diff |
| Formatting / style        | `pnpm format:check` and `pnpm lint`         | clean exits                |
| Build artifacts           | `pnpm build`                                | clean exit                 |

## Escalation boundaries

Agents stop and surface instead of guessing when:

- An acceptance criterion cannot be proven with the menu above.
- The change alters published package names, versions, or release flow.
- The spec's scope and the code's reality conflict.
