import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as {
  version: string;
};

const TEST_TIMEOUT_MS = 30_000;

// HACK: agent-install's parseSkillManifest silently returns `null` when
// frontmatter is missing or invalid `name:` / `description:` fields,
// which caused `harness-doctor install` to print success while writing
// zero files (see review-report.md H1). Validate at build time so a
// broken SKILL.md is caught here, not at install time.
const assertSkillManifestParseable = (manifestPath: string): void => {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`SKILL.md at ${manifestPath} is missing YAML frontmatter (--- ... ---).`);
  }
  const frontmatter = match[1] ?? "";
  const hasName = /^[ \t]*name[ \t]*:[ \t]*\S/m.test(frontmatter);
  const hasDescription = /^[ \t]*description[ \t]*:[ \t]*\S/m.test(frontmatter);
  if (!hasName || !hasDescription) {
    throw new Error(
      `SKILL.md at ${manifestPath} must declare both "name:" and "description:" in frontmatter (got name=${hasName}, description=${hasDescription}).`,
    );
  }
};

// Ship every skill directory under `skills/` (harness-doctor + doctor-explain
// today) so `harness-doctor install` can install them all. Each is validated
// at build time so a broken SKILL.md is caught here, not at install time.
const copySkillsToDist = () => {
  const skillsRoot = path.resolve(packageRoot, "../../skills");
  const distSkillsRoot = path.resolve(packageRoot, "dist/skills");
  const primarySkillSource = path.join(skillsRoot, "harness-doctor");
  if (!fs.existsSync(primarySkillSource)) {
    throw new Error(`Skill source missing at ${primarySkillSource}; expected to ship dist/skills/`);
  }
  fs.rmSync(distSkillsRoot, { recursive: true, force: true });
  const skillNames = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(skillsRoot, name, "SKILL.md")));
  for (const skillName of skillNames) {
    const skillSource = path.join(skillsRoot, skillName);
    const skillTarget = path.join(distSkillsRoot, skillName);
    assertSkillManifestParseable(path.join(skillSource, "SKILL.md"));
    fs.mkdirSync(skillTarget, { recursive: true });
    fs.cpSync(skillSource, skillTarget, { recursive: true });
  }
};

export default defineConfig({
  pack: [
    {
      entry: { cli: "./src/cli/index.ts" },
      deps: {
        // Inline pure-JS CLI deps so `npm i @andypai/harness-doctor` skips
        // ~15 transitive installs (commander, ora, and ora's spinner
        // / cursor / log-symbols / string-width chain). Prompts (we
        // monkey-patch it via require so the runtime copy must be on
        // disk), agent-install (its jsonc-parser/yaml/toml transitives
        // ship as UMD that doesn't bundle cleanly), and the typescript
        // compiler all stay external.
        alwaysBundle: ["commander", "ora"],
        neverBundle: [
          "@effect/platform-bun",
          "agent-install",
          // Config loading/editing: jiti (TS/JS config eval) + confbox
          // (JSONC parse) power the loader in @harness-doctor/core (bundled
          // in here), and magicast edits .ts/.js configs for `rules`.
          // All pure-JS but heavy / runtime-resolving, so keep external
          // and installed rather than inlined into the CLI bundle.
          "confbox",
          "jiti",
          "magicast",
          // Knip is a CLI subprocess resolved at runtime by core. Keep it
          // external so the published package retains its bin entry.
          "knip",
          // Effect ships as ~1MB+ of tree-shakable TypeScript; bundling
          // it would balloon the published tarball. Match harness-doctor-evals
          // and let installers pull it as a regular dependency.
          "effect",
          "prompts",
          "typescript",
        ],
      },
      dts: true,
      target: "esnext",
      platform: "node",
      // Emit source maps for local debugging. The `.map` files are NOT shipped
      // in the npm tarball (see package.json "files").
      sourcemap: true,
      env: {
        VERSION: process.env.VERSION ?? packageJson.version,
      },
      // HACK: no shebang on dist/cli.js — the published `bin` entry is
      // bin/harness-doctor.js, which owns the `#!/usr/bin/env bun` line.
      // dist/cli.js is loaded via
      // `await import(...)` from that shim, where a stray shebang on
      // line 1 isn't useful and just bloats the bundle. (Programmatic
      // `import "harness-doctor"` consumers don't care either way — Node
      // ignores a shebang in ESM imports — but we don't need it there.)
      fixedExtension: false,
      hooks: {
        "build:done": () => {
          copySkillsToDist();
        },
      },
    },
    {
      entry: { index: "./src/index.ts" },
      deps: {
        alwaysBundle: ["commander", "ora"],
        neverBundle: [
          "@effect/platform-bun",
          "agent-install",
          "confbox",
          "jiti",
          "magicast",
          "knip",
          "effect",
          "prompts",
          "typescript",
        ],
      },
      dts: true,
      target: "esnext",
      platform: "node",
      fixedExtension: false,
    },
  ],
  test: {
    testTimeout: TEST_TIMEOUT_MS,
    // NOTE: do NOT pin Windows onto a single serial fork
    // (`singleFork` / `maxWorkers: 1` / `fileParallelism: false`).
    // This suite drives a child-process analysis in dead-code tests; funneling all ~105 test
    // files through one long-lived worker lets that process accumulate
    // memory/handles across the whole run and crash near the end, which
    // vitest reports as "Worker exited unexpectedly" (Worker forks
    // emitted error) and fails the job with 0 failed assertions. The
    // default parallel + isolated forks keep each worker short-lived so
    // memory is reclaimed between files — Windows CI was green 16/16
    // with this default and started crashing the moment the override
    // landed. Keep Windows on the default pool.
  },
});
