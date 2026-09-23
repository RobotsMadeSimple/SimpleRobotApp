import { useCallback, useEffect, useRef, useState } from "react";

import {
  CalibrationDetectOptions,
  CalibrationRobotPoint,
  CalibrationSession,
  CalibrationSolveResult,
  CalibrationTaughtDot,
} from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { CalibrationProblem, explainCalibrationError } from "./calibrationErrors";
import { invalidateCameraCalibration } from "./useCameraCalibration";

export type CalibrationBusy = "detect" | "teach" | "solve" | "predict" | null;

/**
 * One calibration session on the controller (docs/camera-calibration.md), from the
 * first detection to the solve. The session is discarded when the wizard unmounts —
 * leaving early, or after Done — so the controller never holds an orphan (a saved
 * calibration is unaffected by the discard).
 */
export function useCalibrationSession(cameraId: string) {
  const [session, setSession] = useState<CalibrationSession | null>(null);
  const [taught, setTaught]   = useState<CalibrationTaughtDot[]>([]);
  const [solved, setSolved]   = useState<CalibrationSolveResult | null>(null);
  const [saved, setSaved]     = useState(false);
  const [busy, setBusy]       = useState<CalibrationBusy>(null);
  const [problem, setProblem] = useState<CalibrationProblem | null>(null);
  /** Bumped on each detection so the annotated image URL is re-fetched. */
  const [frame, setFrame]     = useState(0);

  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => () => {
    const id = sessionIdRef.current;
    if (id) robotClient.calibrationDiscard(id).catch(() => {});
  }, []);

  /** Run an action with busy/problem bookkeeping. Resolves undefined on failure. */
  const run = useCallback(async <T,>(kind: CalibrationBusy, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(kind);
    setProblem(null);
    try {
      return await fn();
    } catch (e) {
      setProblem(explainCalibrationError(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);

  /** First detection opens the session; later ones re-detect within it. */
  const detect = useCallback((dotPitchMm: number, options: CalibrationDetectOptions) =>
    run("detect", async () => {
      const current = sessionIdRef.current;
      const next = current
        ? await robotClient.calibrationRedetect(current, options)
        : await robotClient.calibrationStart(cameraId, dotPitchMm, options);
      sessionIdRef.current = next.sessionId;
      setSession(next);
      setFrame(f => f + 1);
      setTaught(prev => keptTaught(prev, next));
      setSolved(null);
      return next;
    }), [cameraId, run]);

  /** Drop the session (e.g. the pitch changed, which only CalibrationStart takes). */
  const restart = useCallback(() => {
    const id = sessionIdRef.current;
    if (id) robotClient.calibrationDiscard(id).catch(() => {});
    sessionIdRef.current = null;
    setSession(null);
    setTaught([]);
    setSolved(null);
    setSaved(false);
    setProblem(null);
  }, []);

  const teach = useCallback((dotIndex: number) => run("teach", async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    setTaught(await robotClient.calibrationTeachDot(id, dotIndex));
    setSolved(null);
  }), [run]);

  const unteach = useCallback((dotIndex: number) => run("teach", async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    setTaught(await robotClient.calibrationUnteachDot(id, dotIndex));
    setSolved(null);
  }), [run]);

  const solve = useCallback((save: boolean) => run("solve", async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    const result = await robotClient.calibrationSolve(id, save);
    setSolved(result);
    setSaved(save);
    if (save) invalidateCameraCalibration(cameraId);
    return result;
  }), [cameraId, run]);

  /** Saved calibration when there is one, else the solved-but-unsaved session. */
  const predict = useCallback((u: number, v: number) => run("predict", async (): Promise<CalibrationRobotPoint | undefined> => {
    const id = sessionIdRef.current;
    const source = saved || !id ? { cameraId } : { sessionId: id };
    return robotClient.calibrationPredict(source, u, v);
  }), [cameraId, run, saved]);

  const clearProblem = useCallback(() => setProblem(null), []);

  return {
    session, taught, solved, saved, busy, problem, frame,
    detect, restart, teach, unteach, solve, predict, clearProblem,
  };
}

/**
 * Taught dots after a re-detect. The controller keeps the ones whose index still
 * matches; when its reply carries the list, that is the truth. Otherwise keep the
 * local entries whose grid index (i, j) is still detected, re-pointed at the new dot.
 */
function keptTaught(prev: CalibrationTaughtDot[], next: CalibrationSession): CalibrationTaughtDot[] {
  if (next.taught) return next.taught;
  return prev.flatMap(t => {
    const dot = next.dots.find(d => d.i === t.i && d.j === t.j);
    return dot ? [{ ...t, dotIndex: dot.index }] : [];
  });
}
