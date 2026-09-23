import { useEffect, useState } from "react";
import { ExpressionEnv } from "./ExpressionEnv";
import { referencedNames } from "./completions";

export type LiveValue =
  | { kind: "none" }
  | { kind: "value"; text: string }
  | { kind: "error"; text: string }
  /** Cannot be evaluated right now: it uses variables that only exist while the program runs. */
  | { kind: "unavailable" };

/** Errors that mean "this name is not defined right now" rather than a real mistake. */
const RUNTIME_ONLY = /unknown\s*variable|unknownVariable|not\s+(currently\s+)?running|no\s+running/i;

function format(value: number, isBoolean?: boolean): string {
  if (isBoolean) return value !== 0 ? "true" : "false";
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(10)));
}

/**
 * The expression's current value from the controller, re-evaluated 400 ms after it
 * stops changing. The program's own variables only exist on the robot while it
 * runs, so an "unknown variable" error for an expression that uses one reads as
 * "—" (not evaluable now) rather than as a mistake.
 */
export function useLiveValue(env: ExpressionEnv | null, expression: string, active: boolean): LiveValue {
  // The result is stored with the expression it belongs to, so a stale answer
  // (or one for a field that went inactive) is never shown.
  const [result, setResult] = useState<{ expr: string; live: LiveValue } | null>(null);
  const expr = expression.trim();
  // Offline, or a controller without EvaluateExpression: show nothing rather than a dash on every field.
  const enabled = !!env && active && !!expr && env.canEvaluate;

  useEffect(() => {
    if (!env || !enabled) return;
    let current = true;
    const timer = setTimeout(async () => {
      const r = await env.evaluate(expr);
      if (!current) return;
      if (!r) { setResult({ expr, live: { kind: "none" } }); return; }
      if (r.ok && r.value !== undefined) {
        setResult({ expr, live: { kind: "value", text: format(r.value, r.isBoolean) } });
        return;
      }
      const error = r.error ?? "Cannot evaluate";
      const localNames = new Set(env.localVariables.map(v => v.name.toLowerCase()));
      const usesProgramVariable = referencedNames(expr).some(n => localNames.has(n.split(".")[0].toLowerCase()));
      setResult({ expr, live: RUNTIME_ONLY.test(error) && usesProgramVariable
        ? { kind: "unavailable" }
        : { kind: "error", text: error } });
    }, 400);
    return () => { current = false; clearTimeout(timer); };
  }, [env, expr, enabled]);

  return enabled && result?.expr === expr ? result.live : { kind: "none" };
}
