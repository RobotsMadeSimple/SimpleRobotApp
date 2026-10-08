import { Button, Card, colors, InfoTip, Input, radii, spacing, type } from "@/src/components/ui/kit";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

// The four logical joints, in controller index order. Labels carry both robot-type names
// (ASTRO / CNC) so this reads correctly whichever model is configured.
const JOINTS = [
  { label: "J1 base / X" },
  { label: "Horizontal / Y" },
  { label: "Vertical / Z" },
  { label: "J4 / RZ" },
];

function fmt(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : "—";
}

/**
 * Manually home a single joint: declare it to be at a known value right now (no motion), or
 * zero it. Used when a joint's position is known — read off the mechanism, or from an external
 * stimulus. A joint reads "referenced" once homed or set; the robot is homed once all four are.
 */
export function ManualJointHoming() {
  const status     = useRobotStatus();
  const referenced = status.jointReferenced ?? [false, false, false, false];
  const readouts   = [status.joint1Angle, status.joint2X, status.joint2Z, status.joint4Angle];
  const [vals, setVals] = useState<string[]>(["", "", "", ""]);

  // The controller also refuses the command while moving or homing; this just reflects it.
  const busy = status.moving;

  function setJoint(i: number) {
    const v = parseFloat(vals[i]);
    if (Number.isNaN(v)) return;
    robotClient.setJointPosition(i, v);
    setVals(p => { const n = [...p]; n[i] = ""; return n; });
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={type.title}>Manual Joint Homing</Text>
        <InfoTip text="Declare a joint to be at a known value right now — no motion. Use it to manually home a joint when its position is known (read off the mechanism, or from a sensor). A joint shows 'referenced' once homed or set; the robot is homed once all four are referenced. Disabled while the robot is moving or homing." />
      </View>

      {JOINTS.map((j, i) => (
        <View key={i} style={[styles.joint, i < JOINTS.length - 1 && styles.jointBorder]}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: referenced[i] ? colors.success : colors.textFaint }]} />
            <Text style={[type.body, styles.jointLabel]}>{j.label}</Text>
            <Text style={type.caption}>
              now {fmt(readouts[i])}  ·  {referenced[i] ? "referenced" : "not referenced"}
            </Text>
          </View>
          <View style={styles.controls}>
            <Input
              style={styles.input}
              value={vals[i]}
              onChangeText={t => setVals(p => { const n = [...p]; n[i] = t; return n; })}
              keyboardType="numbers-and-punctuation"
              placeholder="value"
              placeholderTextColor={colors.textFaint}
            />
            <Button label="Set" variant="primary" style={styles.btn} disabled={busy || vals[i].trim() === ""}
              onPress={() => setJoint(i)} />
            <Button label="Zero" variant="secondary" style={styles.btn} disabled={busy}
              onPress={() => robotClient.zeroJoint(i)} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  joint:       { paddingVertical: spacing.sm },
  jointBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  titleRow:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: spacing.xs },
  dot:         { width: 9, height: 9, borderRadius: 5 },
  jointLabel:  { flex: 1, fontWeight: "600" },
  controls:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input:       { flex: 1, borderRadius: radii.sm },
  btn:         { minWidth: 72 },
});
