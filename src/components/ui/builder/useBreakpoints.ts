import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Breakpoints per program (controller docs/program-language.md §7.3): a set of step ids the
// program pauses BEFORE. Kept in memory and in local storage (per device — breakpoints are a
// debugging aid, not part of the program), passed with ExecuteBuiltProgram and pushed live with
// SetBreakpoints. Step ids are stable, so a breakpoint survives edits and the Blocks/Text switch;
// ids that no longer exist in the program are simply never hit (prune with `retain`).
//
// Module-level so the builder, the text view's gutter and the monitor share one set.

const STORAGE_PREFIX = "rms.breakpoints.";
const EMPTY: ReadonlySet<string> = new Set();

const sets = new Map<string, ReadonlySet<string>>();
const loaded = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function persist(programId: string, ids: ReadonlySet<string>) {
  const key = STORAGE_PREFIX + programId;
  const write = ids.size === 0 ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, JSON.stringify([...ids]));
  write.catch(() => { /* storage unavailable — memory still holds them */ });
}

/** Load a program's breakpoints from storage once (memory wins if it was set first). */
function ensureLoaded(programId: string) {
  if (!programId || loaded.has(programId)) return;
  loaded.add(programId);
  AsyncStorage.getItem(STORAGE_PREFIX + programId)
    .then(raw => {
      if (!raw || sets.has(programId)) return;
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) {
        sets.set(programId, new Set(ids.filter((x): x is string => typeof x === "string")));
        emit();
      }
    })
    .catch(() => { /* unreadable — start empty */ });
}

/** A program's breakpoints (plain read, usable outside React). */
export function getBreakpoints(programId: string): ReadonlySet<string> {
  return sets.get(programId) ?? EMPTY;
}

/** Replace a program's breakpoints. */
export function setBreakpointsFor(programId: string, ids: Iterable<string>) {
  if (!programId) return;
  const next = new Set(ids);
  sets.set(programId, next);
  loaded.add(programId);
  persist(programId, next);
  emit();
}

export type BreakpointsView = {
  /** The current set (stable identity until it changes). */
  ids: ReadonlySet<string>;
  /** As an array, for ExecuteBuiltProgram / SetBreakpoints. */
  list: string[];
  has: (stepId: string) => boolean;
  toggle: (stepId: string) => void;
  set: (stepId: string, on: boolean) => void;
  clear: () => void;
  /** Drop ids not in `existing` (steps deleted from the program). */
  retain: (existing: Iterable<string>) => void;
};

/**
 * The breakpoints of `programId` (the program's stable id). An empty id (an unsaved program)
 * gives an inert, empty set.
 */
export function useBreakpoints(programId: string | undefined): BreakpointsView {
  const id = programId ?? "";
  useEffect(() => { ensureLoaded(id); }, [id]);
  const getSnap = useCallback(() => (id ? getBreakpoints(id) : EMPTY), [id]);
  const ids = useSyncExternalStore(subscribe, getSnap, getSnap);

  return useMemo<BreakpointsView>(() => {
    const update = (fn: (s: Set<string>) => void) => {
      if (!id) return;
      const next = new Set(getBreakpoints(id));
      fn(next);
      setBreakpointsFor(id, next);
    };
    return {
      ids,
      list: [...ids],
      has: stepId => ids.has(stepId),
      toggle: stepId => update(s => { if (s.has(stepId)) s.delete(stepId); else s.add(stepId); }),
      set: (stepId, on) => update(s => { if (on) s.add(stepId); else s.delete(stepId); }),
      clear: () => update(s => s.clear()),
      retain: existing => {
        const keep = new Set(existing);
        if ([...ids].every(x => keep.has(x))) return;
        update(s => { for (const x of [...s]) if (!keep.has(x)) s.delete(x); });
      },
    };
  }, [id, ids]);
}
