// HACK: most rules in harness-doctor's curated set encode "you wouldn't
// want this in production code" — but tests intentionally exercise
// bad patterns to lock in regression coverage (an array-index key in a
// test fixture, a giant fixture component, a `forwardRef` to verify
// ref forwarding). Surface-level path matching is enough to catch the
// near-universal test conventions: `.test.*` / `.spec.*` suffix, or
// living under a `__tests__` / `tests` / `test` directory.
//
// We use a single combined regex against the forward-slash relative
// path so the match is allocation-free per diagnostic.
const TEST_FILE_DIRECTORY_PATTERN =
  /(?:^|\/)(?:__tests__|__test__|tests|test|__mocks__|cypress|e2e|playwright)\//;
const TEST_FILE_SUFFIX_PATTERN =
  /\.(?:test|spec|stories|story|fixture|fixtures)\.(?:[cm]?[jt]sx?)$/;

// "Source root" markers — once a path contains `/src/`, `/app/`,
// `/lib/`, `/pages/`, etc., everything BELOW that is production code
// regardless of how the project is laid out above. Critical for test
// fixture projects (`tests/fixtures/<proj>/src/...`) so the FIXTURE
// source files don't get auto-suppressed just because the outer wrap
// happens to have `/tests/` or `/fixtures/` in the path.
//
// We only strip when a `/fixtures/` (or `/__fixtures__/`) segment is
// present, because that's the unambiguous signal of "fixture project —
// the inner source root is the real production code under lint".
// For regular layouts like `tests/app/setup.ts` or `e2e/components/
// helpers.ts`, the `app` / `components` segment is just a sub-folder
// of the test directory, NOT a real source root, so stripping would
// incorrectly drop the `tests/` / `e2e/` prefix and the file would
// no longer be detected as a test.
const FIXTURE_PROJECT_PATTERN = /\/(?:fixtures|__fixtures__)\//;
const SOURCE_ROOT_PATTERN =
  /\/(?:src|app|lib|components|pages|features|modules|packages|apps|frontend|client)\//g;

const stripAboveSourceRoot = (relativePath: string): string => {
  const fixtureMatch = FIXTURE_PROJECT_PATTERN.exec(relativePath);
  if (fixtureMatch === null) return relativePath;
  let lastIdx = -1;
  for (const match of relativePath.matchAll(SOURCE_ROOT_PATTERN)) {
    if (match.index !== undefined && match.index > lastIdx) lastIdx = match.index;
  }
  if (lastIdx >= 0) return relativePath.slice(lastIdx);
  // No inner source-root marker — strip up through the fixture segment
  // so the outer `tests/` / `e2e/` prefix can't re-trigger the test
  // heuristic on fixture production files like
  // `tests/fixtures/my-app/Component.tsx`. The fixture itself is the
  // unit under test; its contents are production-shaped code.
  return relativePath.slice(fixtureMatch.index + fixtureMatch[0].length - 1);
};

export const isTestFilePath = (relativePath: string): boolean => {
  if (relativePath.length === 0) return false;
  const forwardSlashed = relativePath.replaceAll("\\", "/");
  // The SUFFIX check (.test/.spec/.stories etc.) is on the FULL path —
  // unambiguous regardless of context.
  if (TEST_FILE_SUFFIX_PATTERN.test(forwardSlashed)) return true;
  // The DIRECTORY check (`tests/`, `__tests__/`, `cypress/`, etc.)
  // scopes to the source-root-below path so that fixture-project
  // source files don't get falsely auto-suppressed.
  const scoped = stripAboveSourceRoot(forwardSlashed);
  return TEST_FILE_DIRECTORY_PATTERN.test(scoped);
};
