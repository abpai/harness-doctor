import { describe, expect, it } from "vite-plus/test";
import type { HarnessDoctorConfig } from "@harness-doctor/core";
import {
  buildRuleCatalog,
  findRuleInCatalog,
  listRuleCategories,
} from "../src/cli/utils/rule-catalog.js";
import { resolveEffectiveRuleSeverity } from "../src/cli/utils/resolve-effective-rule-severity.js";
import {
  addIgnoredTag,
  removeIgnoredTag,
  setCategorySeverity,
  setRuleSeverity,
} from "../src/cli/utils/update-rule-config.js";

const catalog = buildRuleCatalog();

const findRequiredRule = (ruleQuery: string) => {
  const entry = findRuleInCatalog(catalog, ruleQuery);
  if (!entry) throw new Error(`Expected catalog to contain ${ruleQuery}`);
  return entry;
};

describe("buildRuleCatalog", () => {
  it("exposes fully-qualified keys, ids, categories, and default severity", () => {
    const entry = findRequiredRule("harness-doctor/no-eval");
    expect(entry.id).toBe("no-eval");
    expect(entry.key).toBe("harness-doctor/no-eval");
    expect(entry.category.length).toBeGreaterThan(0);
    expect(["error", "warn"]).toContain(entry.defaultSeverity);
  });

  it("lists the categories carried by registered rules", () => {
    expect(listRuleCategories(catalog)).toContain("Security");
  });
});

describe("findRuleInCatalog", () => {
  it("matches the bare rule id", () => {
    expect(findRuleInCatalog(catalog, "no-eval")?.key).toBe("harness-doctor/no-eval");
  });

  it("returns undefined for an unknown rule", () => {
    expect(findRuleInCatalog(catalog, "harness-doctor/does-not-exist")).toBeUndefined();
    expect(findRuleInCatalog(catalog, "")).toBeUndefined();
  });
});

describe("setRuleSeverity", () => {
  it("adds a rule severity, preserving unrelated fields", () => {
    const next = setRuleSeverity({ lint: true }, "harness-doctor/no-eval", "off");
    expect(next.lint).toBe(true);
    expect(next.rules).toEqual({ "harness-doctor/no-eval": "off" });
  });
});

describe("setCategorySeverity", () => {
  it("sets a category severity without clobbering others", () => {
    const next = setCategorySeverity(
      { categories: { Performance: "warn" } },
      "Security",
      "off",
    );
    expect(next.categories).toEqual({ Performance: "warn", Security: "off" });
  });
});

describe("addIgnoredTag / removeIgnoredTag", () => {
  it("adds a tag, deduped and sorted", () => {
    const next = addIgnoredTag({ ignore: { tags: ["test-noise"] } }, "design");
    expect(next.ignore?.tags).toEqual(["design", "test-noise"]);
  });

  it("is a no-op when the tag is already ignored", () => {
    const config: HarnessDoctorConfig = { ignore: { tags: ["design"] } };
    expect(addIgnoredTag(config, "design")).toBe(config);
  });

  it("removes a tag and drops the empty ignore block", () => {
    const next = removeIgnoredTag({ ignore: { tags: ["design"] } }, "design");
    expect(next.ignore).toBeUndefined();
  });

  it("keeps other ignore fields when removing the last tag", () => {
    const next = removeIgnoredTag({ ignore: { tags: ["design"], files: ["dist/**"] } }, "design");
    expect(next.ignore).toEqual({ files: ["dist/**"] });
  });
});

describe("resolveEffectiveRuleSeverity", () => {
  const entry = findRequiredRule("harness-doctor/no-eval");

  it("falls back to the registry default when nothing overrides it", () => {
    const result = resolveEffectiveRuleSeverity(null, entry);
    expect(result.source).toBe("default");
    expect(result.value).toBe(entry.defaultSeverity);
  });

  it("prefers a rule-level override", () => {
    const result = resolveEffectiveRuleSeverity({ rules: { [entry.key]: "off" } }, entry);
    expect(result).toEqual({ value: "off", source: "rule" });
  });

  it("uses a category override when no rule override exists", () => {
    const result = resolveEffectiveRuleSeverity({ categories: { [entry.category]: "off" } }, entry);
    expect(result).toEqual({ value: "off", source: "category" });
  });
});
