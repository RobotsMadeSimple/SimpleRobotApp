import { BuiltProgram, ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { ScopeFrame, newId } from "./stepUtils";

/**
 * Everything the program builder lets the user edit, as one immutable value so the
 * undo history and the unsaved-changes check both work on a single object.
 */
export type EditorDoc = {
  name: string;
  description: string;
  steps: ProgramStep[];
  variables: ProgramVariable[];
  isRoutine: boolean;
  isBackground: boolean;
  killBackgroundOnStop: boolean;
};

export const EMPTY_DOC: EditorDoc = {
  name: "",
  description: "",
  steps: [],
  variables: [],
  isRoutine: false,
  isBackground: false,
  killBackgroundOnStop: true,
};

/** Assign fresh ids to any steps that lost theirs during a server round-trip. */
export function rehydrateIds(src: ProgramStep[]): ProgramStep[] {
  return src.map(s => ({
    ...s,
    id: s.id || newId(),
    loopSteps:      s.loopSteps      ? rehydrateIds(s.loopSteps)      : s.loopSteps,
    ifSteps:        s.ifSteps        ? rehydrateIds(s.ifSteps)        : s.ifSteps,
    elseSteps:      s.elseSteps      ? rehydrateIds(s.elseSteps)      : s.elseSteps,
    elseIfBranches: s.elseIfBranches ? s.elseIfBranches.map(b => ({ ...b, id: b.id || newId(), steps: rehydrateIds(b.steps) })) : s.elseIfBranches,
  }));
}

/** The editable document for a stored program. */
export function docFromProgram(p: BuiltProgram, overrides?: Partial<EditorDoc>): EditorDoc {
  return {
    name:                 p.name,
    description:          p.description ?? "",
    steps:                rehydrateIds(p.steps ?? []),
    variables:            p.variables ?? [],
    isRoutine:            p.isRoutine ?? false,
    isBackground:         p.isBackground ?? false,
    killBackgroundOnStop: p.killBackgroundOnStop ?? true,
    ...overrides,
  };
}

/** The program to save (or validate) for a document. */
export function programFromDoc(d: EditorDoc, id: string | undefined, lastUpdatedUnixMs: number): BuiltProgram {
  return {
    id,
    name: d.name.trim(),
    description: d.description.trim(),
    steps: d.steps,
    variables: d.variables.length > 0 ? d.variables : undefined,
    lastUpdatedUnixMs,
    isRoutine: d.isRoutine,
    isBackground: d.isBackground || undefined,
    killBackgroundOnStop: (!d.isRoutine && !d.isBackground) ? (d.killBackgroundOnStop || undefined) : undefined,
  };
}

/**
 * Comparable form of a document for the unsaved-changes check. Name and description
 * are trimmed because that is how they are saved.
 */
export function docSnapshot(d: EditorDoc): string {
  return JSON.stringify({ ...d, name: d.name.trim(), description: d.description.trim() });
}

/**
 * How many frames of a scope stack still resolve in `steps`. After an undo removes
 * the block the user is inside, the stack is cut back to the part that still exists.
 */
export function validScopeDepth(steps: ProgramStep[], stack: ScopeFrame[]): number {
  let current = steps;
  for (let i = 0; i < stack.length; i++) {
    const frame = stack[i];
    const parent = current.find(s => s.id === frame.stepId);
    if (!parent) return i;
    // A branch list that is still absent is fine (the first step added creates it);
    // only a missing parent step or else-if branch means the scope is gone.
    if (frame.kind === "elseIf") {
      const branch = parent.elseIfBranches?.find(b => b.id === frame.branchId);
      if (!branch) return i;
      current = branch.steps ?? [];
    } else {
      current = (frame.kind === "loop" ? parent.loopSteps
        : frame.kind === "ifTrue" ? parent.ifSteps
        : parent.elseSteps) ?? [];
    }
  }
  return stack.length;
}
