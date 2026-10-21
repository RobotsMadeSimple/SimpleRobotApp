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

// Fields whose value is exactly a variable name (no `$`): renamed by exact, case-insensitive match.
const BARE_NAME_KEYS = new Set<string>([
  "variableName", "varPointName",
  "stopwatchVariableName", "waitTimeoutVariableName",
  "forEachVariableName", "forEachValueVariableName", "forEachIndexVariableName",
  "captureImageVariableName", "imageVar", "listVar",
]);

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
      if (typeof v === "string") {
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
