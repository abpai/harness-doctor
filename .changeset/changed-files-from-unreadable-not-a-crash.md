---
"@andypai/harness-doctor": patch
---

harness-doctor no longer crashes when the `--changed-files-from` file can't be read.

`--changed-files-from <file>` is user input, so an unreadable file — missing, a directory, permission-denied, or a stale pipe/process-substitution descriptor (`EBADF`, REACT-DOCTOR-V) — is an invocation mistake, not a bug. It now exits non-zero with a clean, single-line message telling you to pass a readable text file, instead of printing the generic "Something went wrong" block and reporting the read failure to Sentry.
