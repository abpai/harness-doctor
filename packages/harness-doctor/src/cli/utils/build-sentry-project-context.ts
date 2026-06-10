import type { ProjectInfo } from "@harness-doctor/core";

export interface SentryProjectContext {
  // Low-cardinality, searchable signals (framework, TypeScript)
  // namespaced under `project.*` so they don't collide with run-context tags.
  readonly tags: Record<string, string | number | boolean | null>;
  // Full project snapshot for the event's "project" context block.
  readonly context: Record<string, unknown>;
}

/**
 * Projects the {@link ProjectInfo} we already detect during a scan into the
 * Sentry scope shape: a handful of searchable `project.*` tags plus the
 * anonymous project *shape* as a `project` context block. Lets crash/transaction
 * triage answer "which kind of project hit this?" (framework, TypeScript,
 * size) without sending source code — and deliberately omits `projectName`
 * and `rootDirectory`, the two identifying fields, so the project can't be
 * tied back to a specific company/repo.
 */
export const buildSentryProjectContext = (projectInfo: ProjectInfo): SentryProjectContext => ({
  tags: {
    "project.framework": projectInfo.framework,
    "project.typescript": projectInfo.hasTypeScript,
  },
  context: {
    framework: projectInfo.framework,
    hasTypeScript: projectInfo.hasTypeScript,
    sourceFileCount: projectInfo.sourceFileCount,
  },
});

// The project being scanned in the current run, captured as soon as it's
// discovered (the `beforeScan` hook). Held at module scope so the lazy,
// capture-time `buildSentryScope()` can fold it into error events even though
// they're funneled through a generic handler that has no `ProjectInfo` in hand
// — mirroring how the run context is rebuilt lazily at capture time.
let currentProjectInfo: ProjectInfo | null = null;

export const setSentryProjectInfo = (projectInfo: ProjectInfo | null): void => {
  currentProjectInfo = projectInfo;
};

export const getSentryProjectInfo = (): ProjectInfo | null => currentProjectInfo;
