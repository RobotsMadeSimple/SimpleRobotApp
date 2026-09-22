import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import {
  Button,
  buttonTextColor,
  Card,
  colors,
  Divider,
  InfoTip,
  ListRow,
  radii,
  PageHeader,
  PositionReadout,
  Screen,
  SectionHeader,
  shadows,
  spacing,
  StatusPill,
  type,
} from "@/src/components/ui/kit";
import { useIsWide } from "@/src/components/ui/responsive";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Gamepad2,
  HomeIcon,
  OctagonX,
} from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

// ── Homing state → human-readable label ───────────────────────────────────────
const HOMING_LABELS: Record<string, string> = {
  HomeVertical:              "Moving to vertical limit…",
  WaitVerticalStop1:         "Stopping vertical axis…",
  BackOffVertical:           "Backing off vertical sensor…",
  WaitVerticalBackoff:       "Backing off vertical sensor…",
  HomeVerticalSlow:          "Fine-homing vertical axis…",
  WaitVerticalMoveComplete:  "Stopping vertical axis…",
  SetVerticalHomed:          "Setting vertical zero…",
  HomeHorizontal:            "Moving to horizontal limit…",
  WaitHorizontalStop1:       "Stopping horizontal axis…",
  BackOffHorizontal:         "Backing off horizontal sensor…",
  WaitHorizontalBackoff:     "Backing off horizontal sensor…",
  HomeHorizontalSlow:        "Fine-homing horizontal axis…",
  WaitHorizontalMoveComplete:"Stopping horizontal axis…",
  SetHorizontalHomed:        "Setting horizontal zero…",
  HomeJ1:                    "Moving J1 to limit…",
  WaitJ1Stop1:               "Stopping J1…",
  BackOffJ1:                 "Backing off J1 sensor…",
  WaitJ1Backoff:             "Backing off J1 sensor…",
  HomeJ1Slow:                "Fine-homing J1…",
  WaitJ1MoveComplete:        "Stopping J1…",
  SetJ1MotorHomed:           "Setting J1 zero…",
  HomingComplete:            "Homing complete!",
};

