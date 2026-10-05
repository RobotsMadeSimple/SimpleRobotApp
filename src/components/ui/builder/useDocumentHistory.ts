import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Undo/redo for an immutable document.
 *
 * Every edit goes through `commit`, which pushes the previous document onto the
 * undo stack (bounded to `limit` entries) and clears the redo stack. Two kinds of
 * commits collapse into one entry so undo steps match what the user did:
 *
 * - Commits made in the same tick. One user action that calls several setters
 *   (e.g. a switch that flips two flags) is one undo.
 * - Commits that share a `coalesceKey` within `coalesceMs` of each other, used for
 *   typing into a text field so each keystroke is not its own undo.
 *
 * `reset` replaces the document and forgets the history (loading a program).
 */
export type DocumentHistory<T> = {
  doc: T;
  commit: (next: T | ((prev: T) => T), opts?: { coalesceKey?: string }) => void;
  reset: (doc: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Coalesce key and time of the last commit, to merge typing into one entry. */
  lastKey?: string;
  lastAt: number;
  /** Tick that created the newest entry, so later commits in that tick merge into it. */
  lastTick: number;
};

export function useDocumentHistory<T>(
  initial: T | (() => T),
  { limit = 100, coalesceMs = 1000 }: { limit?: number; coalesceMs?: number } = {},
): DocumentHistory<T> {
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === "function" ? (initial as () => T)() : initial,
    future: [],
    lastAt: 0,
    lastTick: -1,
  }));

  // Ticks are numbered so commits made in the same one can be recognised: the
  // counter moves on once per tick, when the first commit of that tick arrives.
  const tick = useRef({ id: 0, open: false });

  const commit = useCallback((next: T | ((prev: T) => T), opts?: { coalesceKey?: string }) => {
    if (!tick.current.open) {
      tick.current = { id: tick.current.id + 1, open: true };
      Promise.resolve().then(() => { tick.current = { ...tick.current, open: false }; });
    }
    const tickId = tick.current.id;
    const now = Date.now();
    const key = opts?.coalesceKey;

    setState(s => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(s.present) : next;
      if (Object.is(value, s.present)) return s;
      const merge = s.lastTick === tickId
        || (key !== undefined && key === s.lastKey && now - s.lastAt < coalesceMs);
      // Merging with nothing to merge into (the first edit) still has to record an entry.
      if (merge && s.past.length > 0) {
        return { ...s, present: value, future: [], lastKey: key ?? s.lastKey, lastAt: now, lastTick: tickId };
      }
      const past = [...s.past, s.present];
      if (past.length > limit) past.splice(0, past.length - limit);
      return { past, present: value, future: [], lastKey: key, lastAt: now, lastTick: tickId };
    });
  }, [limit, coalesceMs]);

  const reset = useCallback((doc: T) => {
    setState({ past: [], present: doc, future: [], lastAt: 0, lastTick: -1 });
  }, []);

  const undo = useCallback(() => {
    setState(s => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future], lastAt: 0, lastTick: -1 };
    });
  }, []);

  const redo = useCallback(() => {
    setState(s => {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest, lastAt: 0, lastTick: -1 };
    });
  }, []);

  return useMemo(() => ({
    doc: state.present,
    commit,
    reset,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }), [state, commit, reset, undo, redo]);
}
