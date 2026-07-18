import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Diagnostic, HarnessDoctorConfig } from "./types/index.js";
import { DEAD_CODE_WORKER_TIMEOUT_MS, MILLISECONDS_PER_SECOND } from "./constants.js";
import { toRelativePath } from "./utils/to-relative-path.js";

export const DEAD_CODE_PLUGIN = "knip";
export const DEAD_CODE_CATEGORY = "Maintainability";

interface CheckDeadCodeOptions {
  readonly rootDirectory: string;
  /** Retained for the public check API; filtering happens in the diagnostic pipeline. */
  readonly userConfig?: HarnessDoctorConfig | null;
  readonly knipCliPath?: string;
  readonly resolveKnipCliPath?: () => string;
  readonly createWorker?: DeadCodeWorkerFactory;
  readonly workerTimeoutMs?: number;
}

interface DeadCodeWorkerInput {
  readonly rootDirectory: string;
  readonly knipCliPath: string;
}

interface DeadCodeWorkerHandle {
  readonly result: Promise<unknown>;
  readonly terminate?: () => void | Promise<unknown>;
}

interface DeadCodeWorkerFactory {
  (input: DeadCodeWorkerInput): DeadCodeWorkerHandle;
}

interface KnipNamedItem {
  readonly name: string;
  readonly line?: number;
  readonly col?: number;
}

interface KnipIssue {
  readonly file: string;
  readonly files?: ReadonlyArray<KnipNamedItem>;
  readonly exports?: ReadonlyArray<KnipNamedItem>;
  readonly types?: ReadonlyArray<KnipNamedItem>;
  readonly dependencies?: ReadonlyArray<KnipNamedItem>;
  readonly devDependencies?: ReadonlyArray<KnipNamedItem>;
  readonly cycles?: ReadonlyArray<ReadonlyArray<KnipNamedItem>>;
}

interface KnipJsonReport {
  readonly issues: ReadonlyArray<KnipIssue>;
}

const DEAD_CODE_HEURISTIC_CAVEAT =
  "Dead-code analysis is heuristic; dynamically loaded files or fixtures may be false positives.";

const withDeadCodeCaveat = (help: string): string => `${help} ${DEAD_CODE_HEURISTIC_CAVEAT}`;

const toRelativeFilePath = (rootDirectory: string, filePath: string): string => {
  const relative = toRelativePath(filePath, rootDirectory);
  return relative.length > 0 ? relative : filePath.replace(/\\/g, "/");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseString = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new Error(`Knip returned invalid ${label}.`);
  return value;
};

const parseOptionalNumber = (value: unknown, label: string): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw new Error(`Knip returned invalid ${label}.`);
  return value;
};

const parseNamedItem = (value: unknown, label: string): KnipNamedItem => {
  if (!isRecord(value)) throw new Error(`Knip returned invalid ${label}.`);
  return {
    name: parseString(value.name, `${label}.name`),
    ...(value.line === undefined ? {} : { line: parseOptionalNumber(value.line, `${label}.line`) }),
    ...(value.col === undefined ? {} : { col: parseOptionalNumber(value.col, `${label}.col`) }),
  };
};

const parseNamedItems = (value: unknown, label: string): KnipNamedItem[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Knip returned invalid ${label}.`);
  return value.map((entry, index) => parseNamedItem(entry, `${label}[${index}]`));
};

const parseCycles = (value: unknown, label: string): KnipNamedItem[][] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Knip returned invalid ${label}.`);
  return value.map((cycle, cycleIndex) => {
    if (!Array.isArray(cycle)) throw new Error(`Knip returned invalid ${label}[${cycleIndex}].`);
    return cycle.map((entry, itemIndex) =>
      parseNamedItem(entry, `${label}[${cycleIndex}][${itemIndex}]`),
    );
  });
};