export default function Control() {
  const s = useRobotStatus();
  const isWide = useIsWide();
  const fmt = (v?: number) => (v ?? 0).toFixed(1);

  const isHoming = !!s?.homingState && s.homingState !== "WaitingForStart";
  const homingLabel = s?.homingState ? (HOMING_LABELS[s.homingState] ?? s.homingState) : "";

  type PendingAction = { label: string; sub: string; icon: React.ReactNode; run: () => void } | null;
  const [confirm, setConfirm] = useState<PendingAction>(null);

  // CNC-style DRO axis list — same readout in both layouts (see PositionReadout).
  const coords = [
    { label: "X",  value: fmt(s?.x),  unit: "mm" },
    { label: "Y",  value: fmt(s?.y),  unit: "mm" },
    { label: "Z",  value: fmt(s?.z),  unit: "mm" },
    { label: "RZ", value: fmt(s?.rz), unit: "°"  },
  ];

  const actions = [
    {
      label: "Jog & Teach",
      sub: "Manually move the robot axes",
      icon: <Gamepad2 size={20} color={colors.accent} />,
      iconBg: colors.accentSoft,
      onPress: () => router.push("/control/jog"),
    },
    {
      label: "Home Robot",
      sub: "Run the homing sequence",
      icon: <HomeIcon size={20} color={colors.success} />,
      iconBg: colors.successSoft,
      onPress: () => setConfirm({
        label: "Home Robot",
        sub: "The robot will move to its home position. Make sure the workspace is clear.",
        icon: <HomeIcon size={28} color={colors.accent} />,
        run: () => robotClient.sendCommand("Home"),
      }),
    },
  ];

  const posSection = (
    <>
      <SectionHeader
        title="Status"
        icon={Activity}
        right={
          <InfoTip text="World-frame X/Y/Z/RZ position. Badges below show whether the robot is homed, moving, faulted, or has a driver connected — switch to Jog & Teach to move in the active Local or Tool frame instead." />
        }
      />
      <Card padded={false}>
        <PositionReadout axes={coords} card={false} />

        <Divider />

        <View style={styles.badgeRow}>
          <StatusPill
            label={s?.wasHomed ? "Homed" : "Not Homed"}
            tone={s?.wasHomed ? "success" : "neutral"}
            dot
          />

          {s?.faulted && (
            <StatusPill
              label="Fault"
              tone="danger"
              icon={<AlertTriangle size={11} color={colors.danger} />}
            />
          )}

          <StatusPill
            label={s?.moving ? "Moving" : "Idle"}
            tone={s?.moving ? "accent" : "neutral"}
            dot
          />

          <StatusPill
            label={s?.driverConnected ? "Driver" : "No Driver"}
            tone={s?.driverConnected ? "success" : "neutral"}
            icon={<Cpu size={11} color={s?.driverConnected ? colors.success : colors.textMuted} />}
          />

          {s?.driverConnected && (
            <StatusPill
              label={s?.driverOk ? "Driver OK" : "Fault"}
              tone={s?.driverOk ? "success" : "danger"}
              dot
            />
          )}
        </View>
      </Card>
    </>
  );

  const actionsSection = (
    <>
      <SectionHeader title="Actions" style={styles.actionsHeader} />
      <Card padded={false}>
        {actions.map((item, i) => (
          <View key={item.label}>
            <ListRow
              card={false}
              title={item.label}
              subtitle={item.sub}
              icon={item.icon}
              iconColor={item.iconBg}
              onPress={item.onPress}
            />
            {i < actions.length - 1 && <Divider inset />}
          </View>
        ))}
      </Card>
    </>
  );

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader title="Control" subtitle="Move the robot and run manual actions" />

      <Screen>
        {isWide ? (
          // Wide: live position/status on the left, the action selectors on the right.
          <View style={styles.wideRow}>
            <View style={styles.wideLeftCol}>{posSection}</View>
            <View style={styles.wideRightCol}>{actionsSection}</View>
          </View>
        ) : (
          <>
            {posSection}
            {actionsSection}
          </>
        )}
      </Screen>

      {/* ── Confirmation modal ───────────────────────────────────────── */}
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setConfirm(null)}>
          <Pressable onPress={() => {}}>
            <Card style={styles.confirmCard}>
              <View style={styles.confirmIconWrap}>{confirm?.icon}</View>
              <Text style={styles.confirmTitle}>{confirm?.label}</Text>
              <Text style={styles.confirmSub}>{confirm?.sub}</Text>
              <View style={styles.confirmButtons}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  style={styles.confirmBtnFlex}
                  onPress={() => setConfirm(null)}
                />
                <Button
                  label="Confirm"
                  variant="primary"
                  style={styles.confirmBtnFlex}
                  onPress={() => { confirm?.run(); setConfirm(null); }}
                />
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Homing modal ─────────────────────────────────────────────── */}
      <Modal visible={isHoming} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.homingCard}>
            <HomeIcon size={32} color={colors.accent} />
            <Text style={styles.homingTitle}>Homing Robot</Text>
            <Text style={styles.homingState}>{homingLabel}</Text>
            <Button
              label="STOP"
              variant="destructive"
              icon={<OctagonX size={22} color={buttonTextColor("destructive")} />}
              style={styles.stopButton}
              textStyle={styles.stopText}
              onPress={() => robotClient.sendCommand("HardStop")}
            />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Wide: live position/status on a narrow left column, actions on the wider right.
  wideRow:      { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  wideLeftCol:  { width: 360, gap: spacing.md },
  wideRightCol: { flex: 1, gap: spacing.md },

  // ── Position card ────────────────────────────────────────────────────────
  // The X/Y/Z/RZ readout is the kit's CNC-style PositionReadout (DRO list), so
  // the card is unpadded and only the status pills carry their own padding.
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - 2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg - 2,
  },

  // ── Section headings ─────────────────────────────────────────────────────
  actionsHeader: { marginTop: spacing.sm },

  // ── Confirmation modal ───────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },

  confirmCard: {
    width: 290,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm - 2,
    ...shadows.raised,
  },

  confirmIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },

  confirmTitle: {
    ...type.title,
    fontSize: 17,
  },

  confirmSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: spacing.sm,
  },

  confirmButtons: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    width: "100%",
  },

  confirmBtnFlex: {
    flex: 1,
  },

  // ── Homing modal ─────────────────────────────────────────────────────────
  homingCard: {
    width: 260,
    borderRadius: radii.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.raised,
  },

  homingTitle: {
    ...type.title,
    fontSize: 18,
    marginTop: spacing.xs,
  },

  homingState: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: spacing.sm,
  },

  stopButton: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xs,
  },

  stopText: {
    fontSize: 18,
    letterSpacing: 2,
  },
});
