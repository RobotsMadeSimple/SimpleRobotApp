// The one place in the app that knows which ProgramStep fields hold nested step lists — the
// mirror of the controller's Models/StepTree.cs (docs/program-language.md §4.1 #4). Paste (fresh
// ids), rename, the clipboard, validation indexing and scope navigation walk programs through
// here, so a new block body is added once.
import type { ProgramStep } from "./robotModels";

/** The body roles, in the order `childLists` yields them (frozen: stepPaths use it). */
export const STEP_LIST_ROLES = [
  "loopSteps", "ifSteps", "elseIfBranches", "elseSteps", "switchCases", "switchDefault",
  "trySteps", "catchSteps", "cncProgramSteps",
] as const;

export type StepListRole = (typeof STEP_LIST_ROLES)[number];

/** One nested step list of a step. Branch roles (elseIfBranches, switchCases) carry their index. */
export type StepChildList = {
  role: StepListRole;
  /** Branch index for elseIfBranches / switchCases; undefined otherwise. */
  index?: number;
  /** The branch's own id (else-if branch or switch case), when it has one. */
  branchId?: string;
  steps: ProgramStep[];
  /** The stepPath segment: "loopSteps", "elseIfBranches[1].steps", "switchCases[0].steps". */
  path: string;
};

/**
 * Every present nested step list of `step`, in STEP_LIST_ROLES order.
 * @param executableOnly skip legacy baked `cncProgramSteps` when the step has a `cncSpec`.
 */
export function childLists(step: ProgramStep, executableOnly = false): StepChildList[] {
  const out: StepChildList[] = [];
  const plain = (role: StepListRole, steps: ProgramStep[] | undefined) => {
    if (steps) out.push({ role, steps, path: role });
  };
  plain("loopSteps", step.loopSteps);
  plain("ifSteps", step.ifSteps);
  step.elseIfBranches?.forEach((b, index) => {
    if (b?.steps) out.push({ role: "elseIfBranches", index, branchId: b.id, steps: b.steps, path: `elseIfBranches[${index}].steps` });
  });
  plain("elseSteps", step.elseSteps);
  step.switchCases?.forEach((c, index) => {
    if (c?.steps) out.push({ role: "switchCases", index, branchId: c.id, steps: c.steps, path: `switchCases[${index}].steps` });
  });
  plain("switchDefault", step.switchDefault);
  plain("trySteps", step.trySteps);
  plain("catchSteps", step.catchSteps);
  if (step.cncProgramSteps && !(executableOnly && step.cncSpec)) plain("cncProgramSteps", step.cncProgramSteps);
  return out;
}

/** True when the step has any nested body (present, even if empty). */
export const hasChildLists = (step: ProgramStep): boolean => childLists(step).length > 0;

/**
 * Every step in `steps` and below, pre-order (parent before its bodies), with its stepPath
 * ("steps[2].switchCases[0].steps[1]"). Routine bodies are not followed.
 */
export function* walkSteps(
  steps: ProgramStep[] | undefined,
  opts: { enabledOnly?: boolean; root?: string } = {},
): Generator<{ step: ProgramStep; path: string; depth: number }> {
  function* go(list: ProgramStep[] | undefined, root: string, depth: number):
    Generator<{ step: ProgramStep; path: string; depth: number }> {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const step = list[i];
      if (!step) continue;
      if (opts.enabledOnly && step.enabled === false) continue;
      const path = `${root}[${i}]`;
      yield { step, path, depth };
      for (const child of childLists(step)) yield* go(child.steps, `${path}.${child.path}`, depth + 1);
    }
  }
  yield* go(steps, opts.root ?? "steps", 0);
}

/** Every step in the tree, flattened pre-order. */
export const flattenSteps = (steps: ProgramStep[] | undefined): ProgramStep[] =>
  [...walkSteps(steps)].map(x => x.step);

/** The step with this id anywhere in the tree, or undefined. */
export function findStep(steps: ProgramStep[] | undefined, id: string): ProgramStep | undefined {
  for (const { step } of walkSteps(steps)) if (step.id === id) return step;
  return undefined;
}

/**
 * A copy of `step` with `mapStep` applied to it and, recursively, to every step in its nested
 * lists (branch objects are copied, their ids kept). Used to deep-transform a tree immutably
 * (fresh ids on paste, renames, enable/disable of a subtree).
 */
export function mapStepTree(
  step: ProgramStep,
  mapStep: (s: ProgramStep) => ProgramStep,
): ProgramStep {
  const s = mapStep(step);
  const list = (l: ProgramStep[] | undefined) => l?.map(c => mapStepTree(c, mapStep));
  const next: ProgramStep = { ...s };
  if (s.loopSteps) next.loopSteps = list(s.loopSteps);
  if (s.ifSteps) next.ifSteps = list(s.ifSteps);
  if (s.elseIfBranches) next.elseIfBranches = s.elseIfBranches.map(b => ({ ...b, steps: list(b.steps) ?? [] }));
  if (s.elseSteps) next.elseSteps = list(s.elseSteps);
  if (s.switchCases) next.switchCases = s.switchCases.map(c => ({ ...c, steps: list(c.steps) ?? [] }));
  if (s.switchDefault) next.switchDefault = list(s.switchDefault);
  if (s.trySteps) next.trySteps = list(s.trySteps);
  if (s.catchSteps) next.catchSteps = list(s.catchSteps);
  if (s.cncProgramSteps) next.cncProgramSteps = list(s.cncProgramSteps);
  return next;
}
