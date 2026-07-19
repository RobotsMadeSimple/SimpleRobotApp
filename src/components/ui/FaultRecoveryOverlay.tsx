import { JogButton } from "@/src/components/ui/JogButton";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Joint index → jogJ unit vector. Joint space is component 0=J1 base / CNC X,
// 1=radial / CNC Y, 2=vertical / CNC Z, 3=J4 EOAT / CNC RZ. Labels/units differ
// per robot type: the CNC4Axis reads the first three as linear mm and the fourth
// as a rotary axis.
const ASTRO_JOINTS: { index: number; label: string; unit: string }[] = [
  { index: 0, label: "J1", unit: "°"  },
  { index: 1, label: "J2", unit: "mm" },
  { index: 2, label: "J3", unit: "mm" },
  { index: 3, label: "J4", unit: "°"  },
];

const CNC_JOINTS: { index: number; label: string; unit: string }[] = [
  { index: 0, label: "X",  unit: "mm" },
  { index: 1, label: "Y",  unit: "mm" },
  { index: 2, label: "Z",  unit: "mm" },
  { index: 3, label: "RZ", unit: "°"  },
];

type Tone = "safe" | "danger" | "neutral";

const TONES: Record<Tone, { color: string; activeColor: string; activeBg: string; restBg: string }> = {
  safe:    { color: "#16a34a", activeColor: "#16a34a", activeBg: "#dcfce7", restBg: "#f0fdf4" },
  danger:  { color: "#dc2626", activeColor: "#dc2626", activeBg: "#fee2e2", restBg: "#fef2f2" },
  neutral: { color: "#666666", activeColor: "#2563eb", activeBg: "#dbeafe", restBg: "transparent" },
};

function jogVec(index: number, dir: 1 | -1) {
  return {
    x:  index === 0 ? dir : 0,
    y:  index === 1 ? dir : 0,
    z:  index === 2 ? dir : 0,
    rz: index === 3 ? dir : 0,
  };
}

export function FaultRecoveryOverlay() {
  const status = useRobotStatus();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const faulted    = status.faulted;
  const faultJoint = status.faultJoint;
  const faultDir   = status.faultDirection;
  const joints     = status.robotType === "CNC4Axis" ? CNC_JOINTS : ASTRO_JOINTS;

  // Optimistic bypass state — the Switch reflects the tap instantly, then
  // reconciles with the server value once the next status poll lands. Without
  // this the toggle flickers off-then-on while the round-trip completes.
  const [bypass, setBypass] = useState(status.limitBypass);
  useEffect(() => { setBypass(status.limitBypass); }, [status.limitBypass]);

  const stopJog = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    robotClient.stopJog();
  }, []);

  // Any time the overlay tears down (fault cleared / unmount), make sure jogging stops.
  useEffect(() => () => stopJog(), [stopJog]);
  useEffect(() => { if (!faulted) stopJog(); }, [faulted, stopJog]);

  const startJog = useCallback((index: number, dir: 1 | -1) => {
    if (intervalRef.current) return;
    const vec = jogVec(index, dir);
    // Fire immediately, then repeat while held.
    robotClient.jogJ({ ...vec, speed: 20, accel: 200, decel: 1000 });
    intervalRef.current = setInterval(() => {
      robotClient.jogJ({ ...vec, speed: 20, accel: 200, decel: 1000 });
    }, 20);
  }, []);

  function toneFor(index: number, dir: 1 | -1): Tone {
    if (index !== faultJoint || faultDir === 0) return "neutral";
    // faultDir is the direction that drives further into the limit.
    return dir === faultDir ? "danger" : "safe";
  }

  function toggleBypass(next: boolean) {
    setBypass(next);
    robotClient.setLimitBypass(next);
  }

  function clearFault() {
    stopJog();
    robotClient.clearFault();
  }

  if (!faulted) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      {/* A RN Modal renders in its own native view tree, outside the app's
          GestureHandlerRootView — JogButton's gestures need a root here or they
          never fire. */}
      <GestureHandlerRootView style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconTile}>
              <AlertTriangle size={22} color="#dc2626" />
            </View>
            <Text style={styles.title}>Joint Limit Fault</Text>
          </View>

          <Text style={styles.message}>
            {status.faultMessage || "A joint reached its soft limit and motion has been halted."}
          </Text>

          {/* Joint jog grid — green jogs back into range, red drives further into
              the limit (only permitted while bypass is on). */}
          <View style={styles.jogGrid}>
            {joints.map(({ index, label, unit }) => {
              const value =
                index === 0 ? status.joint1Angle :
                index === 1 ? status.joint2X :
                index === 2 ? status.joint2Z :
                              status.joint4Angle;
              const up   = TONES[toneFor(index, 1)];
              const down = TONES[toneFor(index, -1)];
              return (
                <View key={label} style={styles.jogColumn}>
                  <JogButton
                    label={`+${label}`}
                    icon={<ChevronUp size={20} color={up.color} />}
                    iconPosition="above"
                    onStart={() => startJog(index, 1)}
                    onStop={stopJog}
                    size={64}
                    color={up.color}
                    activeColor={up.activeColor}
                    activeBg={up.activeBg}
                    restBg={up.restBg}
                  />

                  <View style={styles.jointReadout}>
                    <Text style={styles.jointName}>{label}</Text>
                    <Text style={styles.jointValue}>{(value ?? 0).toFixed(1)}{unit}</Text>
                  </View>

                  <JogButton
                    label={`−${label}`}
                    icon={<ChevronDown size={20} color={down.color} />}
                    iconPosition="below"
                    onStart={() => startJog(index, -1)}
                    onStop={stopJog}
                    size={64}
                    color={down.color}
                    activeColor={down.activeColor}
                    activeBg={down.activeBg}
                    restBg={down.restBg}
                  />
                </View>
              );
            })}
          </View>

          {/* Bypass toggle */}
          <View style={styles.bypassRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bypassLabel}>Ignore limits</Text>
              <Text style={styles.bypassHint}>
                Lets a joint be jogged past its limit in either direction. Leave off to
                jog back into range safely.
              </Text>
            </View>
            <Switch
              value={bypass}
              onValueChange={toggleBypass}
              trackColor={{ true: "#f59e0b", false: "#d1d5db" }}
              thumbColor="#fff"
            />
          </View>

          {/* Clear */}
          <Pressable style={styles.clearBtn} onPress={clearFault}>
            <Text style={styles.clearBtnText}>Clear Fault</Text>
          </Pressable>
          <Text style={styles.clearHint}>
            Clear once the joint is back in range. If it is still past the limit, the next
            move will fault again.
          </Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    marginBottom: 16,
  },
  jogGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  jogColumn: {
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  jointReadout: {
    alignItems: "center",
  },
  jointName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.5,
  },
  jointValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    fontFamily: "monospace",
  },
  bypassRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  bypassLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  bypassHint: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  clearBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  clearBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  clearHint: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 8,
  },
});
