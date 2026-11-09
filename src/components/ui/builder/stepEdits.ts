import type { ProgramStep } from "@/src/models/robotModels";
import { mapStepTree, walkSteps } from "@/src/models/stepTree";
import { ScopeFrame, blockBodyFrames as bodyFrames, bodyOf, getStepsAtScope, isBlockStep, setStepsAtScope, withBody } from "./scopeFrames";

// Pure edits on a program's step tree, addressed by step id or by scope (the frames leading to a
// step list). The builder edits through these so a step can be changed, removed or moved wherever
// it sits — in the list on screen or in a body shown inline below its block.

/** Same list: the same frames (parent step, body kind and branch) in the same order. */
export function sameScope(a: ScopeFrame[], b: ScopeFrame[]): boolean {
  return a.length === b.length && a.every((f, i) =>
    f.stepId === b[i].stepId && f.kind === b[i].kind && (f.branchId ?? "") === (b[i].branchId ?? ""));
}

/** The tree with the step of `updated.id` replaced (wherever it is). */
export function replaceStepById(steps: ProgramStep[], updated: ProgramStep): ProgramStep[] {
  let hit = false;
  const next = steps.map(root => mapStepTree(root, s => {
    if (s.id !== updated.id) return s;
    hit = true;
    return updated;
  }));
  return hit ? next : steps;
}

/** The tree with `fn` applied to every step whose id is in `ids`. */
export function mapStepsById(steps: ProgramStep[], ids: ReadonlySet<string>, fn: (s: ProgramStep) => ProgramStep): ProgramStep[] {
  return steps.map(root => mapStepTree(root, s => (ids.has(s.id) ? fn(s) : s)));
}

/** The tree without the steps whose ids are in `ids` (with everything inside them). */
export function removeStepsById(steps: ProgramStep[], ids: ReadonlySet<string>): ProgramStep[] {
  const prune = (list: ProgramStep[]): ProgramStep[] => list
    .filter(s => !ids.has(s.id))
    .map(s => {
      if (!isBlockStep(s)) return s;
      let out = s;
      for (const f of bodyFrames(s)) {
        const body = bodyOf(out, f);
        if (body) out = withBody(out, f, prune(body));
      }
      return out;
    });
  return prune(steps);
}

/** Where a step lives: its list's scope (from the program root) and its index in that list. */
export function locateStep(steps: ProgramStep[], id: string, scope: ScopeFrame[] = []): { scope: ScopeFrame[]; index: number; step: ProgramStep } | null {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.id === id) return { scope, index: i, step: s };
    for (const f of bodyFrames(s)) {
      const found = locateStep(bodyOf(s, f) ?? [], id, [...scope, { ...f, stepId: s.id }]);
      if (found) return found;
    }
  }
  return null;
}

/** Insert `items` into the list at `scope`, before `index` (past the end appends). */
export function insertAt(steps: ProgramStep[], scope: ScopeFrame[], index: number, items: ProgramStep[]): ProgramStep[] {
  const list = getStepsAtScope(steps, scope);
  const at = Math.max(0, Math.min(index, list.length));
  return setStepsAtScope(steps, scope, [...list.slice(0, at), ...items, ...list.slice(at)]);
}

export type MoveRefusal = "intoItself" | "loopControlOutsideLoop";

/** Why a step may not go to `dest`, or null when it may. */
export function moveRefusal(step: ProgramStep, dest: ScopeFrame[]): MoveRefusal | null {
  if (dest.some(f => f.stepId === step.id)) return "intoItself";
  if (step.type === "LoopControl" && !dest.some(f => f.kind === "loop")) return "loopControlOutsideLoop";
  return null;
}

/**
 * Move the step at (`from`, `fromIndex`) so it lands before `toIndex` in the list at `to`
 * (an index in the destination list as it is before the move). Unchanged when the source is gone.
 */
export function moveStep(steps: ProgramStep[], from: ScopeFrame[], fromIndex: number, to: ScopeFrame[], toIndex: number): ProgramStep[] {
  const src = getStepsAtScope(steps, from);
  const item = src[fromIndex];
  if (!item) return steps;
  const removed = setStepsAtScope(steps, from, src.filter((_, i) => i !== fromIndex));
  const at = sameScope(from, to) && fromIndex < toIndex ? toIndex - 1 : toIndex;
  return insertAt(removed, to, at, [item]);
}

/**
 * The selected steps that are not inside another selected step, in program order — what a copy,
 * cut or delete of a selection acts on.
 */
export function topSelected(steps: ProgramStep[], ids: ReadonlySet<string>): ProgramStep[] {
  const out: ProgramStep[] = [];
  const skip = new Set<string>();
  for (const { step } of walkSteps(steps)) {
    if (skip.has(step.id)) continue;
    if (ids.has(step.id)) {
      out.push(step);
      for (const inner of walkSteps([step])) skip.add(inner.step.id);
    }
  }
  return out;
}

/** Every step id in the tree, for pruning stale breakpoints and search hits. */
export const allStepIds = (steps: ProgramStep[]): string[] => [...walkSteps(steps)].map(x => x.step.id);
