import { useEffect, useMemo, useRef, useState } from "react";
import { BuiltProgram, ProgramStep, ValidationProblem } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";
import { ScopeFrame, stepLabel } from "./stepUtils";

export type ValidationState = {
  /** False once the controller has said it does not know ValidateBuiltProgram. */
  supported: boolean;
  problems: ValidationProblem[];
  errorCount: number;
  warningCount: number;
};

/**
 * Validates the program on the controller whenever it changes, debounced, and once
 * straight away. The program may be unsaved — the controller checks what it is sent.
 *
 * An older controller that does not know the command switches the feature off for
 * the rest of the session; a transport failure keeps the last result.
 */
export function useProgramValidation(program: BuiltProgram, enabled: boolean, delayMs = 500): ValidationState {
  const [supported, setSupported] = useState(true);
  const [problems, setProblems]   = useState<ValidationProblem[]>([]);
  const firstRun = useRef(true);
  const seq      = useRef(0);

  // Only content matters; lastUpdatedUnixMs changes on every render of the builder.
  const key = useMemo(() => JSON.stringify({ ...program, lastUpdatedUnixMs: 0 }), [program]);
  const latest = useRef(program);
  latest.current = program;

  useEffect(() => {
    if (!enabled || !supported) { setProblems([]); return; }
    const id = ++seq.current;
    const timer = setTimeout(() => {
      robotClient.validateBuiltProgram(latest.current)
        .then(result => { if (id === seq.current) setProblems(result); })
        .catch(e => {
          if (id !== seq.current) return;
          if (isUnsupportedCommand(e)) { setSupported(false); setProblems([]); }
        });
    }, firstRun.current ? 0 : delayMs);
    firstRun.current = false;
    return () => clearTimeout(timer);
  }, [key, enabled, supported, delayMs]);

  return useMemo(() => ({
    supported: supported && enabled,
    problems,
    errorCount:   problems.filter(p => p.severity === "error").length,
    warningCount: problems.filter(p => p.severity === "warning").length,
  }), [supported, enabled, problems]);
}

/** Problems on a step itself, and on anything nested inside it (loop body, branches). */
export type StepProblems = { own: ValidationProblem[]; nested: ValidationProblem[] };

function childLists(s: ProgramStep): { frame: Omit<ScopeFrame, "stepId">; steps: ProgramStep[] }[] {
  return [
    { frame: { kind: "loop" as const, label: stepLabel(s) }, steps: s.type === "Loop" ? s.loopSteps ?? [] : [] },
    { frame: { kind: "ifTrue" as const, label: "IF" }, steps: s.ifSteps ?? [] },
    ...(s.elseIfBranches ?? []).map((b, i) => ({
      frame: { kind: "elseIf" as const, label: `ELSE IF ${i + 1}`, branchId: b.id }, steps: b.steps ?? [],
    })),
    { frame: { kind: "else" as const, label: "ELSE" }, steps: s.elseSteps ?? [] },
  ];
}

/** stepId → its problems, with each problem also listed as `nested` on every ancestor. */
export function indexProblems(steps: ProgramStep[], problems: ValidationProblem[]): Map<string, StepProblems> {
  const index = new Map<string, StepProblems>();
  if (problems.length === 0) return index;
  const byStep = new Map<string, ValidationProblem[]>();
  for (const p of problems) {
    if (!p.stepId) continue;
    byStep.set(p.stepId, [...(byStep.get(p.stepId) ?? []), p]);
  }
  const walk = (list: ProgramStep[]): ValidationProblem[] => {
    const all: ValidationProblem[] = [];
    for (const s of list) {
      const own = byStep.get(s.id) ?? [];
      const nested = childLists(s).flatMap(c => walk(c.steps));
      if (own.length || nested.length) index.set(s.id, { own, nested });
      all.push(...own, ...nested);
    }
    return all;
  };
  walk(steps);
  return index;
}

/** Where a step lives: the scope frames leading to its list, and the step itself. */
export function findStepLocation(steps: ProgramStep[], id: string, scope: ScopeFrame[] = []):
  { scope: ScopeFrame[]; step: ProgramStep } | null {
  for (const s of steps) {
    if (s.id === id) return { scope, step: s };
    for (const c of childLists(s)) {
      const found = findStepLocation(c.steps, id, [...scope, { ...c.frame, stepId: s.id }]);
      if (found) return found;
    }
  }
  return null;
}
