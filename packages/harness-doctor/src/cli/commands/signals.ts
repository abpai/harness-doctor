import path from "node:path";
import { discoverSignalsMenu, resolveScanTarget } from "@harness-doctor/core";

interface SignalsActionOptions {
  readonly jsonCompact?: boolean;
}

export const signalsAction = async (
  directory: string,
  options: SignalsActionOptions = {},
): Promise<void> => {
  const requestedDirectory = path.resolve(directory);
  const scanTarget = await resolveScanTarget(requestedDirectory, { allowAmbiguous: true });
  const signals = discoverSignalsMenu(scanTarget.resolvedDirectory);
  process.stdout.write(`${JSON.stringify(signals, null, options.jsonCompact ? 0 : 2)}\n`);
};
