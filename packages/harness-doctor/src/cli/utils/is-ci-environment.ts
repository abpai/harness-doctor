// Narrow on canonical CI signals only — the ones that, on their own, should
// suppress the share URL (noise in CI logs) and mark the run CI-originated for
// the score path. Broader providers in CI_PROVIDER_BY_ENVIRONMENT_VARIABLE only
// label telemetry and otherwise rely on the universal `CI` flag. Does not imply
// `--no-score`.
export const CI_ENVIRONMENT_VARIABLES = ["GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI"] as const;

// CI provider signature env var -> stable label, attached to crash reports as
// `ciProvider`. Order only matters when a runner sets several at once (first
// match wins).
const CI_PROVIDER_BY_ENVIRONMENT_VARIABLE: ReadonlyArray<readonly [string, string]> = [
  ["GITHUB_ACTIONS", "github-actions"],
  ["GITLAB_CI", "gitlab-ci"],
  ["CIRCLECI", "circleci"],
  ["BUILDKITE", "buildkite"],
  ["JENKINS_URL", "jenkins"],
  ["TF_BUILD", "azure-pipelines"],
  ["CODEBUILD_BUILD_ID", "aws-codebuild"],
  ["TEAMCITY_VERSION", "teamcity"],
  ["BITBUCKET_BUILD_NUMBER", "bitbucket"],
  ["TRAVIS", "travis"],
  ["DRONE", "drone"],
];

// Coding-agent runtime marker env var -> stable brand label. Config-only or
// auth vars (e.g. OPENAI_API_KEY, OPENCODE_CONFIG) are intentionally excluded so
// a stored key doesn't read as "running inside an agent". This is the single
// source of truth for branded agent markers; the flat list and the boolean
// detectors below derive from it.
const CODING_AGENT_BY_ENVIRONMENT_VARIABLE: ReadonlyArray<readonly [string, string]> = [
  ["CLAUDECODE", "claude-code"],
  ["CLAUDE_CODE", "claude-code"],
  ["CURSOR_AGENT", "cursor"],
  ["CODEX_CI", "codex"],
  ["CODEX_SANDBOX", "codex"],
  ["CODEX_SANDBOX_NETWORK_DISABLED", "codex"],
  ["OPENCODE", "opencode"],
  ["GOOSE_TERMINAL", "goose"],
  ["AMP_THREAD_ID", "amp"],
];

// Generic "an agent is driving this" markers that signal an agent without
// identifying the brand.
const GENERIC_CODING_AGENT_ENVIRONMENT_VARIABLES = ["AGENT_SESSION_ID", "AGENT_THREAD_ID"] as const;

// Env vars whose *value* (not mere presence) names the agent.
export const CODING_AGENT_ENVIRONMENT_VALUE_VARIABLES = ["AGENT"] as const;

const CODING_AGENT_ENVIRONMENT_VALUES = {
  AGENT: ["amp", "goose"],
} satisfies Record<(typeof CODING_AGENT_ENVIRONMENT_VALUE_VARIABLES)[number], readonly string[]>;

// Every presence-based agent marker (branded + generic), derived so the brand
// map stays the single source of truth. Exposed for tests that clear/set the
// full agent signal surface.
export const CODING_AGENT_ENVIRONMENT_VARIABLES = [
  ...CODING_AGENT_BY_ENVIRONMENT_VARIABLE.map(([environmentVariable]) => environmentVariable),
  ...GENERIC_CODING_AGENT_ENVIRONMENT_VARIABLES,
] as const;

// CI providers set `CI` to "true", "1", or "True"; treat any value that isn't an
// explicit falsy marker as CI so `CI=1` isn't silently ignored.
const FALSY_CI_FLAG_VALUES = new Set(["", "0", "false"]);
const isCiFlagSet = (value: string | undefined): boolean =>
  value !== undefined && !FALSY_CI_FLAG_VALUES.has(value.toLowerCase());

export const isCiEnvironment = (): boolean =>
  CI_ENVIRONMENT_VARIABLES.some((environmentVariable) =>
    Boolean(process.env[environmentVariable]),
  ) || isCiFlagSet(process.env.CI);

// Resolves the CI provider brand for telemetry, falling back to "unknown" for a
// bare `CI` flag. Returns null when there's no CI signal at all.
export const detectCiProvider = (): string | null => {
  for (const [environmentVariable, provider] of CI_PROVIDER_BY_ENVIRONMENT_VARIABLE) {
    if (process.env[environmentVariable]) return provider;
  }
  return isCiFlagSet(process.env.CI) ? "unknown" : null;
};

const detectCodingAgentFromValue = (): string | null => {
  for (const environmentVariable of CODING_AGENT_ENVIRONMENT_VALUE_VARIABLES) {
    const value = process.env[environmentVariable]?.toLowerCase();
    if (value && CODING_AGENT_ENVIRONMENT_VALUES[environmentVariable].includes(value)) return value;
  }
  return null;
};

// Resolves the coding-agent brand for telemetry, or "unknown" for a generic
// agent marker. Returns null when no agent signal is present.
export const detectCodingAgent = (): string | null => {
  for (const [environmentVariable, agent] of CODING_AGENT_BY_ENVIRONMENT_VARIABLE) {
    if (process.env[environmentVariable]) return agent;
  }
  const agentFromValue = detectCodingAgentFromValue();
  if (agentFromValue) return agentFromValue;
  if (
    GENERIC_CODING_AGENT_ENVIRONMENT_VARIABLES.some(
      (environmentVariable) => process.env[environmentVariable],
    )
  ) {
    return "unknown";
  }
  return null;
};

export const isCodingAgentEnvironment = (): boolean => detectCodingAgent() !== null;

export const isCiOrCodingAgentEnvironment = (): boolean =>
  isCiEnvironment() || isCodingAgentEnvironment();
