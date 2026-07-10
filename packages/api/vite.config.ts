import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: [
    {
      entry: { index: "./src/index.ts" },
      deps: {
        neverBundle: [
          "@effect/platform-bun",
          "deslop-js",
          "effect",
          "oxc-parser",
          "oxc-resolver",
          "typescript",
        ],
      },
      dts: true,
      target: "esnext",
      platform: "node",
      fixedExtension: false,
    },
  ],
  test: {
    testTimeout: 30_000,
  },
});