const parseKnipReport = (value: unknown): KnipJsonReport => {
  if (!isRecord(value) || !Array.isArray(value.issues)) {
    throw new Error("Knip returned an invalid JSON report.");
  }
  return {
    issues: value.issues.map((issue, index) => {
      if (!isRecord(issue)) throw new Error(`Knip returned invalid issues[${index}].`);
      return {
        file: parseString(issue.file, `issues[${index}].file`),
        files: parseNamedItems(issue.files, `issues[${index}].files`),
        exports: parseNamedItems(issue.exports, `issues[${index}].exports`),
        types: parseNamedItems(issue.types, `issues[${index}].types`),
        dependencies: parseNamedItems(issue.dependencies, `issues[${index}].dependencies`),
        devDependencies: parseNamedItems(issue.devDependencies, `issues[${index}].devDependencies`),
        cycles: parseCycles(issue.cycles, `issues[${index}].cycles`),
      };
    }),
  };
};

const resolveDefaultKnipCliPath = (): string => {
  // HACK: `import.meta.resolve` fails on Bun for Windows when a dependency is in an
  // isolated package-manager store. `createRequire` follows the package's
  // normal Node resolution path from this module under Bun and Node alike.
  const modulePath = createRequire(import.meta.url).resolve("knip");
  return path.join(path.dirname(path.dirname(modulePath)), "bin", "knip.js");
};

const formatKnipFailure = (exitCode: number | null, stderr: string): Error =>
  new Error(
    `Knip exited with code ${exitCode ?? "null"}${stderr.length > 0 ? `: ${stderr}` : ""}.`,
  );

const parseKnipOutput = (stdout: string): unknown => {
  const [jsonReport] = stdout.split(/\r?\n/);
  return JSON.parse(jsonReport);
};

