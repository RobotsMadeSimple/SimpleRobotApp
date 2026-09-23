import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ExpressionEvaluation, ExpressionSymbols, ProgramVariable } from "@/src/models/robotModels";
import { CommandFailedError, isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";

/**
 * What expression fields inside the builder need from the controller: the symbols
 * an expression may reference (for autocomplete, pickers and the functions sheet)
 * and a way to evaluate one live.
 *
 * Provided once by the builder screen. Fields rendered anywhere else get `null`
 * from useExpressionEnv and simply show none of the extras.
 */
export type ExpressionEnv = {
  /** null until loaded, and for good when the controller lacks GetExpressionSymbols. */
  symbols: ExpressionSymbols | null;
  /** The program's own (editor) variables — they only exist on the robot while it runs. */
  localVariables: ProgramVariable[];
  /** False when the controller lacks EvaluateExpression or is not connected. */
  canEvaluate: boolean;
  /** Evaluate against the program being edited. null = could not ask (offline / unsupported). */
  evaluate: (expression: string) => Promise<ExpressionEvaluation | null>;
};

const Ctx = createContext<ExpressionEnv | null>(null);

export function useExpressionEnv(): ExpressionEnv | null {
  return useContext(Ctx);
}

export function ExpressionEnvProvider({ programName, variables, enabled, children }: {
  /** The saved program to resolve variables against; undefined for a new program. */
  programName?: string;
  variables: ProgramVariable[];
  /** Connected to a controller. */
  enabled: boolean;
  children: ReactNode;
}) {
  const [symbols, setSymbols]             = useState<ExpressionSymbols | null>(null);
  const [symbolsSupported, setSymbolsSup] = useState(true);
  const [evalSupported, setEvalSupported] = useState(true);

  // Refetch when the set of variables changes (names/kinds, not values), debounced
  // so typing a new variable's name does not fire a request per keystroke.
  const variablesKey = useMemo(
    () => variables.map(v => `${v.name}:${v.isString ? "s" : v.isBoolean ? "b" : v.isImage ? "i" : "n"}`).join(","),
    [variables]);
  const firstFetch = useRef(true);

  useEffect(() => {
    if (!enabled || !symbolsSupported) return;
    let live = true;
    const fetchSymbols = async () => {
      try {
        const s = await robotClient.getExpressionSymbols(programName)
          // A program that is not saved yet may be unknown to the controller:
          // fall back to globals, IO and properties.
          .catch(e => {
            if (programName && e instanceof CommandFailedError) return robotClient.getExpressionSymbols();
            throw e;
          });
        if (live) setSymbols(s);
      } catch (e) {
        if (live && isUnsupportedCommand(e)) { setSymbolsSup(false); setSymbols(null); }
      }
    };
    const timer = setTimeout(fetchSymbols, firstFetch.current ? 0 : 800);
    firstFetch.current = false;
    return () => { live = false; clearTimeout(timer); };
  }, [enabled, symbolsSupported, programName, variablesKey]);

  const evaluate = useCallback(async (expression: string): Promise<ExpressionEvaluation | null> => {
    if (!enabled || !evalSupported) return null;
    try {
      return await robotClient.evaluateExpression(expression, programName);
    } catch (e) {
      if (isUnsupportedCommand(e)) setEvalSupported(false);
      return null;
    }
  }, [enabled, evalSupported, programName]);

  const value = useMemo<ExpressionEnv>(() => ({
    symbols: enabled ? symbols : null,
    localVariables: variables,
    canEvaluate: enabled && evalSupported,
    evaluate,
  }), [enabled, symbols, variables, evalSupported, evaluate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
