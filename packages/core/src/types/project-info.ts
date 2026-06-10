export type Framework =
  | "nextjs"
  | "vite"
  | "cra"
  | "remix"
  | "gatsby"
  | "expo"
  | "react-native"
  | "tanstack-start"
  | "preact"
  | "unknown";

export interface ProjectInfo {
  rootDirectory: string;
  projectName: string;
  /**
   * Best-effort framework label, used purely as score / display metadata
   * (e.g. "Detected Next.js project"). Harness Doctor's checks are
   * framework-agnostic — nothing gates on this value.
   */
  framework: Framework;
  hasTypeScript: boolean;
  sourceFileCount: number;
}

export interface PackageJson {
  name?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  /**
   * npm's dependency-pin map. Keys are package names; values are version
   * strings or nested override objects, hence `unknown`.
   */
  overrides?: Record<string, unknown>;
  /** Yarn / pnpm equivalent of npm `overrides`. */
  resolutions?: Record<string, string>;
  /** pnpm's settings block; `pnpm.overrides` mirrors npm `overrides`. */
  pnpm?: { overrides?: Record<string, string> };
  workspaces?:
    | string[]
    | {
        packages?: string[];
        catalog?: Record<string, string>;
        catalogs?: Record<string, Record<string, string>>;
      };
  catalog?: unknown;
  catalogs?: unknown;
}

export interface WorkspacePackage {
  name: string;
  directory: string;
}
