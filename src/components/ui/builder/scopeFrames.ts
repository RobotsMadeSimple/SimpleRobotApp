// Scope frames — which body of a block step the builder is showing or editing — and the step
// lists they point at. Pure (no React / React Native), so scripts/step-edits-check.mts can test it;
// stepUtils re-exports everything here.
import type { ProgramStep } from "@/src/models/robotModels";
import type { StepListRole } from "@/src/models/stepTree";

/**
 * Which body of a block step a scope frame points at. Each kind maps onto one stepTree role, so
 * every body (loop, if / else-if / else, switch case / default, try / catch) is entered, read and
 * written the same way.
 */
export type ScopeKind = 'loop' | 'ifTrue' | 'elseIf' | 'else' | 'switchCase' | 'switchDefault' | 'try' | 'catch';

export type ScopeFrame = {
  kind: ScopeKind;
  stepId: string;
  label: string;
  /** The else-if branch / switch case id, for the branch kinds. */
  branchId?: string;
};

export const SCOPE_ROLE: Record<ScopeKind, StepListRole> = {
  loop: "loopSteps", ifTrue: "ifSteps", elseIf: "elseIfBranches", else: "elseSteps",
  switchCase: "switchCases", switchDefault: "switchDefault", try: "trySteps", catch: "catchSteps",
};

/** The step list a frame points at inside `parent`, or undefined when that body is absent. */
export function bodyOf(parent: ProgramStep, frame: Pick<ScopeFrame, "kind" | "branchId">): ProgramStep[] | undefined {
  switch (frame.kind) {
    case "loop":          return parent.loopSteps;
    case "ifTrue":        return parent.ifSteps;
    case "else":          return parent.elseSteps ?? undefined;
    case "elseIf":        return parent.elseIfBranches?.find(b => b.id === frame.branchId)?.steps;
    case "switchCase":    return parent.switchCases?.find(c => c.id === frame.branchId)?.steps;
    case "switchDefault": return parent.switchDefault;
    case "try":           return parent.trySteps;
    case "catch":         return parent.catchSteps;
  }
}

/** True when the frame's branch (else-if branch / switch case) still exists on `parent`. */
export function frameResolves(parent: ProgramStep, frame: Pick<ScopeFrame, "kind" | "branchId">): boolean {
  if (frame.kind === "elseIf")     return !!parent.elseIfBranches?.some(b => b.id === frame.branchId);
  if (frame.kind === "switchCase") return !!parent.switchCases?.some(c => c.id === frame.branchId);
  return true;
}

/** A copy of `parent` with the frame's body replaced by `steps` (an absent body is created). */
export function withBody(parent: ProgramStep, frame: Pick<ScopeFrame, "kind" | "branchId">, steps: ProgramStep[]): ProgramStep {
  switch (frame.kind) {
    case "loop":          return { ...parent, loopSteps: steps };
    case "ifTrue":        return { ...parent, ifSteps: steps };
    case "else":          return { ...parent, elseSteps: steps };
    case "elseIf":        return { ...parent, elseIfBranches: (parent.elseIfBranches ?? []).map(b => b.id === frame.branchId ? { ...b, steps } : b) };
    case "switchCase":    return { ...parent, switchCases: (parent.switchCases ?? []).map(c => c.id === frame.branchId ? { ...c, steps } : c) };
    case "switchDefault": return { ...parent, switchDefault: steps };
    case "try":           return { ...parent, trySteps: steps };
    case "catch":         return { ...parent, catchSteps: steps };
  }
}

/** A switch case's chip text: its values, or "no value". */
export function caseValuesText(values: string[] | undefined): string {
  const v = (values ?? []).map(x => x.trim()).filter(Boolean);
  return v.length ? v.join(", ") : "no value";
}

/**
 * Every body a block step shows (as a frame without its stepId), in stepTree role order: a Loop's
 * body; If's IF, each ELSE IF and an ELSE when present; each Switch CASE and a DEFAULT when
 * present; Try's TRY and CATCH. Other steps have none (a CNC program's baked steps are not edited
 * here). `loopLabel` names a loop's body (the breadcrumb shows it).
 */
export function blockBodyFrames(step: ProgramStep, loopLabel: (s: ProgramStep) => string = () => "LOOP"): Omit<ScopeFrame, "stepId">[] {
  switch (step.type) {
    case "Loop":
      return [{ kind: "loop", label: loopLabel(step) }];
    case "IfCondition":
      return [
        { kind: "ifTrue", label: "IF" },
        ...(step.elseIfBranches ?? []).map((b, i) => ({ kind: "elseIf" as const, label: `ELSE IF ${i + 1}`, branchId: b.id })),
        ...(step.elseSteps != null ? [{ kind: "else" as const, label: "ELSE" }] : []),
      ];
    case "Switch":
      return [
        ...(step.switchCases ?? []).map(c => ({ kind: "switchCase" as const, label: `CASE ${caseValuesText(c.values)}`, branchId: c.id })),
        ...(step.switchDefault != null ? [{ kind: "switchDefault" as const, label: "DEFAULT" }] : []),
      ];
    case "Try":
      return [{ kind: "try", label: "TRY" }, { kind: "catch", label: "CATCH" }];
    default:
      return [];
  }
}

/** True for the steps that hold other steps (and so can be expanded inline or entered). */
export const isBlockStep = (step: ProgramStep): boolean =>
  step.type === "Loop" || step.type === "IfCondition" || step.type === "Switch" || step.type === "Try";

export function getStepsAtScope(rootSteps: ProgramStep[], stack: ScopeFrame[]): ProgramStep[] {
  let current = rootSteps;
  for (const frame of stack) {
    const parent = current.find(s => s.id === frame.stepId);
    if (!parent) break;
    current = bodyOf(parent, frame) ?? [];
  }
  return current;
}

export function setStepsAtScope(
  rootSteps: ProgramStep[],
  stack: ScopeFrame[],
  newSteps: ProgramStep[]
): ProgramStep[] {
  if (stack.length === 0) return newSteps;
  const [head, ...tail] = stack;
  return rootSteps.map(s => {
    if (s.id !== head.stepId) return s;
    return withBody(s, head, tail.length === 0 ? newSteps : setStepsAtScope(bodyOf(s, head) ?? [], tail, newSteps));
  });
}
