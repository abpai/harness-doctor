---
"@andypai/harness-doctor": minor
---

Use Knip's JSON CLI reporter for dead-code analysis in an isolated subprocess.
The existing `deslop/<rule>` diagnostic keys remain stable, and repository-owned
Knip configuration is discovered automatically. Full monorepo scans invoke it
once from the selected root, retaining cross-workspace usage edges.
