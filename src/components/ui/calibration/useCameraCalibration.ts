import { useEffect, useState } from "react";

import { CameraCalibration } from "@/src/models/robotModels";
import { isUnsupportedCommand, robotClient } from "@/src/services/RobotConnectService";

/**
 * Calibration state of one camera, for cards and pickers:
 * - `unsupported` — the controller does not know the calibration commands (hide Calibrate);
 * - `none` / `calibrated` — known; `calibration` carries the date once fetched;
 * - `unknown` — not connected, or the lookup failed for another reason.
 */
export type CameraCalibrationState = "loading" | "unsupported" | "none" | "calibrated" | "unknown";

export type CameraCalibrationStatus = {
  state: CameraCalibrationState;
  calibration: CameraCalibration | null;
};

type Entry = { state: CameraCalibrationState; calibration: CameraCalibration | null };

// Shared by every card on screen so a camera list polling every few seconds does not
// re-ask the controller; keyed by controller so switching robots starts fresh.
const cache    = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
const listeners = new Set<() => void>();

const keyFor = (cameraId: string) => `${robotClient.httpBaseUrl() ?? ""}|${cameraId}`;

function load(cameraId: string): Promise<Entry> {
  const key = keyFor(cameraId);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = robotClient.getCameraCalibration(cameraId)
    .then((calibration): Entry => ({ state: calibration ? "calibrated" : "none", calibration }))
    .catch((e): Entry => ({ state: isUnsupportedCommand(e) ? "unsupported" : "unknown", calibration: null }))
    .then(entry => {
      inflight.delete(key);
      if (entry.state !== "unknown") cache.set(key, entry);
      listeners.forEach(l => l());
      return entry;
    });
  inflight.set(key, p);
  return p;
}

/** Forget a camera's cached calibration (after a save or delete) and refresh watchers. */
export function invalidateCameraCalibration(cameraId: string) {
  cache.delete(keyFor(cameraId));
  listeners.forEach(l => l());
}

/**
 * `calibratedFlag` is CameraState.calibrated from GetCameras. When it is present the
 * controller supports calibration, and `false` needs no lookup; `true` (or absent, on a
 * controller that may predate the feature) triggers one lazy GetCameraCalibration.
 */
export function useCameraCalibration(cameraId: string | null | undefined, calibratedFlag?: boolean): CameraCalibrationStatus {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const cached = cameraId ? cache.get(keyFor(cameraId)) : undefined;
  // A cached answer that contradicts the live flag is stale (calibrated elsewhere, or deleted).
  const stale = cached && calibratedFlag !== undefined && (cached.state === "calibrated") !== calibratedFlag;
  const needsFetch = !!cameraId && calibratedFlag !== false && (!cached || stale);

  useEffect(() => {
    if (!cameraId || !needsFetch || !robotClient.connected) return;
    if (stale) cache.delete(keyFor(cameraId));
    load(cameraId);
  }, [cameraId, needsFetch, stale]);

  if (!cameraId) return { state: "unknown", calibration: null };
  if (calibratedFlag === false) return { state: "none", calibration: null };
  if (cached && !stale) return cached;
  // Flag says calibrated: show it now, the date follows once the lookup lands.
  if (calibratedFlag === true) return { state: "calibrated", calibration: null };
  return { state: robotClient.connected ? "loading" : "unknown", calibration: null };
}
