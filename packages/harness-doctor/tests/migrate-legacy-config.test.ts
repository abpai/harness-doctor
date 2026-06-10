import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { clearConfigCache, findLegacyConfig, loadConfigWithSource } from "@harness-doctor/core";
import { migrateLegacyConfig } from "../src/cli/utils/migrate-legacy-config.js";

const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-migrate-"));
  tempDirectories.push(tempDirectory);
  return tempDirectory;
};

afterEach(() => {
  for (const tempDirectory of tempDirectories.splice(0)) {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
  clearConfigCache();
});

describe("migrateLegacyConfig", () => {
  it("renames doctor.config.json to a typed harness.config.ts that loads identically", async () => {
    const directory = createTempDirectory();
    const legacyFilePath = path.join(directory, "doctor.config.json");
    fs.writeFileSync(
      legacyFilePath,
      JSON.stringify({
        $schema: "https://harness.doctor/schema/config.json",
        lint: true,
        rules: { "harness-doctor/no-danger": "off" },
      }),
    );

    const legacy = findLegacyConfig(directory);
    if (!legacy) throw new Error("Expected to detect the legacy config");
    const migratedPath = migrateLegacyConfig(legacy);
    expect(migratedPath).toBe(path.join(directory, "harness.config.ts"));
    if (!migratedPath) throw new Error("Expected a migrated path");

    // Legacy file is gone; the new file is a typed default export, no $schema.
    expect(fs.existsSync(legacyFilePath)).toBe(false);
    const written = fs.readFileSync(migratedPath, "utf8");
    expect(written).toContain('import type { HarnessDoctorConfig } from "harness-doctor/api"');
    expect(written).toContain("satisfies HarnessDoctorConfig");
    expect(written).not.toContain("$schema");
    // Idiomatic TS: identifier keys unquoted, rule keys quoted.
    expect(written).toContain("lint: true");
    expect(written).toContain("rules: {");
    expect(written).toContain('"harness-doctor/no-danger": "off"');

    // The generated TS round-trips through the loader to the same settings.
    clearConfigCache();
    const loaded = await loadConfigWithSource(directory);
    expect(loaded?.format).toBe("module");
    expect(loaded?.config).toEqual({ lint: true, rules: { "harness-doctor/no-danger": "off" } });
  });

  it("renames a module doctor.config.ts to harness.config.ts, contents untouched", () => {
    const directory = createTempDirectory();
    const legacyFilePath = path.join(directory, "doctor.config.ts");
    const source = `import type { HarnessDoctorConfig } from "harness-doctor/api";

export default { lint: true } satisfies HarnessDoctorConfig;
`;
    fs.writeFileSync(legacyFilePath, source);

    const migratedPath = migrateLegacyConfig({ legacyFilePath, directory });

    expect(migratedPath).toBe(path.join(directory, "harness.config.ts"));
    expect(fs.existsSync(legacyFilePath)).toBe(false);
    expect(fs.readFileSync(path.join(directory, "harness.config.ts"), "utf8")).toBe(source);
  });

  it("leaves an unparseable legacy file untouched", () => {
    const directory = createTempDirectory();
    const legacyFilePath = path.join(directory, "doctor.config.json");
    fs.writeFileSync(legacyFilePath, "{ not valid json");

    const migratedPath = migrateLegacyConfig({ legacyFilePath, directory });

    expect(migratedPath).toBeNull();
    expect(fs.existsSync(legacyFilePath)).toBe(true);
    expect(fs.existsSync(path.join(directory, "harness.config.ts"))).toBe(false);
  });
});

describe("findLegacyConfig", () => {
  it("detects a lone doctor.config.json", () => {
    const directory = createTempDirectory();
    fs.writeFileSync(path.join(directory, "doctor.config.json"), JSON.stringify({ lint: true }));
    expect(findLegacyConfig(directory)?.directory).toBe(directory);
  });

  it("detects a non-JSON legacy doctor.config.ts", () => {
    const directory = createTempDirectory();
    fs.writeFileSync(path.join(directory, "doctor.config.ts"), "export default { lint: true };\n");
    expect(findLegacyConfig(directory)?.legacyFilePath).toBe(
      path.join(directory, "doctor.config.ts"),
    );
  });

  it("returns null when a harness.config.* already supersedes the legacy file", () => {
    const directory = createTempDirectory();
    fs.writeFileSync(path.join(directory, "doctor.config.json"), JSON.stringify({ lint: true }));
    fs.writeFileSync(path.join(directory, "harness.config.json"), JSON.stringify({ lint: true }));
    expect(findLegacyConfig(directory)).toBeNull();
  });

  it("returns null when package.json#harnessDoctor supersedes the legacy file", () => {
    const directory = createTempDirectory();
    fs.writeFileSync(path.join(directory, "doctor.config.json"), JSON.stringify({ lint: true }));
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ harnessDoctor: { lint: true } }),
    );
    expect(findLegacyConfig(directory)).toBeNull();
  });

  it("finds a legacy file in an ancestor, stopping at the project boundary", () => {
    const root = createTempDirectory();
    fs.writeFileSync(path.join(root, "doctor.config.json"), JSON.stringify({ lint: true }));
    fs.mkdirSync(path.join(root, ".git"));
    const child = path.join(root, "packages", "ui");
    fs.mkdirSync(child, { recursive: true });
    expect(findLegacyConfig(child)?.directory).toBe(root);
  });
});
