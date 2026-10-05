import { StyleSheet, Text, View } from "react-native";

import { Button, SegmentedControl, spacing } from "@/src/components/ui/kit";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { useCameraCalibration } from "@/src/components/ui/calibration/useCameraCalibration";
import { CameraState, VisionOutputFrame } from "@/src/models/robotModels";
import { ms } from "./builderStyles";

type FrameOption = VisionOutputFrame | "default";

const OPTIONS: { label: string; value: FrameOption }[] = [
  { label: "Default",    value: "default" },
  { label: "Pixel",      value: "pixel" },
  { label: "Normalized", value: "normalized" },
  { label: "Robot",      value: "robot" },
];

const HINTS: Record<FrameOption, string> = {
  default:    "As before: blob points in pixels, polygon and ArUco centers normalized (0–1).",
  pixel:      "All points in image pixels.",
  normalized: "All points as fractions of the image (0–1), independent of resolution.",
  robot:      "Points in robot X/Y (mm) with Z at the calibrated plane — usable directly as move targets. Needs a calibrated camera.",
};

/**
 * RunVision "Output frame" selector (docs/camera-calibration.md › Using a calibration).
 * "Default" leaves `outputFrame` unset so existing programs keep today's behaviour.
 * With "robot" on an uncalibrated camera it warns inline and links to the wizard; the
 * controller's validator reports the same problem as `cameraNotCalibrated`.
 */
export function RunVisionOutputFrame({
  value, onChange, cameraId, camera, onOpenWizard,
}: {
  value: VisionOutputFrame | undefined;
  onChange: (v: VisionOutputFrame | undefined) => void;
  /** Camera of the selected vision program. */
  cameraId: string | undefined;
  camera: CameraState | undefined;
  /** Leave the step dialog and open the wizard (the dialog is a Modal, so it must close first). */
  onOpenWizard: (cameraId: string) => void;
}) {
  const selected: FrameOption = value ?? "default";
  const status = useCameraCalibration(selected === "robot" ? cameraId : null, camera?.calibrated);

  return (
    <View>
      <Text style={[ms.fieldLabel, { marginTop: 16 }]}>OUTPUT FRAME</Text>
      <Text style={ms.hintText}>{HINTS[selected]}</Text>
      <SegmentedControl
        options={OPTIONS}
        value={selected}
        onChange={v => onChange(v === "default" ? undefined : v)}
        size="sm"
        style={styles.control}
      />
      {selected === "robot" && !cameraId && (
        <Notice tone="warning" style={styles.notice}>This vision program has no camera selected.</Notice>
      )}
      {selected === "robot" && !!cameraId && status.state === "none" && (
        <Notice
          tone="warning"
          title="Camera not calibrated"
          style={styles.notice}
          action={<Button label="Save step & calibrate" size="sm" variant="secondary" onPress={() => onOpenWizard(cameraId)} />}
        >
          {`"${camera?.name ?? cameraId}" has no robot calibration, so this step will not validate or run until it is calibrated.`}
        </Notice>
      )}
      {selected === "robot" && status.state === "unsupported" && (
        <Notice tone="warning" style={styles.notice}>
          This controller does not support camera calibration; update it to use the robot frame.
        </Notice>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  control: { marginTop: spacing.xs },
  notice:  { marginTop: spacing.sm },
});
