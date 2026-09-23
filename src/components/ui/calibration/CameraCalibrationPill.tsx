import { StyleProp, ViewStyle } from "react-native";

import { StatusPill } from "@/src/components/ui/kit";
import { relativeTime } from "@/src/components/ui/builder/RevisionsSheet";
import { CameraCalibrationStatus } from "./useCameraCalibration";

/**
 * "Calibrated 3 days ago" / "Not calibrated" for a camera. Renders nothing while the
 * state is unknown or the controller predates calibration, unless `showMissing` is off
 * in which case only the calibrated state shows (camera cards).
 */
export function CameraCalibrationPill({
  status, showMissing = false, style,
}: {
  status: CameraCalibrationStatus;
  /** Also show "Not calibrated" (vision editor); cards only show the positive state. */
  showMissing?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (status.state === "calibrated") {
    const when = status.calibration?.calibratedUnixMs;
    return (
      <StatusPill
        tone="accent"
        label={when ? `Calibrated ${relativeTime(when)}` : "Calibrated"}
        style={style}
      />
    );
  }
  if (showMissing && status.state === "none") {
    return <StatusPill tone="neutral" label="Not calibrated" style={style} />;
  }
  return null;
}
