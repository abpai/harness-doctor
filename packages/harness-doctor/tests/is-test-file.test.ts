import { describe, expect, it } from "vite-plus/test";
import { isTestFilePath } from "@harness-doctor/core";

describe("isTestFilePath", () => {
  it("recognizes `.test.*` and `.spec.*` suffixes across JS/TS variants", () => {
    expect(isTestFilePath("src/utils/foo.test.ts")).toBe(true);
    expect(isTestFilePath("src/utils/foo.test.tsx")).toBe(true);
    expect(isTestFilePath("src/utils/foo.spec.js")).toBe(true);
    expect(isTestFilePath("src/utils/foo.spec.jsx")).toBe(true);
    expect(isTestFilePath("src/utils/foo.test.mjs")).toBe(true);
    expect(isTestFilePath("src/utils/foo.test.cjs")).toBe(true);
    expect(isTestFilePath("src/utils/foo.spec.mts")).toBe(true);
    expect(isTestFilePath("src/utils/foo.spec.cts")).toBe(true);
  });

  it("recognizes Storybook and fixture file conventions", () => {
    expect(isTestFilePath("src/components/Button.stories.tsx")).toBe(true);
    expect(isTestFilePath("src/components/Button.story.tsx")).toBe(true);
    expect(isTestFilePath("src/components/Button.fixture.tsx")).toBe(true);
    expect(isTestFilePath("src/components/Button.fixtures.tsx")).toBe(true);
  });

  it("recognizes test directories at any depth", () => {
    expect(isTestFilePath("src/utils/__tests__/foo.ts")).toBe(true);
    expect(isTestFilePath("src/utils/__test__/foo.ts")).toBe(true);
    expect(isTestFilePath("tests/integration/run.ts")).toBe(true);
    expect(isTestFilePath("test/snapshot/render.ts")).toBe(true);
    expect(isTestFilePath("packages/ui/__mocks__/react.ts")).toBe(true);
    expect(isTestFilePath("cypress/e2e/login.cy.ts")).toBe(true);
    expect(isTestFilePath("e2e/checkout.ts")).toBe(true);
    expect(isTestFilePath("playwright/auth.ts")).toBe(true);
  });

  it("normalizes Windows-style backslashes", () => {
    expect(isTestFilePath("src\\utils\\__tests__\\foo.ts")).toBe(true);
    expect(isTestFilePath("src\\Button.test.tsx")).toBe(true);
  });

  it("does NOT match production source files", () => {
    expect(isTestFilePath("src/utils/foo.ts")).toBe(false);
    expect(isTestFilePath("src/components/Button.tsx")).toBe(false);
    expect(isTestFilePath("packages/ui/src/index.ts")).toBe(false);
    expect(isTestFilePath("README.md")).toBe(false);
  });

  it("recognizes test helpers nested under source-root-named sub-folders", () => {
    // Names like `app`, `components`, `pages` are common as ORGANISING
    // sub-folders inside a test directory — strip-to-source-root must
    // not drop the outer test prefix and mis-classify the helper as
    // production code.
    expect(isTestFilePath("tests/app/setup.ts")).toBe(true);
    expect(isTestFilePath("tests/components/helpers.ts")).toBe(true);
    expect(isTestFilePath("tests/pages/render.ts")).toBe(true);
    expect(isTestFilePath("e2e/components/helpers.ts")).toBe(true);
    expect(isTestFilePath("cypress/pages/login.ts")).toBe(true);
    expect(isTestFilePath("playwright/app/auth.ts")).toBe(true);
  });

  it("does NOT match fixture-project source files under `fixtures/`", () => {
    // `tests/fixtures/<proj>/src/...` is a fixture project — the inner
    // `src/` is the real production code being linted, so it must NOT
    // be auto-suppressed by the outer `tests/` segment.
    expect(isTestFilePath("tests/fixtures/sample/src/Button.tsx")).toBe(false);
    expect(isTestFilePath("tests/fixtures/sample/app/page.tsx")).toBe(false);
    expect(isTestFilePath("tests/__fixtures__/repo/lib/util.ts")).toBe(false);
    expect(isTestFilePath("fixtures/proj/src/index.ts")).toBe(false);
  });

  it("does NOT match fixture-project files WITHOUT an inner source-root segment", () => {
    // Same intent as the previous case, but for flatter fixture layouts
    // where the inner project doesn't have a `src/` / `app/` / `lib/`
    // wrapper. The outer `tests/` prefix must not re-trigger the
    // directory heuristic on these production-shaped fixture files.
    expect(isTestFilePath("tests/fixtures/sample/Button.tsx")).toBe(false);
    expect(isTestFilePath("tests/fixtures/my-app/Component.tsx")).toBe(false);
    expect(isTestFilePath("tests/__fixtures__/repo/Component.tsx")).toBe(false);
    expect(isTestFilePath("e2e/fixtures/widget/index.tsx")).toBe(false);
  });

  it("does NOT match files that merely contain `test` as a substring", () => {
    expect(isTestFilePath("src/contestants/list.tsx")).toBe(false);
    expect(isTestFilePath("src/protest/Banner.tsx")).toBe(false);
    expect(isTestFilePath("src/testing-utils.ts")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isTestFilePath("")).toBe(false);
  });
});
