export const warnConfigIssue = (message: string): void => {
  process.stderr.write(`[harness-doctor] ${message}\n`);
};
