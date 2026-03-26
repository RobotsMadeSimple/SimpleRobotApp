import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  ChevronRight,
  Cpu,
  Gamepad2,
  HomeIcon,
  OctagonX,
  RotateCcw,
  Settings2,
  Zap,
} from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// ── Homing state → human-readable label ───────────────────────────────────────
const HOMING_LABELS: Record<string, string> = {
  HomeVertical:              "Moving to vertical limit…",
  WaitVerticalMoveComplete:  "Stopping vertical axis…",
  SetVerticalHomed:          "Setting vertical zero…",
  HomeHorizontal:            "Moving to horizontal limit…",
  WaitHorizontalMoveComplete:"Stopping horizontal axis…",
  SetHorizontalHomed:        "Setting horizontal zero…",
  HomeJ1:                    "Moving J1 to limit…",
  WaitJ1MoveComplete:        "Stopping J1…",
  SetJ1MotorHomed:           "Setting J1 zero…",
  HomingComplete:            "Homing complete!",
};

export default function Control() {
  const robot = useSelectedRobot();
  const s = robot?.status;
  const fmt = (v?: number) => (v ?? 0).toFixed(1);

  const isHoming = !!s?.homingState && s.homingState !== "WaitingForStart";
  const homingLabel = s?.homingState ? (HOMING_LABELS[s.homingState] ?? s.homingState) : "";

  type PendingAction = { label: string; sub: string; icon: React.ReactNode; run: () => void } | null;
  const [confirm, setConfirm] = useState<PendingAction>(null);

  const coords = [
    { label: "X",  value: s?.x  },
    { label: "Y",  value: s?.y  },
    { label: "Z",  value: s?.z  },
    { label: "RZ", value: s?.rz },
  ];

  const actions = [
    {
      label: "Jog & Teach",
      sub: "Manually move the robot axes",
      icon: <Gamepad2 size={20} color="#2563eb" />,
      iconBg: "#dbeafe",
      onPress: () => router.push("/control/jog"),
    },
    {
      label: "Home Robot",
      sub: "Run the homing sequence",
      icon: <HomeIcon size={20} color="#16a34a" />,
      iconBg: "#dcfce7",
      onPress: () => setConfirm({
        label: "Home Robot",
        sub: "The robot will move to its home position. Make sure the workspace is clear.",
        icon: <HomeIcon size={28} color="#2563eb" />,
        run: () => robotClient.sendCommand("Home"),
      }),
    },
    {
      label: "Reset Driver",
      sub: "Clear driver faults",
      icon: <RotateCcw size={20} color="#d97706" />,
      iconBg: "#fef3c7",
      onPress: () => setConfirm({
        label: "Reset Driver",
        sub: "This will reset the motor driver and clear any active faults.",
        icon: <RotateCcw size={28} color="#d97706" />,
        run: () => robotClient.sendCommand("Reset"),
      }),
    },
  ];

  const settings = [
    { label: "Speed & Acceleration", sub: "Set move speeds and ramp rates",  icon: <Zap      size={20} color="#9ca3af" />, iconBg: "#f3f4f6" },
    { label: "Advanced",             sub: "Driver and controller options",    icon: <Settings2 size={20} color="#9ca3af" />, iconBg: "#f3f4f6" },
  ];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Position card ────────────────────────────────────────── */}
        <View style={styles.posCard}>
          <View style={styles.coordRow}>
            {coords.map(({ label, value }) => (
              <View key={label} style={styles.coordCell}>
                <Text style={styles.coordLabel}>{label}</Text>
                <Text style={styles.coordValue}>{fmt(value)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.badgeRow}>
            <View style={[styles.badge, s?.wasHomed ? styles.badgeGreen : styles.badgeGray]}>
              <View style={[styles.badgeDot, s?.wasHomed ? styles.dotGreen : styles.dotGray]} />
              <Text style={[styles.badgeText, s?.wasHomed ? styles.badgeTextGreen : styles.badgeTextGray]}>
                {s?.wasHomed ? "Homed" : "Not Homed"}
              </Text>
            </View>

            <View style={[styles.badge, s?.moving ? styles.badgeBlue : styles.badgeGray]}>
              <View style={[styles.badgeDot, s?.moving ? styles.dotBlue : styles.dotGray]} />
              <Text style={[styles.badgeText, s?.moving ? styles.badgeTextBlue : styles.badgeTextGray]}>
                {s?.moving ? "Moving" : "Idle"}
              </Text>
            </View>

            <View style={[styles.badge, s?.driverConnected ? styles.badgeGreen : styles.badgeGray]}>
              <Cpu size={11} color={s?.driverConnected ? "#166534" : "#6b7280"} />
              <Text style={[styles.badgeText, s?.driverConnected ? styles.badgeTextGreen : styles.badgeTextGray]}>
                {s?.driverConnected ? "Driver OK" : "No Driver"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ACTIONS</Text>
        <View style={styles.menuCard}>
          {actions.map((item, i) => (
            <Pressable key={i} onPress={item.onPress}>
              {({ pressed }) => (
                <View style={[
                  styles.menuRow,
                  i < actions.length - 1 && styles.menuRowBorder,
                  pressed && styles.menuRowPressed,
                ]}>
                  <View style={[styles.menuIconTile, { backgroundColor: item.iconBg }]}>
                    {item.icon}
                  </View>
                  <View style={styles.menuTextBlock}>
                    <Text style={styles.menuRowText}>{item.label}</Text>
                    <Text style={styles.menuRowSub}>{item.sub}</Text>
                  </View>
                  <ChevronRight size={18} color="#c4c4c4" />
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* ── Settings (coming soon) ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>SETTINGS</Text>
        <View style={styles.menuCard}>
          {settings.map((item, i) => (
            <View
              key={i}
              style={[styles.menuRow, i < settings.length - 1 && styles.menuRowBorder, styles.menuRowDisabled]}
            >
              <View style={[styles.menuIconTile, { backgroundColor: item.iconBg }]}>
                {item.icon}
              </View>
              <View style={styles.menuTextBlock}>
                <Text style={[styles.menuRowText, styles.menuRowTextDisabled]}>{item.label}</Text>
                <Text style={styles.menuRowSub}>{item.sub}</Text>
              </View>
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>Soon</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* ── Confirmation modal ───────────────────────────────────────── */}
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setConfirm(null)}>
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <View style={styles.confirmIconWrap}>{confirm?.icon}</View>
            <Text style={styles.confirmTitle}>{confirm?.label}</Text>
            <Text style={styles.confirmSub}>{confirm?.sub}</Text>
            <View style={styles.confirmButtons}>
              <Pressable style={styles.confirmCancel} onPress={() => setConfirm(null)}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.confirmOk}
                onPress={() => { confirm?.run(); setConfirm(null); }}
              >
                <Text style={styles.confirmOkText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Homing modal ─────────────────────────────────────────────── */}
      <Modal visible={isHoming} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.homingCard}>
            <HomeIcon size={32} color="#2563eb" />
            <Text style={styles.homingTitle}>Homing Robot</Text>
            <Text style={styles.homingState}>{homingLabel}</Text>
            <Pressable
              style={styles.stopButton}
              onPress={() => robotClient.sendCommand("HardStop")}
            >
              <OctagonX size={22} color="white" />
              <Text style={styles.stopText}>STOP</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },

  scroll: {
    padding: 16,
    paddingBottom: 32,
  },

  // ── Position card ────────────────────────────────────────────────────────
  posCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  coordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  coordCell: {
    alignItems: "center",
    flex: 1,
  },

  coordLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  coordValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    fontFamily: "monospace",
  },

  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },

  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },

  badgeGray:      { backgroundColor: "#f3f4f6" },
  badgeGreen:     { backgroundColor: "#dcfce7" },
  badgeBlue:      { backgroundColor: "#dbeafe" },

  dotGray:        { backgroundColor: "#9ca3af" },
  dotGreen:       { backgroundColor: "#16a34a" },
  dotBlue:        { backgroundColor: "#2563eb" },

  badgeTextGray:  { color: "#6b7280" },
  badgeTextGreen: { color: "#166534" },
  badgeTextBlue:  { color: "#1d4ed8" },

  // ── Section headings ─────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },

  // ── Menu card ────────────────────────────────────────────────────────────
  menuCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
  },

  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },

  menuRowPressed: {
    backgroundColor: "#f9fafb",
  },

  menuRowDisabled: {
    opacity: 0.5,
  },

  menuIconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },

  menuTextBlock: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },

  menuRowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },

  menuRowTextDisabled: {
    color: "#9ca3af",
  },

  menuRowSub: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },

  soonBadge: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  soonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
  },

  // ── Confirmation modal ───────────────────────────────────────────────────
  confirmCard: {
    width: 290,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },

  confirmIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },

  confirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
  },

  confirmSub: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
  },

  confirmButtons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },

  confirmCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },

  confirmCancelText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6b7280",
  },

  confirmOk: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },

  confirmOkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },

  // ── Homing modal ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  homingCard: {
    width: 260,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },

  homingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginTop: 4,
  },

  homingState: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
  },

  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 36,
    marginTop: 4,
  },

  stopText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },
});
