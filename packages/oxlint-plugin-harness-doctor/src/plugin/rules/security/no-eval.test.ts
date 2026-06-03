import { describe, expect, it } from "vite-plus/test";
import { runRule } from "../../../test-utils/run-rule.js";
import { noEval } from "./no-eval.js";

describe("no-eval", () => {
  it("flags a direct eval() call", () => {
    const result = runRule(noEval, `eval("doThing()");`);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("eval()");
  });

  it("flags setTimeout with a string body", () => {
    const result = runRule(noEval, `setTimeout("doThing()", 0);`);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("setTimeout");
  });

  it("flags setInterval with a string body", () => {
    const result = runRule(noEval, `setInterval("doThing()", 0);`);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("setInterval");
  });

  it("flags new Function() built from strings", () => {
    const result = runRule(noEval, `const fn = new Function("a", "return a");`);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("new Function()");
  });

  it("does NOT flag JSON.parse", () => {
    const result = runRule(noEval, `const data = JSON.parse(input);`);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("does NOT flag a plain function call", () => {
    const result = runRule(noEval, `doThing("a", "b");`);
    expect(result.diagnostics).toHaveLength(0);
  });

  it("does NOT flag setTimeout with a function argument", () => {
    const result = runRule(noEval, `setTimeout(() => doThing(), 0);`);
    expect(result.diagnostics).toHaveLength(0);
  });
});
