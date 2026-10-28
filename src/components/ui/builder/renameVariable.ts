import { ProgramStep, ProgramVariable } from "@/src/models/robotModels";

// ── Variable rename-refactor ──────────────────────────────────────────────────
//
// Variables are referenced two ways in a program:
//   1. As `$name` symbols embedded in free-form expression/template strings — `$count + 1`,
//      `{$total}`, `$pts[$i]`, condition operands, computed-variable formulas, status messages, etc.
//   2. As a bare name (no `$`) stored in dedicated fields — SetVariable's target, forEach outputs,
//      plugin/JSON output mappings, stopwatch/timeout targets, image/list variables.
//
// Because the name IS the symbol in the expression language, a rename must rewrite every reference
// (like an IDE's "rename symbol") rather than store an id inside the expression text. This module
// does that over the whole step tree + the variables list, so renaming never orphans a reference.
//
// Matching is case-insensitive because variable names are case-insensitive at runtime (the controller
// keys variable maps with OrdinalIgnoreCase). The `$name` rewrite only ever touches a whole
// `$identifier` token, so running it over an unrelated string is a safe no-op.
//
// The walk visits every nested array and object (child step lists, condition items, vision output
// rows, pluginOutputs rows, exportColumns / jsonInbound / jsonOutbound rows), so a bare-name key is
// matched wherever it appears in the tree — `pluginOutputs[i].variableName` is reached through the
// same `variableName` entry as SetVariable's target.
//
// `pluginParams` is the one map whose KEYS are the plugin's own param names, not ours: a list /
// image / variable param stores the bare variable name as its VALUE. So inside pluginParams a value
// equal to the old name (case-insensitive, `$` and surrounding whitespace ignored) is rewritten
// whole, and any other value is treated as an expression/template like every other string.

// Fields whose value is exactly a variable name (no `$`): renamed by exact, case-insensitive match.
const BARE_NAME_KEYS = new Set<string>([
  // SetVariable / ReadLoadCell / HttpRequest+HttpReceive inbound rows / plugin output rows
  "variableName", "varPointName",
  "stopwatchVariableName", "waitTimeoutVariableName",
  "forEachVariableName", "forEachValueVariableName", "forEachIndexVariableName",
  "captureImageVariableName", "imageVar", "listVar",
  // Move stop sub-page, StartRecording, RunVision zone override
  "moveStopPositionVariableName", "moveStopFlagVariableName",
  "recordVariableName", "visionZoneVar",
  // RunVision output rows: blob, color, polygon, ArUco, line, barcode
  "detectedVar", "countVar", "pointsVar",
  "coverageVar", "passedVar", "cellsVar", "cellsPassedVar",
  "foundVar", "angleVar", "centerXVar", "centerYVar",
  "firstIdVar", "firstCenterXVar", "firstCenterYVar",
  "firstAngleVar", "firstX1Var", "firstY1Var", "firstX2Var", "firstY2Var",
  "firstValueVar", "firstFormatVar",
]);

/** The bare name a list/image/variable plugin param stores, or the text as typed otherwise. */
function renameParamValue(text: string, oldName: string, newName: string): string {
  const bare = text.trim().replace(/^\$/, "");
  if (bare.toLowerCase() === oldName.toLowerCase()) return newName;
  return renameRefsInExpr(text, oldName, newName);
}

/** Rewrite whole `$old`, `$old.prop`, `$old[idx]` tokens to `$new` (case-insensitive on the name). */
export function renameRefsInExpr(expr: string, oldName: string, newName: string): string {
  if (!expr || expr.indexOf("$") < 0) return expr;
  const lc = oldName.toLowerCase();
  // `[A-Za-z_]\w*` stops at `.`/`[`, so only the base identifier is matched; a longer name like
  // `$countTotal` won't match `$count`.
  return expr.replace(/\$([A-Za-z_]\w*)/g, (m, id: string) => (id.toLowerCase() === lc ? "$" + newName : m));
}

// Recursively rewrite every string in a node: bare-name fields by exact match, everything else as an
// expression/template. Arrays and nested objects (child step lists, condition items, output mappings)
// are walked automatically, so no field path needs to be enumerated.
function walk<T>(node: T, oldName: string, newName: string): T {
  if (Array.isArray(node)) return node.map(x => walk(x, oldName, newName)) as unknown as T;
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "pluginParams" && v && typeof v === "object" && !Array.isArray(v)) {
        const params: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          params[pk] = typeof pv === "string" ? renameParamValue(pv, oldName, newName) : pv;
        }
        out[k] = params;
      } else if (typeof v === "string") {
        out[k] = BARE_NAME_KEYS.has(k)
          ? (v.toLowerCase() === oldName.toLowerCase() ? newName : v)
          : renameRefsInExpr(v, oldName, newName);
      } else {
        out[k] = walk(v, oldName, newName);
      }
    }
    return out as T;
  }
  return node;
}

/** A new step tree with every reference to `oldName` rewritten to `newName`. */
export function renameVariableInSteps(steps: ProgramStep[], oldName: string, newName: string): ProgramStep[] {
  if (!oldName || oldName === newName) return steps;
  return steps.map(s => walk(s, oldName, newName));
}

/**
 * New variables with cross-references rewritten (e.g. a computed variable's `valueExpression` that
 * reads the renamed one). Each variable's own `name` holds no `$` so it is left untouched here — the
 * caller sets the renamed variable's new name explicitly.
 */
export function renameVariableInVariables(vars: ProgramVariable[], oldName: string, newName: string): ProgramVariable[] {
  if (!oldName || oldName === newName) return vars;
  return vars.map(v => walk(v, oldName, newName));
}
