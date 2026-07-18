---
"@andypai/harness-doctor": major
---

Use Knip's JSON CLI reporter for dead-code analysis in an isolated subprocess.
Repository-owned Knip configuration is discovered automatically. Full monorepo
scans invoke it once from the selected root, retaining cross-workspace usage
edges.

**Breaking change:** rename every dead-code severity override and suppression
from `deslop/<rule>` to `knip/<rule>` (for example,
`deslop/unused-file` becomes `knip/unused-file`).
