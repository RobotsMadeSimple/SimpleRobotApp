import {
  PluginOutputType,
  PluginParamDef,
  PluginStepContribution,
  ProgramStep,
  ProgramVariable,
  isListVariable,
  isPointListVariable,
} from "@/src/models/robotModels";

// Pure helpers for the `Plugin` step (docs/plugins.md §6): defaults, the text
// form of each param type, local checks for the config form, and summaries for
// the step row. No React, no controller calls.

/** Manifest default → the param's text, or undefined when there is none. */
export function paramDefaultText(def: PluginParamDef): string | undefined {
  const d = def.default;
  if (d === undefined || d === null) return undefined;
  if (typeof d === "boolean") return d ? "true" : "false";
  if (typeof d === "number" || typeof d === "string") return String(d);
  return undefined;
}

/** pluginParams for a freshly added step: every param that has a default, as text. */
export function defaultPluginParams(c: PluginStepContribution): Record<string, string> {
  const params: Record<string, string> = {};
  for (const p of c.step.params ?? []) {
    const text = paramDefaultText(p);
    if (text !== undefined && text !== "") params[p.key] = text;
  }
  return params;
}

/** A new Plugin step for one (plugin, step) tile. */
export function pluginStepFields(c: PluginStepContribution): Partial<ProgramStep> {
  return {
    pluginId: c.pluginId,
    pluginStepId: c.step.id,
    pluginParams: defaultPluginParams(c),
    pluginOutputs: [],
    pluginTimeoutMs: undefined,
  };
}

/** The text that applies to a param: the step's own, else the manifest default. */
export function effectiveParamText(step: ProgramStep, def: PluginParamDef): string {
  const own = step.pluginParams?.[def.key];
  if (own !== undefined && own.trim() !== "") return own;
  return paramDefaultText(def) ?? "";
}

export type ParamIssue = { key: string; code: "pluginParamMissing" | "pluginParamEnum"; message: string };

/**
 * The same checks ValidateBuiltProgram makes for params (pluginParamMissing,
 * pluginParamEnum), so the form can flag them as the user types.
 */
export function paramIssues(step: ProgramStep, c: PluginStepContribution | undefined): ParamIssue[] {
  if (!c) return [];
  const issues: ParamIssue[] = [];
  for (const def of c.step.params ?? []) {
    const text = effectiveParamText(step, def).trim();
    if (def.required && text === "") {
      issues.push({ key: def.key, code: "pluginParamMissing", message: `${def.label || def.key} is required` });
    } else if (def.type === "enum" && text !== "" && !(def.options ?? []).includes(text)) {
      issues.push({ key: def.key, code: "pluginParamEnum", message: `"${text}" is not one of ${(def.options ?? []).join(", ")}` });
    }
  }
  return issues;
}

/** Boolean param text that a switch can show; anything else is an expression. */
export function booleanLiteral(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (t === "true" || t === "1") return true;
  if (t === "false" || t === "0" || t === "") return false;
  return null;
}

// ── Point params ─────────────────────────────────────────────────────────────
//
// A point param's text is one of (§6): a saved point name; a grid or stack
// reference; or an expression such as `$pts[$i]` / `{$prefix}{$i}`. Moves keep
// grid/stack targets as structured fields, which a text param cannot, so the
// references are spelled:
//
//   grid:<grid name>[<row>, <col>]    row/column, each a number or expression
//   grid:<grid name>[<index>]         grid index
//   stack:<stack name>[<index>]       stack slot
//
// (the app's proposal for the "grid/stack ref syntax" the contract leaves open).

export type PointRef =
  | { mode: "point"; name: string }
  | { mode: "grid"; grid: string; row: string; col: string; index?: undefined }
  | { mode: "grid"; grid: string; index: string; row?: undefined; col?: undefined }
  | { mode: "stack"; stack: string; index: string }
  | { mode: "expr"; text: string };

/** Split on the top-level comma of a bracket body ("$i + 1, max($j, 2)" → two parts). */
function splitTopLevelComma(body: string): string[] {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) return [body.slice(0, i), body.slice(i + 1)];
  }
  return [body];
}

