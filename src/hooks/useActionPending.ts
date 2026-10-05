import { useEffect, useState } from "react";

import type { ProgramSummary } from "@/src/models/robotModels";

/**
 * Spinner state for a program action button (Start / Stop / Run Again …).
 *
 * `setPending(label)` when the button is pressed. It clears when the action is
 * seen to have taken effect, or after a fallback timeout so a lost ack never
 * leaves the button stuck. "Taken effect" means any of:
 *  - the program's status changed;
 *  - the program was (re)started — `lastStartedUnixMs` changes on every start.
 *    A short program can start AND finish between two status polls (a single
 *    move whose target is already reached completes in ~50 ms), in which case
 *    status reads "Complete" before and after and never changes;
 *  - any caller-supplied extra signal changed (e.g. a background program's
 *    running flag).
 *
 * Shared by the program list card and the program monitor page so both react
 * the same way.
 */
export function useActionPending(
  program: ProgramSummary | null | undefined,
  extraSignal?: unknown,
  fallbackMs = 3000,
): [string | null, (label: string | null) => void] {
  const [pending, setPending] = useState<string | null>(null);

  const status      = program?.status;
  const lastStarted = program?.lastStartedUnixMs;
  useEffect(() => { setPending(null); }, [status, lastStarted, extraSignal]);

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), fallbackMs);
    return () => clearTimeout(t);
  }, [pending, fallbackMs]);

  return [pending, setPending];
}
