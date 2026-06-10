import { renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LegacyConfigLocation } from "@harness-doctor/core";
import { readObjectFile } from "./read-object-file.js";
import { serializeTsObjectLiteral } from "./serialize-ts-object-literal.js";

const CONFIG_BASENAME = "harness.config";
const LEGACY_CONFIG_BASENAME = "doctor.config";
const MIGRATED_DATA_CONFIG_FILENAME = `${CONFIG_BASENAME}.ts`;
// Data configs (JSON/JSONC) are transformed into a typed module; every other
// supported extension is already a module, so it only needs renaming.
const DATA_CONFIG_EXTENSIONS: ReadonlySet<string> = new Set(["json", "jsonc"]);

/**
 * Renames a pre-rename `doctor.config.*` to the `harness.config.*` basename,
 * preserving the user's settings.
 *
 * - A data config (`doctor.config.json` / `.jsonc`) becomes a typed
 *   `harness.config.ts` whose default export is the parsed settings (`$schema`
 *   dropped — the `HarnessDoctorConfig` type supersedes it). Returns `null`
 *   when it can't be parsed as an object (left untouched for manual cleanup).
 * - A module config (`.ts`/`.mts`/`.cts`/`.js`/`.mjs`/`.cjs`) is renamed to
 *   `harness.config.<same-ext>` with its contents untouched.
 *
 * Returns the new file's absolute path, or `null` when nothing was migrated.
 */
export const migrateLegacyConfig = (legacy: LegacyConfigLocation): string | null => {
  const legacyBasename = path.basename(legacy.legacyFilePath);
  const extension = legacyBasename.slice(`${LEGACY_CONFIG_BASENAME}.`.length);

  if (!DATA_CONFIG_EXTENSIONS.has(extension)) {
    // Module config: a pure rename preserves the typed source verbatim.
    const targetPath = path.join(legacy.directory, `${CONFIG_BASENAME}.${extension}`);
    renameSync(legacy.legacyFilePath, targetPath);
    return targetPath;
  }

  const parsed = readObjectFile(legacy.legacyFilePath);
  if (!parsed) return null;

  const config = { ...parsed };
  delete config.$schema;

  const targetPath = path.join(legacy.directory, MIGRATED_DATA_CONFIG_FILENAME);
  const contents = `import type { HarnessDoctorConfig } from "harness-doctor/api";

export default ${serializeTsObjectLiteral(config)} satisfies HarnessDoctorConfig;
`;
  writeFileSync(targetPath, contents);
  rmSync(legacy.legacyFilePath, { force: true });
  return targetPath;
};
