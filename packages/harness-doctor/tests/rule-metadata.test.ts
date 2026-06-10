import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  checkDocsStructure,
  checkPnpmHardening,
  DIAGNOSTIC_CATEGORY_BUCKETS,
  findRuleMetadata,
  HARNESS_DOCTOR_RULE_CATALOG,
} from "@harness-doctor/core";

// Executable spec for the rule-catalog conventions: every rule the
// deterministic checks can emit must be present in the catalog (the
// `rules` CLI and tag controls key off it), carry a category from the
// closed user-facing set, and ship usable fix guidance.

describe("rule catalog conventions", () => {
  it("registers the docs-structure, supply-chain, and dead-code families", () => {
    const plugins = new Set(HARNESS_DOCTOR_RULE_CATALOG.map((entry) => entry.plugin));
    expect(plugins).toEqual(new Set(["harness-doctor", "deslop"]));
    expect(
      HARNESS_DOCTOR_RULE_CATALOG.filter((entry) => entry.rule.startsWith("docs-structure/"))
        .length,
    ).toBeGreaterThanOrEqual(15);
  });

  it("derives every key from its plugin and rule", () => {
    for (const entry of HARNESS_DOCTOR_RULE_CATALOG) {
      expect(entry.key).toBe(`${entry.plugin}/${entry.rule}`);
    }
  });

  it("buckets every rule into one of the five user-facing categories", () => {
    const allowed = new Set<string>(DIAGNOSTIC_CATEGORY_BUCKETS);
    const offenders = HARNESS_DOCTOR_RULE_CATALOG.filter(
      (entry) => !allowed.has(entry.category),
    ).map((entry) => `${entry.key} → ${entry.category}`);
    expect(offenders).toEqual([]);
  });

  it("gives every rule a non-empty recommendation and at least one tag", () => {
    for (const entry of HARNESS_DOCTOR_RULE_CATALOG) {
      expect(entry.recommendation.trim().length, entry.key).toBeGreaterThan(0);
      expect(entry.tags.length, entry.key).toBeGreaterThan(0);
    }
  });
});

describe("rule catalog ↔ check parity", () => {
  // A bare directory plus a strict docsContract scan trips most checks;
  // every diagnostic the checks emit must resolve in the catalog so the
  // `rules` CLI can explain and configure it.
  const bareRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-catalog-"));
  afterAll(() => {
    fs.rmSync(bareRoot, { recursive: true, force: true });
  });

  it("every emitted docs-structure / pnpm diagnostic resolves in the catalog", () => {
    const diagnostics = [
      ...checkDocsStructure(bareRoot, { docsContract: true }),
      ...checkPnpmHardening(bareRoot),
    ];
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      const entry = findRuleMetadata(diagnostic.plugin, diagnostic.rule);
      expect(entry, `${diagnostic.plugin}/${diagnostic.rule} missing from catalog`).toBeDefined();
      expect(entry?.category).toBe(diagnostic.category);
    }
  });
});
