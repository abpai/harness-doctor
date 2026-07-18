import { describe, expect, it } from "vite-plus/test";
import { hasPublishedFixRecipe } from "@harness-doctor/core";

describe("hasPublishedFixRecipe", () => {
  it("is false for every surviving rule family (no recipe pages are published)", () => {
    // Docs-structure / supply-chain checks carry their fix guidance inline
    // in the diagnostic help text; advertising a recipe URL would 404.
    expect(
      hasPublishedFixRecipe({
        plugin: "harness-doctor",
        rule: "docs-structure/spec-contract-exists",
      }),
    ).toBe(false);
    expect(
      hasPublishedFixRecipe({ plugin: "harness-doctor", rule: "require-pnpm-hardening" }),
    ).toBe(false);
  });

  it("is false for dead-code diagnostics (Knip has no recipes)", () => {
    expect(hasPublishedFixRecipe({ plugin: "knip", rule: "unused-file" })).toBe(false);
    expect(hasPublishedFixRecipe({ plugin: "knip", rule: "circular-dependency" })).toBe(false);
  });

  it("is false for unknown plugins", () => {
    expect(hasPublishedFixRecipe({ plugin: "eslint", rule: "no-unused-vars" })).toBe(false);
  });
});
