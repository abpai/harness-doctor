import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  rulesCategoryAction,
  rulesDisableAction,
  rulesEnableAction,
  rulesExplainAction,
  rulesIgnoreTagAction,
  rulesListAction,
  rulesSetAction,
  rulesUnignoreTagAction,
} from "../src/cli/commands/rules.js";

interface RulesCommandFixture {
  readonly projectRoot: string;
  readonly configPath: string;
  readonly packageJsonPath: string;
  readonly cleanup: () => void;
}

const setupFixture = (
  packageJson: Record<string, unknown> = { name: "fixture" },
): RulesCommandFixture => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "harness-doctor-rules-"));
  writeFileSync(
    path.join(projectRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  return {
    projectRoot,
    configPath: path.join(projectRoot, "doctor.config.json"),
    packageJsonPath: path.join(projectRoot, "package.json"),
    cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
  };
};

const readJsonFile = (filePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(filePath, "utf8"));

const captureLog = async (run: () => Promise<void> | void): Promise<string> => {
  const lines: string[] = [];
  const consoleObject = globalThis.console as unknown as Record<string, unknown>;
  const originalLog = consoleObject.log;
  consoleObject.log = (...args: unknown[]): void => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  try {
    await run();
    return lines.join("\n");
  } finally {
    consoleObject.log = originalLog;
  }
};

let fixture: RulesCommandFixture;
let restoreExitCode: number | string | null | undefined;

beforeEach(() => {
  restoreExitCode = process.exitCode;
  process.exitCode = 0;
});

afterEach(() => {
  fixture?.cleanup();
  // A validation error sets `process.exitCode = 1`; reset so the runner
  // doesn't inherit a non-zero exit from a deliberately-failing case.
  process.exitCode = restoreExitCode ?? 0;
});

describe("rules disable / set / enable", () => {
  it("creates a schema-stamped doctor.config.json when none exists", async () => {
    fixture = setupFixture();
    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(true);
    const config = readJsonFile(fixture.configPath);
    expect(config.$schema).toBe("https://harness.doctor/schema/config.json");
    expect(config.rules).toEqual({ "harness-doctor/no-eval": "off" });
    expect(process.exitCode).toBe(0);
  });

  it("accepts the bare rule id (resolves to the canonical key)", async () => {
    fixture = setupFixture();
    await rulesSetAction("no-eval", "error", { cwd: fixture.projectRoot });

    const config = readJsonFile(fixture.configPath);
    expect(config.rules).toMatchObject({
      "harness-doctor/no-eval": "error",
    });
  });

  it("preserves unrelated config fields", async () => {
    fixture = setupFixture();
    writeFileSync(fixture.configPath, JSON.stringify({ lint: true }, null, 2));
    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    const config = readJsonFile(fixture.configPath);
    expect(config.lint).toBe(true);
    expect(config.rules).toMatchObject({
      "harness-doctor/no-eval": "off",
    });
  });

  it("enable uses the rule's recommended severity by default", async () => {
    fixture = setupFixture();
    await rulesEnableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    const config = readJsonFile(fixture.configPath);
    const severity = (config.rules as Record<string, string>)["harness-doctor/no-eval"];
    expect(["warn", "error"]).toContain(severity);
  });

  it("rejects an invalid severity without writing a config", async () => {
    fixture = setupFixture();
    await rulesSetAction("harness-doctor/no-eval", "loud", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("rejects an unknown rule without writing a config", async () => {
    fixture = setupFixture();
    await rulesDisableAction("harness-doctor/not-a-real-rule", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});

describe("rules config formats", () => {
  it("edits a doctor.config.ts in place, preserving the comment and other options", async () => {
    fixture = setupFixture();
    const tsConfigPath = path.join(fixture.projectRoot, "doctor.config.ts");
    writeFileSync(tsConfigPath, "export default {\n  // keep this\n  lint: true,\n};\n");

    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    const written = readFileSync(tsConfigPath, "utf8");
    expect(written).toContain("// keep this");
    expect(written).toContain("lint: true");
    expect(written).toContain('"harness-doctor/no-eval": "off"');
    // No JSON config created — the TS config was edited directly.
    expect(existsSync(fixture.configPath)).toBe(false);
  });

  it("edits a doctor.config.ts that exports a const via `export default <name>`", async () => {
    fixture = setupFixture();
    const tsConfigPath = path.join(fixture.projectRoot, "doctor.config.ts");
    writeFileSync(
      tsConfigPath,
      'import type { HarnessDoctorConfig } from "harness-doctor/api";\n\nconst config: HarnessDoctorConfig = {\n  // keep this\n  lint: true,\n};\n\nexport default config;\n',
    );

    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    const written = readFileSync(tsConfigPath, "utf8");
    // The const indirection, its type annotation, the comment, and the other
    // option all survive — only the managed `rules` section was spliced in.
    expect(written).toContain("const config: HarnessDoctorConfig");
    expect(written).toContain("// keep this");
    expect(written).toContain("lint: true");
    expect(written).toContain('"harness-doctor/no-eval": "off"');
    expect(existsSync(fixture.configPath)).toBe(false);
  });

  it("edits an inline `export default {…} satisfies` config (the migration output shape)", async () => {
    fixture = setupFixture();
    const tsConfigPath = path.join(fixture.projectRoot, "doctor.config.ts");
    // Byte-identical to what migrateLegacyConfig emits.
    writeFileSync(
      tsConfigPath,
      'import type { HarnessDoctorConfig } from "harness-doctor/api";\n\nexport default {\n  lint: true\n} satisfies HarnessDoctorConfig;\n',
    );

    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    const written = readFileSync(tsConfigPath, "utf8");
    // magicast unwraps the inline `satisfies` so the object is edited directly —
    // the `satisfies` wrapper and the other option survive, no fallback file.
    expect(written).toContain("satisfies HarnessDoctorConfig");
    expect(written).toContain("lint: true");
    expect(written).toContain('"harness-doctor/no-eval": "off"');
    expect(existsSync(fixture.configPath)).toBe(false);
  });

  it("updates the package.json harnessDoctor block instead of creating a file", async () => {
    fixture = setupFixture({ name: "fixture", harnessDoctor: { lint: true } });
    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(false);
    const packageJson = readJsonFile(fixture.packageJsonPath);
    expect(packageJson.harnessDoctor).toMatchObject({
      lint: true,
      rules: { "harness-doctor/no-eval": "off" },
    });
  });

  it("writes package.json#harnessDoctor and leaves an unparseable config file untouched", async () => {
    fixture = setupFixture({ name: "fixture", harnessDoctor: { lint: true } });
    const brokenConfig = "{ not valid json";
    writeFileSync(fixture.configPath, brokenConfig);

    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    // The broken file is left as-is — the scanner reads package.json#harnessDoctor
    // when the config file fails to parse, so the mutation must not shadow it.
    expect(readFileSync(fixture.configPath, "utf8")).toBe(brokenConfig);
    const packageJson = readJsonFile(fixture.packageJsonPath);
    expect(packageJson.harnessDoctor).toMatchObject({
      lint: true,
      rules: { "harness-doctor/no-eval": "off" },
    });
  });
});

describe("rules category", () => {
  it("sets a category severity by case-insensitive match", async () => {
    fixture = setupFixture();
    await rulesCategoryAction("security", "off", { cwd: fixture.projectRoot });

    const config = readJsonFile(fixture.configPath);
    expect(config.categories).toEqual({ Security: "off" });
  });

  it("rejects an unknown category", async () => {
    fixture = setupFixture();
    await rulesCategoryAction("Nonsense", "off", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});

describe("rules ignore-tag / unignore-tag", () => {
  it("unignore-tag on a project that never ignored the tag is a no-op", async () => {
    fixture = setupFixture();
    await rulesUnignoreTagAction("design", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  // The boilerplate ships no tag-carrying rules, so the known-tag set is
  // empty and every tag is rejected. (Integrators that tag their rules get
  // the full ignore-tag / unignore-tag round-trip back automatically.)
  it("rejects an unknown tag", async () => {
    fixture = setupFixture();
    await rulesIgnoreTagAction("not-a-tag", { cwd: fixture.projectRoot });

    expect(existsSync(fixture.configPath)).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});

describe("rules list / explain JSON output", () => {
  it("reflects the configured severity in `list --json`", async () => {
    fixture = setupFixture();
    await rulesDisableAction("harness-doctor/no-eval", { cwd: fixture.projectRoot });

    const output = await captureLog(() =>
      rulesListAction({ json: true, configured: true, cwd: fixture.projectRoot }),
    );
    const payload = JSON.parse(output) as Array<{ key: string; severity: string; source: string }>;
    const entry = payload.find((row) => row.key === "harness-doctor/no-eval");
    expect(entry).toMatchObject({ severity: "off", source: "rule" });
  });

  it("ignores invalid config severities the scanner would drop", async () => {
    fixture = setupFixture();
    writeFileSync(
      fixture.configPath,
      JSON.stringify({ rules: { "harness-doctor/no-eval": "warning" } }, null, 2),
    );

    const output = await captureLog(() =>
      rulesExplainAction("harness-doctor/no-eval", { json: true, cwd: fixture.projectRoot }),
    );
    const payload = JSON.parse(output) as { severity: string; source: string };
    // `"warning"` is not a valid severity; validateConfigTypes drops it, so the
    // rule falls back to its registry default rather than reporting "warning".
    expect(payload.source).toBe("default");
    expect(["warn", "error", "off"]).toContain(payload.severity);
  });

  it("explains a rule as JSON with a learn-more URL", async () => {
    fixture = setupFixture();
    const output = await captureLog(() =>
      rulesExplainAction("harness-doctor/no-eval", { json: true, cwd: fixture.projectRoot }),
    );
    const payload = JSON.parse(output) as { key: string; learnMoreUrl: string };
    expect(payload.key).toBe("harness-doctor/no-eval");
    expect(payload.learnMoreUrl).toContain("/docs/rules/harness-doctor/no-eval");
  });

  it("reports an unknown rule for explain", async () => {
    fixture = setupFixture();
    await rulesExplainAction("harness-doctor/nope", { cwd: fixture.projectRoot });
    expect(process.exitCode).toBe(1);
  });
});
