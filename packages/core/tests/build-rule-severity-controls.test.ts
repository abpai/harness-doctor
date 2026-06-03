import { describe, expect, it } from "vite-plus/test";
import type { HarnessDoctorConfig } from "@harness-doctor/core";
import { buildRuleSeverityControls } from "@harness-doctor/core";

describe("buildRuleSeverityControls", () => {
  it("returns undefined for a null config", () => {
    expect(buildRuleSeverityControls(null)).toBeUndefined();
  });

  it("returns undefined when neither `rules` nor `categories` are set", () => {
    const config: HarnessDoctorConfig = { verbose: true };
    expect(buildRuleSeverityControls(config)).toBeUndefined();
  });

  it("assembles a controls object from the top-level fields", () => {
    const config: HarnessDoctorConfig = {
      rules: { "harness-doctor/no-array-index-as-key": "error" },
      categories: { "React Native": "warn" },
    };
    expect(buildRuleSeverityControls(config)).toEqual({
      rules: { "harness-doctor/no-array-index-as-key": "error" },
      categories: { "React Native": "warn" },
    });
  });

  it("omits unset channels (doesn't fabricate empty maps)", () => {
    const config: HarnessDoctorConfig = { categories: { Server: "off" } };
    expect(buildRuleSeverityControls(config)).toEqual({ categories: { Server: "off" } });
  });
});
