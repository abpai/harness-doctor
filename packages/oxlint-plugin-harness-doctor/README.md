# oxlint-plugin-harness-doctor

[![version](https://img.shields.io/npm/v/oxlint-plugin-harness-doctor?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/oxlint-plugin-harness-doctor)
[![downloads](https://img.shields.io/npm/dt/oxlint-plugin-harness-doctor.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/oxlint-plugin-harness-doctor)

[oxlint](https://oxc.rs/docs/guide/usage/linter) plugin for [Harness Doctor](https://harness.doctor). Diagnoses React codebases for security, performance, correctness, accessibility, bundle-size, and architecture issues.

This package owns the rule implementations (287 rules across architecture, performance, correctness, security, accessibility, bundle-size, framework-specific, `react-builtins`, and `a11y` buckets). [`eslint-plugin-harness-doctor`](https://npmjs.com/package/eslint-plugin-harness-doctor) wraps these same rules for ESLint, and the full diagnostic CLI lives in [`harness-doctor`](https://npmjs.com/package/harness-doctor).

### Ported OXC react + jsx-a11y rules

The `react-builtins/` and `a11y/` buckets contain 100 rules ported from
[`oxc-project/oxc`](https://github.com/oxc-project/oxc)'s
`crates/oxc_linter/src/rules/{react,react_perf,jsx_a11y}/`. They cover
every rule Harness Doctor previously consumed via oxlint's built-in
`react/*` and `jsx-a11y/*` plugins (now sourced natively as
`harness-doctor/*`), including `react/rules-of-hooks` and
`react/exhaustive-deps`, which run on top of a TS port of OXC's scope
analysis + control-flow-graph layer.

## Install

```bash
npm install --save-dev oxlint oxlint-plugin-harness-doctor
```

```bash
pnpm add -D oxlint oxlint-plugin-harness-doctor
```

```bash
yarn add -D oxlint oxlint-plugin-harness-doctor
```

## Usage

In `.oxlintrc.json`:

```jsonc
{
  "jsPlugins": [{ "name": "harness-doctor", "specifier": "oxlint-plugin-harness-doctor" }],
  "rules": {
    "harness-doctor/no-fetch-in-effect": "warn",
    "harness-doctor/no-derived-state-effect": "warn",
  },
}
```

Run oxlint as normal:

```bash
npx oxlint .
```

## Available rules

The full rule list lives in [`rule-registry.ts`](https://github.com/millionco/harness-doctor/blob/main/packages/oxlint-plugin-harness-doctor/src/plugin/rule-registry.ts). All rules are namespaced under `harness-doctor/*`.

Each rule can be set to `"error"`, `"warn"`, or `"off"`:

```jsonc
{
  "rules": {
    "harness-doctor/no-cascading-set-state": "error",
    "harness-doctor/no-array-index-as-key": "warn",
  },
}
```

## "You Might Not Need an Effect" rule family

Eight rules ported 1:1 from [`eslint-plugin-react-you-might-not-need-an-effect`](https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect) (MIT, NickvanDyke) ship natively in this package — same rule IDs, same diagnostic messages, same semantics (195 of 196 upstream test cases pass; the remaining one is upstream's own `todo: true`). Attribution and known divergences live in [`SOURCE.md`](https://github.com/millionco/harness-doctor/blob/main/packages/oxlint-plugin-harness-doctor/src/plugin/rules/state-and-effects/effect/SOURCE.md).

| Rule                                             | What it catches                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `harness-doctor/no-derived-state`                  | Storing derived state via `useEffect` instead of computing during render      |
| `harness-doctor/no-chain-state-updates`            | Chaining state updates across effects                                         |
| `harness-doctor/no-event-handler`                  | Using state + a guarded effect as an event handler                            |
| `harness-doctor/no-adjust-state-on-prop-change`    | Adjusting state in an effect when a prop changes                              |
| `harness-doctor/no-reset-all-state-on-prop-change` | Resetting all state in an effect (use a `key` prop instead)                   |
| `harness-doctor/no-pass-live-state-to-parent`      | Pushing live state to a parent via a callback in an effect                    |
| `harness-doctor/no-pass-data-to-parent`            | Passing fetched data to a parent via a callback in an effect                  |
| `harness-doctor/no-initialize-state`               | Initializing state inside a mount-only effect (pass it to `useState` instead) |

If you previously enabled them as `effect/*` via the optional peer dep, drop the peer dep — they're enabled by default through Harness Doctor's CLI config now.

## Want the CLI too?

This package only ships the oxlint plugin. To run Harness Doctor's full scan (with scoring, JSON reports, agent integration, etc.), use the main CLI:

```bash
npx harness-doctor@latest
```

See the [Harness Doctor README](https://github.com/millionco/harness-doctor#readme) for the full feature set.

## License

MIT
