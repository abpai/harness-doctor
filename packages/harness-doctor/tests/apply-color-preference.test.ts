import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { highlighter, setColorEnabled } from "@harness-doctor/core";
import { applyColorPreference } from "../src/cli/utils/apply-color-preference.js";

const hasAnsi = (text: string): boolean => text.includes("\u001B[");

// `setColorEnabled` mutates a process-wide singleton, so each case runs
// from an explicit state and the original (ambient) state is restored
// afterwards, keeping this file from leaking forced color into others.
let originalColorEnabled = false;

beforeAll(() => {
  originalColorEnabled = hasAnsi(highlighter.info("x"));
});

afterAll(() => {
  setColorEnabled(originalColorEnabled);
});

afterEach(() => {
  setColorEnabled(originalColorEnabled);
});

describe("applyColorPreference", () => {
  it("disables color and sets NO_COLOR when --no-color is present", () => {
    setColorEnabled(true);
    const env: NodeJS.ProcessEnv = {};
    applyColorPreference(["node", "harness-doctor", ".", "--no-color"], env);
    expect(hasAnsi(highlighter.info("x"))).toBe(false);
    expect(env.NO_COLOR).toBe("1");
    expect(env.FORCE_COLOR).toBeUndefined();
  });

  it("forces color and sets FORCE_COLOR when --color is present", () => {
    setColorEnabled(false);
    const env: NodeJS.ProcessEnv = { NO_COLOR: "1" };
    applyColorPreference(["node", "harness-doctor", ".", "--color"], env);
    expect(hasAnsi(highlighter.info("x"))).toBe(true);
    expect(env.FORCE_COLOR).toBe("1");
    expect(env.NO_COLOR).toBeUndefined();
  });

  it("leaves color and env untouched when neither flag nor env var is set", () => {
    setColorEnabled(false);
    const env: NodeJS.ProcessEnv = {};
    applyColorPreference(["node", "harness-doctor", "."], env);
    expect(hasAnsi(highlighter.info("x"))).toBe(false);
    expect(env.NO_COLOR).toBeUndefined();
    expect(env.FORCE_COLOR).toBeUndefined();
  });

  it("lets the last flag win when both are passed", () => {
    setColorEnabled(true);
    applyColorPreference(["node", "harness-doctor", "--color", "--no-color"], {});
    expect(hasAnsi(highlighter.info("x"))).toBe(false);
  });

  it("ignores color flags that appear after the -- end-of-options marker", () => {
    setColorEnabled(true);
    applyColorPreference(["node", "harness-doctor", "--", "--no-color"], {});
    expect(hasAnsi(highlighter.info("x"))).toBe(true);
  });

  it("honors HARNESS_DOCTOR_NO_COLOR when no flag is passed", () => {
    setColorEnabled(true);
    applyColorPreference(["node", "harness-doctor", "."], { HARNESS_DOCTOR_NO_COLOR: "1" });
    expect(hasAnsi(highlighter.info("x"))).toBe(false);
  });

  it("honors HARNESS_DOCTOR_FORCE_COLOR when no flag is passed", () => {
    setColorEnabled(false);
    applyColorPreference(["node", "harness-doctor", "."], { HARNESS_DOCTOR_FORCE_COLOR: "1" });
    expect(hasAnsi(highlighter.info("x"))).toBe(true);
  });

  it("lets an explicit flag win over the env var", () => {
    setColorEnabled(false);
    applyColorPreference(["node", "harness-doctor", "--color"], { HARNESS_DOCTOR_NO_COLOR: "1" });
    expect(hasAnsi(highlighter.info("x"))).toBe(true);
  });

  it("treats an empty env value as unset", () => {
    setColorEnabled(true);
    applyColorPreference(["node", "harness-doctor", "."], { HARNESS_DOCTOR_NO_COLOR: "" });
    expect(hasAnsi(highlighter.info("x"))).toBe(true);
  });
});
