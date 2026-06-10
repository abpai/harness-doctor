export interface Diagnostic {
  filePath: string;
  plugin: string;
  rule: string;
  severity: "error" | "warning";
  // Short human headline for the rule (e.g. "Spec contract missing").
  // Optional — renderers fall back to the `plugin/rule` id when absent.
  title?: string;
  message: string;
  help: string;
  url?: string;
  line: number;
  column: number;
  category: string;
  suppressionHint?: string;
}

export interface CleanedDiagnostic {
  message: string;
  help: string;
}
