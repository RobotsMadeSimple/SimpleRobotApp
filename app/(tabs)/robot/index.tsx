import { RobotCard } from "@/src/components/ui/RobotCards";
import {
  Button,
  Card,
  colors,
  Divider,
  EmptyState,
  IconTile,
  Input,
  Screen,
  SectionHeader,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { setSelectedRobot } from "@/src/connections/robotState";
import { useRobots, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, router } from "expo-router";
import { ArrowRight, Clock, Wifi, WifiOff } from "lucide-react-native";
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

  if (selectedRobot) {
    return <Redirect href="/robot/connected-robot" />;
  }

  function connectTo(ip: string) {
    const trimmed = ip.trim();
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

  return (
    <Screen>
      {/* Manual connection card */}
      <SectionHeader title="Manual Connection" />
      <Card>
        <View style={styles.inputRow}>
          <IconTile size={36}>
            <Wifi size={18} color={colors.accent} />
          </IconTile>
          <Input
            value={manualIp}
            onChangeText={setManualIp}
            placeholder="192.168.x.x:9000"
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

      {/* Discovered robots */}
      <SectionHeader
        title="Discovered Robots"
        right={robots.length === 0 ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
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
    </Screen>
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
});
