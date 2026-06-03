import type * as Console from "effect/Console";

/**
 * A concrete `Console.Console` whose methods are all no-ops.
 *
 * Used by `--silent` (provided via
 * `Effect.provideService(Console.Console, makeNoopConsole())`) and by
 * `enableJsonMode` (assigned over the relevant slots on
 * `globalThis.console` so imperative legacy callsites that aren't
 * Effect-typed also fall silent). Sourcing both from a single concrete
 * object keeps "what is a no-op console" answered in one place; the
 * earlier `new Proxy({} as Console.Console, { get: () => () => undefined })`
 * combined a cast with a Proxy to do the same thing implicitly.
 *
 * The interface mirrors Effect v4's `Console.Console` shape exactly so
 * `Effect.provideService(Console.Console, makeNoopConsole())` requires
 * no cast.
 */
export const makeNoopConsole = (): Console.Console => ({
  assert: () => {},
  clear: () => {},
  count: () => {},
  countReset: () => {},
  debug: () => {},
  dir: () => {},
  dirxml: () => {},
  error: () => {},
  group: () => {},
  groupCollapsed: () => {},
  groupEnd: () => {},
  info: () => {},
  log: () => {},
  table: () => {},
  time: () => {},
  timeEnd: () => {},
  timeLog: () => {},
  trace: () => {},
  warn: () => {},
});
