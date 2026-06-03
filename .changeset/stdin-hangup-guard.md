---
"harness-doctor": patch
---

A terminal hangup during an interactive prompt no longer crashes the CLI. When the terminal/PTY backing a prompt goes away mid-read (closing the tab, a dropped SSH/tmux session, sleep/wake), Node raises `read EIO` on the raw-mode stdin handle; the CLI now exits cleanly (code 129) instead of surfacing it as a fatal uncaught exception and reporting it to crash telemetry. Genuine stdin errors still funnel to the error reporter unchanged.
