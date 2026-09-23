import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Crosshair } from "lucide-react-native";

import { Button, buttonTextColor, colors, spacing } from "@/src/components/ui/kit";
import { CameraState } from "@/src/models/robotModels";
import { CameraCalibrationPill } from "./CameraCalibrationPill";
import { useCameraCalibration } from "./useCameraCalibration";

export function openCalibrationWizard(cameraId: string) {
  router.push({ pathname: "/(tabs)/io/camera-calibrate", params: { cameraId } });
}

/**
 * Calibration state + "Calibrate" action for a camera. `footer` is the strip under a
 * camera card on the I/O page; `inline` sits in a page header. Renders nothing until
 * the controller's support is known, and nothing at all on a controller without the
 * calibration commands (UnsupportedCommandError), so older controllers never show a
 * button that cannot work.
 */
export function CameraCalibrationControls({
  camera, layout,
}: {
  camera: Pick<CameraState, "id" | "calibrated">;
  layout: "footer" | "inline";
}) {
  const status = useCameraCalibration(camera.id, camera.calibrated);
  if (status.state !== "calibrated" && status.state !== "none") return null;

  const action = (
    <Button
      label={status.state === "calibrated" ? "Recalibrate" : "Calibrate"}
      variant={layout === "footer" ? "ghost" : "secondary"}
      size="sm"
      icon={<Crosshair size={14} color={buttonTextColor(layout === "footer" ? "ghost" : "secondary")} />}
      onPress={() => openCalibrationWizard(camera.id)}
    />
  );

  if (layout === "inline") {
    return (
      <View style={styles.inline}>
        <CameraCalibrationPill status={status} />
        {action}
      </View>
    );
  }
  return (
    <View style={styles.footer}>
      <View style={styles.grow}>
        <CameraCalibrationPill status={status} showMissing />
      </View>
      {action}
    </View>
  );
}

/** "Calibrated …" / "Not calibrated" for pickers (vision editor, RunVision step). */
export function CameraCalibrationBadge({ cameraId, calibrated }: { cameraId: string | null | undefined; calibrated?: boolean }) {
  const status = useCameraCalibration(cameraId, calibrated);
  return <CameraCalibrationPill status={status} showMissing />;
}

const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  grow: { flex: 1, alignItems: "flex-start" },
});
