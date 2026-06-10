# eslint-plugin-harness-doctor

[![version](https://img.shields.io/npm/v/eslint-plugin-harness-doctor?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/eslint-plugin-harness-doctor)
[![downloads](https://img.shields.io/npm/dt/eslint-plugin-harness-doctor.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/eslint-plugin-harness-doctor)

ESLint plugin for [Harness Doctor](https://harness.doctor). Diagnoses React codebases for security, performance, correctness, accessibility, bundle-size, and architecture issues.

The set now includes 100 rules ported from
[`oxc-project/oxc`](https://github.com/oxc-project/oxc)'s React +
jsx-a11y linting plugins, exposed alongside Harness Doctor's own rules
under the `harness-doctor/*` namespace.

This package owns the ESLint adapter for Harness Doctor's rule set. The underlying rules ship in [`oxlint-plugin-harness-doctor`](https://npmjs.com/package/oxlint-plugin-harness-doctor) (auto-installed as a transitive dependency). The full diagnostic CLI lives in [`harness-doctor`](https://npmjs.com/package/harness-doctor) and pulls in this same rule set; install whichever fits your workflow.

## Install

```bash
npm install --save-dev eslint-plugin-harness-doctor
```

```bash
pnpm add -D eslint-plugin-harness-doctor
```

```bash
yarn add -D eslint-plugin-harness-doctor
```

## Usage

Flat config (ESLint v9+):

```js
import harnessDoctor from "eslint-plugin-harness-doctor";

export default [
  harnessDoctor.configs.recommended,
  harnessDoctor.configs.next,
  harnessDoctor.configs["react-native"],
  harnessDoctor.configs["tanstack-start"],
  harnessDoctor.configs["tanstack-query"],
];
```

Pick only the configs that match your stack. `recommended` is framework-agnostic; the others layer on framework-specific rules.

## Available configs

| Config           | What it adds                                                  |
| ---------------- | ------------------------------------------------------------- |
| `recommended`    | Framework-agnostic React rules. Safe baseline.                |
| `next`           | Next.js specific rules (App Router, server components, etc.). |
| `react-native`   | React Native specific rules.                                  |
| `tanstack-start` | TanStack Start specific rules.                                |
| `tanstack-query` | TanStack Query specific rules.                                |
| `all`            | Every rule across every framework, at recommended severity.   |

## Available rules

The full rule list lives in [`rule-registry.ts`](https://github.com/abpai/harness-doctor/blob/main/packages/oxlint-plugin-harness-doctor/src/plugin/rule-registry.ts). Rules are namespaced under `harness-doctor/*`.

To override a rule:

```js
import harnessDoctor from "eslint-plugin-harness-doctor";

export default [
  harnessDoctor.configs.recommended,
  {
    rules: {
      "harness-doctor/no-fetch-in-effect": "error",
      "harness-doctor/no-derived-state-effect": "off",
    },
  },
];
```

## Want the CLI too?

This package only ships the ESLint plugin. To run Harness Doctor's full scan (with scoring, JSON reports, agent integration, etc.), use the main CLI:

```bash
npx @andypai/harness-doctor@latest
```

See the [Harness Doctor README](https://github.com/abpai/harness-doctor#readme) for the full feature set.

## License

MIT
