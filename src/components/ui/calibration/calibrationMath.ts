import { CalibrationStoredDot, CameraCalibration, Matrix3 } from "@/src/models/robotModels";

/** Apply a 3×3 homography to a point. */
export function applyHomography(h: Matrix3, x: number, y: number): { x: number; y: number } {
  const w = h[2][0] * x + h[2][1] * y + h[2][2];
  const d = Math.abs(w) < 1e-12 ? 1e-12 : w;
  return {
    x: (h[0][0] * x + h[0][1] * y + h[0][2]) / d,
    y: (h[1][0] * x + h[1][1] * y + h[1][2]) / d,
  };
}

/** Where the rigid sheet → robot fit puts a dot's sheet position (non-mirrored fits only). */
function rigidPrediction(cal: CameraCalibration, dot: CalibrationStoredDot) {
  const { cos, sin, tx, ty } = cal.sheetToRobot;
  const sx = dot.i * cal.dotPitchMm;
  const sy = dot.j * cal.dotPitchMm;
  return { x: cos * sx - sin * sy + tx, y: sin * sx + cos * sy + ty };
}

/** Where the composed pixel → robot map puts a dot's image position. */
function pixelPrediction(cal: CameraCalibration, dot: CalibrationStoredDot) {
  return applyHomography(cal.pixelToRobot, dot.u * cal.imageWidth, dot.v * cal.imageHeight);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const rms  = (xs: number[]) => (xs.length ? Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) : 0);

/**
 * Residual (mm) of each taught dot. The controller's per-dot `residualMm` wins when it
 * sends one. Otherwise the rigid fit is re-applied here; if that disagrees with the
 * reported RMS (a mirrored fit, or a different rotation convention) the composed
 * pixel → robot homography is used instead, which is convention-free.
 */
export function taughtResiduals(cal: CameraCalibration): number[] {
  const dots = cal.taughtDots;
  if (dots.length && dots.every(d => d.residualMm !== undefined)) return dots.map(d => d.residualMm as number);

  const pixel = dots.map(d => dist(pixelPrediction(cal, d), d.robot));
  if (cal.mirrored) return pixel;
  const rigid = dots.map(d => dist(rigidPrediction(cal, d), d.robot));
  const agrees = Math.abs(rms(rigid) - cal.taughtRmsMm) <= Math.max(0.5, cal.taughtRmsMm);
  return agrees ? rigid : pixel;
}

/** Pitch-scale mismatch as a signed percentage (1.004 → +0.4). */
export const pitchScalePercent = (estimate: number) => (estimate - 1) * 100;

/** Above this the entered pitch (or the sheet print scale) is probably wrong. */
export const PITCH_SCALE_WARN_PERCENT = 2;