const createDeadCodeWorker: DeadCodeWorkerFactory = (input) => {
  // Knip is invoked as a CLI subprocess rather than through its internal API.
  // That preserves its repository-owned config discovery and keeps an aborted
  // analysis from taking down the host process.
  const child = spawn(
    process.execPath,
    [
      input.knipCliPath,
      "--reporter",
      "json",
      // Knip's JSON reporter deliberately omits configuration hints. Its
      // symbols reporter writes them to stderr after JSON; parse only the
      // first stdout line and forward that stderr below.
      "--reporter",
      "symbols",
      "--no-progress",
      "--no-exit-code",
      "--include",
      "files,exports,types,dependencies,cycles",
    ],
    {
      cwd: input.rootDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  let didSettle = false;
  const result = new Promise<unknown>((resolve, reject) => {
    const settle = (callback: () => void): void => {
      if (didSettle) return;
      didSettle = true;
      callback();
    };

    child.once("error", (error) => settle(() => reject(error)));
    child.once("close", (exitCode) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (exitCode !== 0) {
        settle(() => reject(formatKnipFailure(exitCode, stderr)));
        return;
      }
      if (stdout.length === 0) {
        settle(() => reject(formatKnipFailure(exitCode, stderr)));
        return;
      }
      try {
        const parsed = parseKnipOutput(stdout);
        if (stderr.length > 0) process.stderr.write(`${stderr}\n`);
        settle(() => resolve(parsed));
      } catch (error) {
        settle(() => reject(error));
      }
    });
  });

  return {
    result,
    terminate: () => {
      didSettle = true;
      child.kill("SIGKILL");
    },
  };
};

const runDeadCodeWorkerWithTimeout = (
  handle: DeadCodeWorkerHandle,
  timeoutMs: number,
): Promise<unknown> =>
  new Promise<unknown>((resolve, reject) => {
    let didSettle = false;
    const timeoutHandle = setTimeout(() => {
      if (didSettle) return;
      didSettle = true;
      void handle.terminate?.();
      reject(
        new Error(`Dead-code worker timed out after ${timeoutMs / MILLISECONDS_PER_SECOND}s.`),
      );
    }, timeoutMs);
    timeoutHandle.unref?.();

    handle.result.then(
      (value) => {
        if (didSettle) return;
        didSettle = true;
        clearTimeout(timeoutHandle);
        void handle.terminate?.();
        resolve(value);
      },
      (error: unknown) => {
        if (didSettle) return;
        didSettle = true;
        clearTimeout(timeoutHandle);
        void handle.terminate?.();
        reject(error);
      },
    );
  });

export const checkDeadCode = async (options: CheckDeadCodeOptions): Promise<Diagnostic[]> => {
  const rootDirectory = path.resolve(options.rootDirectory);
  if (!fs.existsSync(path.join(rootDirectory, "package.json"))) return [];

  const workerHandle = (options.createWorker ?? createDeadCodeWorker)({
    rootDirectory,
    knipCliPath: options.knipCliPath ?? (options.resolveKnipCliPath ?? resolveDefaultKnipCliPath)(),
  });
  const rawResult = await runDeadCodeWorkerWithTimeout(
    workerHandle,
    options.workerTimeoutMs ?? DEAD_CODE_WORKER_TIMEOUT_MS,
  );
  const report = parseKnipReport(rawResult);
  const toRelative = (filePath: string): string => toRelativeFilePath(rootDirectory, filePath);
  const diagnostics: Diagnostic[] = [];

  for (const issue of report.issues) {
    for (const unusedFile of issue.files ?? []) {
      diagnostics.push({
        filePath: toRelative(unusedFile.name),
        plugin: DEAD_CODE_PLUGIN,
        rule: "unused-file",
        severity: "warning",
        message: "Unused file — not reachable from any entry point",
        help: withDeadCodeCaveat(
          "Delete the file if it is truly unreachable, or import it from an entry point.",
        ),
        line: 0,
        column: 0,
        category: DEAD_CODE_CATEGORY,
      });
    }

    for (const unusedExport of issue.exports ?? []) {
      diagnostics.push({
        filePath: toRelative(issue.file),
        plugin: DEAD_CODE_PLUGIN,
        rule: "unused-export",
        severity: "warning",
        message: `Unused export: \`${unusedExport.name}\``,
        help: withDeadCodeCaveat(
          "Drop the `export` keyword (or remove the declaration) if no other module uses this symbol.",
        ),
        line: unusedExport.line ?? 0,
        column: unusedExport.col ?? 0,
        category: DEAD_CODE_CATEGORY,
      });
    }

    for (const unusedType of issue.types ?? []) {
      diagnostics.push({
        filePath: toRelative(issue.file),
        plugin: DEAD_CODE_PLUGIN,
        rule: "unused-type",
        severity: "warning",
        message: `Unused type export: \`${unusedType.name}\``,
        help: withDeadCodeCaveat(
          "Drop the `export` keyword (or remove the declaration) if no other module uses this symbol.",
        ),
        line: unusedType.line ?? 0,
        column: unusedType.col ?? 0,
        category: DEAD_CODE_CATEGORY,
      });
    }

    for (const unusedDependency of issue.dependencies ?? []) {
      diagnostics.push({
        filePath: toRelative(issue.file),
        plugin: DEAD_CODE_PLUGIN,
        rule: "unused-dependency",
        severity: "warning",
        message: `Unused dependency: \`${unusedDependency.name}\``,
        help: withDeadCodeCaveat(
          "Remove the dependency from package.json if it is genuinely unused.",
        ),
        line: 0,
        column: 0,
        category: DEAD_CODE_CATEGORY,
      });
    }

    for (const unusedDependency of issue.devDependencies ?? []) {
      diagnostics.push({
        filePath: toRelative(issue.file),
        plugin: DEAD_CODE_PLUGIN,
        rule: "unused-dev-dependency",
        severity: "warning",
        message: `Unused devDependency: \`${unusedDependency.name}\``,
        help: withDeadCodeCaveat(
          "Remove the dependency from package.json if it is genuinely unused.",
        ),
        line: 0,
        column: 0,
        category: DEAD_CODE_CATEGORY,
      });
    }

    for (const cycle of issue.cycles ?? []) {
      if (cycle.length === 0) continue;
      const files = cycle.map((entry) => entry.name);
      diagnostics.push({
        filePath: toRelative(files[0]),
        plugin: DEAD_CODE_PLUGIN,
        rule: "circular-dependency",
        severity: "warning",
        message: `Circular import cycle: ${files.map(toRelative).join(" → ")}`,
        help: withDeadCodeCaveat(
          "Break the cycle by extracting the shared code into a third module that both files import.",
        ),
        line: 0,
        column: 0,
        category: DEAD_CODE_CATEGORY,
      });
    }
  }

  return diagnostics;
};
