import { router } from "expo-router";
import { Bell, OctagonAlert, RotateCcw } from "lucide-react-native";
import { ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { appAlert } from "@/src/components/ui/AppAlert";
import { colors, haptic, radii, spacing } from "@/src/components/ui/kit";
import { useRobotStatusValue } from "@/src/providers/RobotProvider";
import { errorText, resetEstop } from "@/src/services/safetyApi";

/**
 * The e-stop banner: a red strip across the top of every screen while the controller's hardwired
 * e-stop is active or latched (controller docs/estop.md), with Reset and a link to the alarms.
 *
 * Wraps the app below it: while the banner shows it takes the top safe-area inset itself and hands
 * the screens a top inset of 0, so page headers sit directly under it instead of being covered.
 */
export function EstopBannerFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const connected = useRobotStatusValue(s => s.connected);
  const active    = useRobotStatusValue(s => !!s.estopActive);
  const latched   = useRobotStatusValue(s => !!s.estopLatched);
  const shown = connected && (active || latched);

  return (
    <View style={styles.frame}>
      {shown && <EstopBanner topInset={insets.top} active={active} latched={latched} />}
      <SafeAreaInsetsContext.Provider value={shown ? { ...insets, top: 0 } : insets}>
        <View style={styles.frame}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function EstopBanner({ topInset, active, latched }: { topInset: number; active: boolean; latched: boolean }) {
  const reason      = useRobotStatusValue(s => s.estopReason ?? null);
  const source      = useRobotStatusValue(s => s.estopSource ?? "");
  const alarmCount  = useRobotStatusValue(s => s.activeAlarmCount ?? 0);
  const online      = useRobotStatusValue(s => !!s.estopSourceOnline);
  const { width }   = useWindowDimensions();
  const compact     = width < 560;
  const [busy, setBusy] = useState(false);

  // Active: the circuit is still open — nothing can be reset yet. Latched only: released, reset needed.
  const title = active ? "Emergency stop" : "Emergency stop — reset required";
  const detail = !active
    ? "The e-stop is released. Reset it, then home the robot before moving."
    : online
    ? `${reason ?? `The e-stop input (${source || "e-stop"}) is tripped`}. Release the e-stop to continue.`
    : `${reason ?? `The e-stop input (${source || "e-stop"}) is offline`}. Reconnect it to continue.`;

  async function reset() {
    if (busy) return;
    setBusy(true);
    try {
      const msg = await resetEstop();
      haptic("success");
      appAlert("E-stop reset", `${msg} The drivers lost power, so the robot must be homed again.`);
    } catch (e) {
      haptic("error");
      appAlert("Can't reset yet", errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const alarmsBtn = (
    <Pressable
      onPress={() => router.navigate("/robot/alarms")}
      style={({ pressed }) => [styles.ghostBtn, compact && styles.btnFlex, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Alarms, ${alarmCount} active`}
    >
      <Bell size={15} color={colors.onAccent} />
      <Text style={styles.ghostText}>Alarms</Text>
      {alarmCount > 0 && (
        <View style={styles.count}><Text style={styles.countText}>{alarmCount > 99 ? "99+" : alarmCount}</Text></View>
      )}
    </Pressable>
  );

  const resetBtn = latched ? (
    <Pressable
      onPress={reset}
      disabled={busy || active}
      style={({ pressed }) => [styles.resetBtn, compact && styles.btnFlex, (busy || active) && styles.disabled, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Reset emergency stop"
    >
      {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <RotateCcw size={15} color={colors.danger} />}
      <Text style={styles.resetText}>{active ? "Release to reset" : "Reset"}</Text>
    </Pressable>
  ) : null;

  return (
    <View style={[styles.banner, { paddingTop: topInset + spacing.sm }]} accessibilityRole="alert" testID="estop-banner">
      <View style={[styles.inner, compact && styles.innerCompact]}>
        <View style={styles.textRow}>
          <View style={styles.iconTile}><OctagonAlert size={22} color={colors.danger} /></View>
          <View style={styles.texts}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.detail} numberOfLines={compact ? 3 : 2}>{detail}</Text>
          </View>
        </View>
        <View style={[styles.actions, compact && styles.actionsCompact]}>
          {alarmsBtn}
          {resetBtn}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  banner: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
  },
  innerCompact: { flexDirection: "column", alignItems: "stretch", gap: spacing.sm },
  textRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1, minWidth: 0 },
  iconTile: {
    width: 38, height: 38, borderRadius: radii.md,
    backgroundColor: colors.onAccent,
    alignItems: "center", justifyContent: "center",
  },
  texts: { flex: 1, minWidth: 0 },
  title: { color: colors.onAccent, fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  detail: { color: "rgba(255,255,255,0.92)", fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actionsCompact: { alignSelf: "stretch" },
  btnFlex: { flex: 1, justifyContent: "center" },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    minHeight: 40, paddingHorizontal: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)",
  },
  ghostText: { color: colors.onAccent, fontSize: 14, fontWeight: "700" },
  count: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: colors.onAccent, alignItems: "center", justifyContent: "center",
  },
  countText: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    minHeight: 40, paddingHorizontal: spacing.lg,
    borderRadius: radii.md, backgroundColor: colors.onAccent,
  },
  resetText: { color: colors.danger, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.8 },
});