export function parsePointRef(text: string): PointRef {
  const t = text.trim();
  const ref = /^(grid|stack):([^[\]]+)\[(.*)\]$/i.exec(t);
  if (ref) {
    const kind = ref[1].toLowerCase();
    const name = ref[2].trim();
    const parts = splitTopLevelComma(ref[3]).map(p => p.trim());
    if (kind === "stack") return { mode: "stack", stack: name, index: parts[0] ?? "" };
    if (parts.length === 2) return { mode: "grid", grid: name, row: parts[0], col: parts[1] };
    return { mode: "grid", grid: name, index: parts[0] ?? "" };
  }
  if (t === "" || !/[${}[\]]/.test(t)) return { mode: "point", name: t };
  return { mode: "expr", text: t };
}

export function formatPointRef(ref: PointRef): string {
  switch (ref.mode) {
    case "point": return ref.name;
    case "expr":  return ref.text;
    case "stack": return `stack:${ref.stack}[${ref.index || "0"}]`;
    case "grid":
      return ref.index !== undefined
        ? `grid:${ref.grid}[${ref.index || "0"}]`
        : `grid:${ref.grid}[${ref.row || "0"}, ${ref.col || "0"}]`;
  }
}

// ── Variable kinds ───────────────────────────────────────────────────────────

/** Variables a param of type list / image / variable may name. */
export function paramVariableFilter(type: "list" | "image" | "variable"): (v: ProgramVariable) => boolean {
  switch (type) {
    case "list":     return v => isListVariable(v);
    case "image":    return v => v.isImage === true;
    case "variable": return () => true;
  }
}

/** Variables an output of this type can be written into (computed variables are filtered separately). */
export function outputVariableFilter(type: PluginOutputType): (v: ProgramVariable) => boolean {
  const scalar = (v: ProgramVariable) => !isListVariable(v) && !v.isString && !v.isImage && !v.isStopwatch;
  switch (type) {
    case "number":
    case "boolean": return scalar;
    case "string":  return v => v.isString === true;
    case "point":   return v => isPointListVariable(v);
    case "list":    return v => isListVariable(v);
    case "image":   return v => v.isImage === true;
  }
}

/** The variable type the "New" button pre-selects for an output. */
export function outputNewVarType(type: PluginOutputType): "number" | "boolean" | "string" | "list" | "image" {
  switch (type) {
    case "number":  return "number";
    case "boolean": return "boolean";
    case "string":  return "string";
    case "point":
    case "list":    return "list";
    case "image":   return "image";
  }
}

/** One line under the output picker saying what the variable must be. */
export function outputKindHint(type: PluginOutputType): string {
  switch (type) {
    case "number":  return "Number or boolean variable";
    case "boolean": return "Boolean or number variable (written as 0/1)";
    case "string":  return "String variable";
    case "point":   return "Points list variable — replaced by a one-element list, read as $var[0].x";
    case "list":    return "List variable — numbers, points or records";
    case "image":   return "Image variable";
  }
}

// ── Summaries ────────────────────────────────────────────────────────────────

/** `name=value` pairs for the step row, shortest first-come, declared params only when known. */
export function paramsSummary(step: ProgramStep, c: PluginStepContribution | undefined, max = 3): string | null {
  const own = step.pluginParams ?? {};
  const keys = c ? (c.step.params ?? []).map(p => p.key).filter(k => (own[k] ?? "").trim() !== "")
                 : Object.keys(own).filter(k => (own[k] ?? "").trim() !== "");
  if (keys.length === 0) return null;
  const parts = keys.slice(0, max).map(k => {
    const v = own[k].trim();
    return `${k}=${v.length > 18 ? v.slice(0, 17) + "…" : v}`;
  });
  if (keys.length > max) parts.push(`+${keys.length - max}`);
  return parts.join("  ·  ");
}

export function outputsSummary(step: ProgramStep): string | null {
  const outs = (step.pluginOutputs ?? []).filter(o => o.variableName);
  if (outs.length === 0) return null;
  return outs.map(o => `${o.key} → $${o.variableName}`).join("  ·  ");
}
