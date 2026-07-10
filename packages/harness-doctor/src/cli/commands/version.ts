import { VERSION } from "../utils/version.js";

export const buildVersionString = (): string =>
  `harness-doctor/${VERSION} ${process.platform}-${process.arch} bun-${process.versions.bun}`;

export const versionAction = (): void => {
  process.stdout.write(`${buildVersionString()}\n`);
};
