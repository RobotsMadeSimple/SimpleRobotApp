import { RobotCard } from "@/src/components/ui/RobotCards";
import {
  Button,
  buttonTextColor,
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
import { usePaneLayout } from "@/src/components/ui/responsive";
import { setSelectedRobot } from "@/src/connections/robotState";
import { RobotInfo } from "@/src/models/robotModels";
import { useRobots, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { connKey, isSaved, manualRobot, sameRobot, recordConnection, removeRecent, toggleSaved, useConnectionStore } from "@/src/services/connectionStore";
import { ChevronDown, ChevronUp, Clock, QrCode, Radar, Star, Wifi, WifiOff, X } from "lucide-react-native";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ConnectedRobot from "./connected-robot";

export default function Robot() {
  const robots        = useRobots();
  const selectedRobot = useSelectedRobot();
  const { recents, saved } = useConnectionStore();
  const [manualIp, setManualIp] = useState("");
  const [showRecent, setShowRecent] = useState(false);

  // Hooks must run unconditionally every render, so this is read before the
  // early Redirect below even though only the non-redirect branch needs it.
  // Two columns only at desktop (≥1100); below that the NavRail sidebar is
  // already up, so a fixed 360px left column would squeeze the discovered-robots
  // list and truncate its cards — keep it single-column instead.
  const twoCol = usePaneLayout() === "desktop";

  // Render the connected dashboard in place at the tab's root route rather than
  // redirecting to a separate screen. Redirecting (a replace) used to push the
  // `index` route then replace it with `connected-robot`, so re-tapping the
  // already-focused Robot tab (which resets to the initial route `index`) stacked
  // a duplicate `connected-robot` entry and made Back appear to re-open About.
  // Keeping the dashboard on `index` keeps the initial route stable and never
  // leaves the tab blank on disconnect.
  if (selectedRobot) {
    return <ConnectedRobot />;
  }

  function connectRobot(robot: RobotInfo) {
    recordConnection(robot);
    setSelectedRobot(robot);
    robotClient.connectTo(robot);
    // No navigation needed — selecting a robot flips this screen to the
    // connected dashboard in place (see the selectedRobot branch above).
  }

  function connectManual() {
    // Connections always go out on port 9000 — strip a typed trailing ":<port>"
    // so e.g. "192.168.1.50:9000" still resolves.
    const trimmed = manualIp.trim().replace(/:\d+$/, "");
    if (!trimmed) return;
    connectRobot(manualRobot(trimmed));
  }

  // Label for a recent/saved entry: a learned robot name, else the raw address.
  const entryTitle = (r: RobotInfo) =>
    r.robotName && r.robotName !== "Manual" ? r.robotName : r.ipAddress;

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

        <Button
          label="Scan station tag"
          variant="secondary"
          size="sm"
          icon={<QrCode size={16} color={buttonTextColor("secondary")} />}
          onPress={() => router.navigate("/robot/scan-station")}
          style={styles.scanBtn}
        />

        {recents.length > 0 && (
          <>
            <Divider style={styles.lastIpDivider} />
            {/* Clickable "last connection" row that expands the full recent history. */}
            <TouchableOpacity style={styles.recentHeader} onPress={() => setShowRecent(v => !v)} activeOpacity={0.7}>
              <Clock size={14} color={colors.textFaint} />
              <Text style={styles.recentHeaderText} numberOfLines={1}>
                Recent connections ({recents.length})
              </Text>
              <Text style={styles.recentToggle}>{showRecent ? "Hide" : "Show recent"}</Text>
              {showRecent
                ? <ChevronUp   size={16} color={colors.textFaint} />
                : <ChevronDown size={16} color={colors.textFaint} />}
            </TouchableOpacity>

            {showRecent && (
              <View style={styles.recentList}>
                {recents.map(r => (
                  <View key={connKey(r)} style={styles.recentRow}>
                    <TouchableOpacity style={styles.recentConnect} onPress={() => connectRobot(r)} activeOpacity={0.7}>
                      <Text style={styles.recentName} numberOfLines={1}>{entryTitle(r)}</Text>
                      <Text style={styles.recentSub} numberOfLines={1}>
                        {r.robotType ? `${r.robotType} · ` : ""}{r.ipAddress}:{r.port}
                      </Text>
                    </TouchableOpacity>
                    <Pressable onPress={() => toggleSaved(r)} hitSlop={8} style={styles.recentIcon}>
                      {/* key flips with saved-state so the SVG remounts — react-native-svg
                          otherwise keeps the old fill on an in-place color-only prop change
                          (lucide builds its paths keyless), leaving the star stale on native. */}
                      <Star key={isSaved(r) ? "on" : "off"} size={16} color={isSaved(r) ? colors.warning : colors.textFaint} fill={isSaved(r) ? colors.warning : "transparent"} />
                    </Pressable>
                    <Pressable onPress={() => removeRecent(r)} hitSlop={8} style={styles.recentIcon}>
                      <X size={16} color={colors.textFaint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
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
          label="Saved"
          value={saved.length}
          icon={Star}
          style={styles.statTile}
        />
      </View>
    </>
  );

  // Dedupe: a saved robot that's also being discovered shows under "Discovered", so here we only
  // list saved robots that aren't currently on the network — the reason the Saved list exists
  // (reconnect to something you can't see right now). Matched by serial too, so a robot saved
  // under its Tailscale address is hidden while it is discovered on the LAN.
  const savedOffline = saved.filter(s => !robots.some(d => sameRobot(d, s)));

  // Starred (saved) robots sort to the top of the discovered list, then alphabetically.
  const robotLabel = (r: typeof robots[number]) =>
    (r.robotName && r.robotName !== "Manual" ? r.robotName : r.ipAddress) ?? "";
  const sortedRobots = [...robots].sort((a, b) => {
    const sa = isSaved(a) ? 0 : 1;
    const sb = isSaved(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return robotLabel(a).localeCompare(robotLabel(b));
  });

  const savedSection = savedOffline.length > 0 ? (
    <>
      <SectionHeader
        title="Saved (offline)"
        icon={Star}
        right={<InfoTip text="Starred robots that aren't on the network right now — reconnect by their saved address. Saved robots that are currently discovered appear under Discovered (with a filled star). Tap a star to remove one." />}
      />
      <View>
        {savedOffline.map(r => <RobotCard key={connKey(r)} robot={r} />)}
      </View>
    </>
  ) : null;

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
          {sortedRobots.map((r) => (
            <RobotCard key={connKey(r)} robot={r} />
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Robot" subtitle="Discover and connect to robots on your network" />
      <Screen>
        {twoCol ? (
          <View style={styles.wideRow}>
            <View style={styles.wideLeftCol}>{manualSection}{savedSection}</View>
            <View style={styles.wideRightCol}>{discoveredSection}</View>
          </View>
        ) : (
          <>
            {manualSection}
            {savedSection && <View style={styles.narrowGap}>{savedSection}</View>}
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

  scanBtn: { marginTop: spacing.sm },

  lastIpDivider: { marginTop: spacing.sm, marginBottom: 2 },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
  },
  recentHeaderText: {
    flex: 1,
    ...type.body,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  recentToggle: {
    ...type.caption,
    color: colors.accent,
    fontWeight: "600",
  },
  recentList: {
    marginTop: 2,
    gap: 2,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: 2,
  },
  recentConnect: {
    flex: 1,
    minWidth: 0,
  },
  recentName: {
    ...type.body,
    color: colors.text,
    fontWeight: "500",
  },
  recentSub: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 1,
  },
  recentIcon: {
    padding: 2,
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
