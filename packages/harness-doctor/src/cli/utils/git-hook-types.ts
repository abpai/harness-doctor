export enum GitHookKind {
  Configured = "configured",
  Ghooks = "ghooks",
  Git = "git",
  GitHooksJs = "git-hooks-js",
  Husky = "husky",
  Lefthook = "lefthook",
  Overcommit = "overcommit",
  PreCommit = "pre-commit",
  PreCommitNpm = "pre-commit-npm",
  PrettyQuick = "pretty-quick",
  SimpleGitHooks = "simple-git-hooks",
  VitePlus = "vite-plus",
  Yorkie = "yorkie",
}

export interface GitHookTarget {
  readonly hookPath: string;
  readonly runnerRoot: string;
  readonly kind: GitHookKind;
  readonly hooksPathConfig?: string;
}

export interface InstallGitHookOptions {
  readonly hookPath: string;
  readonly projectRoot: string;
  readonly kind?: GitHookKind;
  readonly hooksPathConfig?: string;
}

export interface InstallGitHookResult {
  readonly hookPath: string;
  readonly kind: GitHookKind;
  readonly status: "created" | "updated";
}
