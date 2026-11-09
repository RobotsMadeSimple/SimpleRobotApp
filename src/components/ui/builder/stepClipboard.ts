import { useSyncExternalStore } from "react";
import { ProgramStep } from "@/src/models/robotModels";
import { mapStepTree } from "@/src/models/stepTree";
import { newId } from "./stepUtils";

// Module-level step clipboard shared across every builder instance. Entering a
// routine pushes a NEW builder screen, so a per-component clipboard is lost when
// you back out. Keeping it here lets a copy made inside a nested routine survive
// navigating back to the parent program (and paste across different programs).
//
// Contents are always fully independent deep copies (the copy/cut actions clone
// before storing), so nothing here shares references with any program's state.

let clipboard: ProgramStep[] = [];
const listeners = new Set<() => void>();

export function getStepClipboard(): ProgramStep[] {
  return clipboard;
}

export function setStepClipboard(steps: ProgramStep[]): void {
  clipboard = steps;
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Reads the shared clipboard and re-renders on change. Returns a [value, set]
 * pair matching useState so callers can drop it in place of a local clipboard.
 */
export function useStepClipboard(): [ProgramStep[], (steps: ProgramStep[]) => void] {
  const value = useSyncExternalStore(subscribe, getStepClipboard, getStepClipboard);
  return [value, setStepClipboard];
}

// ── Copies ────────────────────────────────────────────────────────────────────

/**
 * A fully independent copy of a step (steps are JSON-serialisable — they round-trip through the
 * robot as JSON). The clipboard only ever holds these, so a later edit of the program can never
 * reach into it.
 */
export function detachedCopy(step: ProgramStep): ProgramStep {
  return JSON.parse(JSON.stringify(step));
}

/**
 * A copy of `step` ready to paste: deep-cloned, then fresh ids for it and every step in every
 * body (via stepTree), including else-if branch and switch case ids. Labels keep their labelId so
 * a pasted Go To Label still finds its pasted Label.
 */
export function cloneForPaste(step: ProgramStep): ProgramStep {
  return mapStepTree(detachedCopy(step), s => ({
    ...s,
    id: newId(),
    ...(s.elseIfBranches ? { elseIfBranches: s.elseIfBranches.map(b => ({ ...b, id: newId() })) } : {}),
    ...(s.switchCases    ? { switchCases:    s.switchCases.map(c => ({ ...c, id: newId() })) }    : {}),
  }));
}
