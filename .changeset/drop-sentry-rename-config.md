---
"@andypai/harness-doctor": minor
---

Remove the Sentry crash-reporting / telemetry subsystem and rename the config
file to `harness.config.*` so it no longer collides with react-doctor's
`doctor.config.*`.

- **Config rename.** The config file is now
  `harness.config.{ts,mts,cts,js,mjs,cjs,json,jsonc}` (or the
  `package.json#harnessDoctor` key). On an interactive human run, an existing
  `doctor.config.json` is automatically migrated to a typed `harness.config.ts`
  (settings preserved, `$schema` dropped) and you're told once; CI, coding-agent,
  `--staged`, JSON/score, and non-TTY runs are left untouched but a warning
  nudges them to rename it. The `package.json#harnessDoctor` key is unchanged.
- **No Sentry.** All crash-reporting, metrics, and tracing through Sentry is
  gone. OTLP export (`HARNESS_DOCTOR_OTLP_*`) is unaffected. The tool still runs
  entirely offline by default.
