import { RobotCard } from "@/src/components/ui/RobotCards";
import {
  Button,
  Card,
  colors,
  Divider,
  EmptyState,
  IconTile,
  Input,
  InfoTip,
  PageHeader,
  Screen,
  SectionHeader,
  spacing,
  StatTile,
  type,
} from "@/src/components/ui/kit";
import { useIsWide } from "@/src/components/ui/responsive";
import { setSelectedRobot } from "@/src/connections/robotState";
import { useRobots, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router } from "expo-router";
import { ArrowRight, Clock, Radar, Wifi, WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const LAST_IP_KEY = "lastManualIp";

export default function Robot() {
  const robots        = useRobots();
  const selectedRobot = useSelectedRobot();
  const [manualIp, setManualIp] = useState("");
  const [lastIp,   setLastIp]   = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(LAST_IP_KEY).then(v => { if (v) setLastIp(v); }).catch(() => {});
  }, []);

  // Hooks must run unconditionally every render, so this is read before the
  // early Redirect below even though only the non-redirect branch needs it.
  const isWide = useIsWide();

  if (selectedRobot) {
    return <Redirect href="/robot/connected-robot" />;
  }

  function connectTo(ip: string) {
    // Connections always go out on port 9000 (below) — strip a typed
    // trailing ":<port>" so e.g. "192.168.1.50:9000" still resolves.
    const trimmed = ip.trim().replace(/:\d+$/, "");
    if (!trimmed) return;
    AsyncStorage.setItem(LAST_IP_KEY, trimmed).catch(() => {});
    setLastIp(trimmed);
    const robot = {
      robotName:       "Manual",
      robotType:       "",
      ipAddress:       trimmed,
      port:            9000,
      serialNumber:    "",
      controlEndpoint: "control",
    };
    setSelectedRobot(robot);
    robotClient.connectTo(robot);
    router.replace(`/robot/connected-robot`);
  }

  function connectManual() {
    connectTo(manualIp);
  }

  const manualSection = (
    <>
      <SectionHeader
        title="Manual Connection"
        right={<InfoTip text="Type just the robot's IP address — the app always connects on port 9000, so there's no need to include it." />}
      />
      <Card>
        <View style={styles.inputRow}>
          <IconTile size={36}>
            <Wifi size={18} color={colors.accent} />
          </IconTile>
          <Input
            value={manualIp}
            onChangeText={setManualIp}
            placeholder="192.168.1.50"
            style={styles.input}
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={connectManual}
          />
          <Button label="Connect" size="sm" onPress={connectManual} disabled={!manualIp.trim()} />
        </View>

        {lastIp && (
          <>
            <Divider style={styles.lastIpDivider} />
            <TouchableOpacity style={styles.lastIpRow} onPress={() => connectTo(lastIp)} activeOpacity={0.7}>
              <Clock size={13} color={colors.textFaint} />
              <Text style={styles.lastIpText} numberOfLines={1}>{lastIp}</Text>
              <ArrowRight size={13} color={colors.accent} />
            </TouchableOpacity>
          </>
        )}
      </Card>

      <View style={styles.statRow}>
        <StatTile
          label="Robots Found"
          value={robots.length}
          icon={Radar}
          style={styles.statTile}
        />
        <StatTile
          label="Last Manual IP"
          value={lastIp ?? "None"}
          icon={Clock}
          mono={!!lastIp}
          style={styles.statTile}
        />
      </View>
    </>
  );

  const discoveredSection = (
    <>
      <SectionHeader
        title="Discovered Robots"
        icon={Radar}
        right={
          <View style={styles.discoveredHeaderRight}>
            {robots.length === 0 && <ActivityIndicator size="small" color={colors.accent} />}
            <InfoTip text="Robots on the same network announce themselves automatically — no setup needed. If nothing shows up here, the robot may be on a different network or subnet (mDNS discovery doesn't cross routers or VPNs); connect by IP manually instead." />
          </View>
        }
      />

      {robots.length === 0 ? (
        <EmptyState
          icon={<WifiOff size={32} color={colors.textFaint} />}
          title="Scanning for robots…"
          subtitle="Make sure your robot is powered on and on the same network."
        />
      ) : (
        <View>
          {robots.map((r) => (
            <RobotCard key={r.serialNumber || r.ipAddress} robot={r} />
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Robot" subtitle="Discover and connect to robots on your network" />
      <Screen>
        {isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideLeftCol}>{manualSection}</View>
            <View style={styles.wideRightCol}>{discoveredSection}</View>
          </View>
        ) : (
          <>
            {manualSection}
            <View style={styles.narrowGap}>{discoveredSection}</View>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  input:    { flex: 1 },

  lastIpDivider: { marginTop: spacing.sm, marginBottom: 2 },
  lastIpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
  },
  lastIpText: {
    flex: 1,
    ...type.body,
    color: colors.textSecondary,
    fontWeight: "500",
  },

  statRow:  { flexDirection: "row", gap: spacing.md },
  statTile: { flex: 1 },

  discoveredHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  // ── Wide two-column layout ──────────────────────────────────────────────────
  // Manual connect + stats in a fixed left column, discovered robots in the
  // wider right one — mirrors the connected-robot page's split.
  wideRow: {
    flexDirection: "row",
    gap: spacing.lg,
    alignItems: "flex-start",
  },
  wideLeftCol:  { width: 360, gap: spacing.md },
  // gap so the "Discovered Robots" title doesn't get overlapped by the list
  // below it — same fix as the left column already had.
  wideRightCol: { flex: 1, gap: spacing.md },
  // gap here too — narrow mode wraps discoveredSection in this View, so
  // without it "Discovered Robots" overlaps the RobotCard/EmptyState below.
  narrowGap:    { marginTop: spacing.xl, gap: spacing.md },
});
