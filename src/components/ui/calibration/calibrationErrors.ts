import { CommandFailedError, isUnsupportedCommand } from "@/src/services/RobotConnectService";

/** A controller error turned into something a person can act on. */
export type CalibrationProblem = {
  /** Contract error code (docs/camera-calibration.md), or null for transport/unknown failures. */
  code: string | null;
  title: string;
  /** What to fix. */
  detail: string;
};

const EXPLAIN: Record<string, { title: string; detail: string }> = {
  noDotsFound: {
    title: "No dots found",
    detail:
      "Make sure the whole sheet is in view, in focus and evenly lit without glare, and that " +
      "the Dark/Light dots setting matches the sheet. Very small or very large dots fall outside " +
      "the detector's size range. Then re-detect.",
  },
  gridNotFound: {
    title: "Dots found, but no regular grid",
    detail:
      "At least 4 dots on a regular lattice are needed. Lay the sheet flat, remove other round " +
      "marks from the view, keep dots from being cut off at the image edge, and move the camera " +
      "or sheet so the grid is less steeply angled. Then re-detect.",
  },
  cameraNotConnected: {
    title: "Camera is offline",
    detail:
      "The controller cannot read a frame from this camera. Check the USB cable and that the " +
      "camera shows Connected on the I/O page, then try again.",
  },
  unknownCamera: {
    title: "Unknown camera",
    detail: "This camera no longer exists on the controller. Go back to the I/O page and pick it again.",
  },
  unknownSession: {
    title: "Calibration session expired",
    detail: "Sessions end after 30 minutes without use (or when the controller restarts). Start detection again.",
  },
  unknownDot: {
    title: "Dot not in the current detection",
    detail: "That dot is no longer in the latest detection. Select a dot on the current image.",
  },
  notEnoughTaught: {
    title: "Not enough dots taught",
    detail: "Teach at least 2 dots (3 recommended, not in a straight line) before solving.",
  },
  taughtCollinear: {
    title: "Taught dots are in a line",
    detail:
      "All taught dots lie on one line, so the rotation cannot be pinned down reliably. Teach a " +
      "third dot away from that line — ideally near the opposite corner of the sheet.",
  },
  notCalibrated: {
    title: "Not calibrated yet",
    detail: "Solve and save the calibration first, then verify.",
  },
};

const CODES = Object.keys(EXPLAIN);

/** Pull the contract code out of an error message ("gridNotFound" or "gridNotFound: detail"). */
export function calibrationErrorCode(e: unknown): string | null {
  const text = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return CODES.find(c => new RegExp(`\\b${c}\\b`).test(text)) ?? null;
}

export function explainCalibrationError(e: unknown): CalibrationProblem {
  if (isUnsupportedCommand(e)) {
    return {
      code: "unsupported",
      title: "Calibration is not supported",
      detail: "This controller does not know the calibration commands yet. Update the controller to calibrate cameras.",
    };
  }
  const code = calibrationErrorCode(e);
  if (code) return { code, ...EXPLAIN[code] };
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return {
    code: null,
    title: e instanceof CommandFailedError ? "The controller reported an error" : "Could not reach the controller",
    detail: message || "Check the connection and try again.",
  };
}
