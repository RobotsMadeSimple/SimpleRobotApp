import { RobotCard } from "@/src/components/ui/RobotCards";
import { setSelectedRobot } from "@/src/connections/robotState";
import { useRobots, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Redirect, router } from "expo-router";
import { Wifi, WifiOff } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function Robot() {
  const { robots } = useRobots();
  const selectedRobot = useSelectedRobot();
  const [manualIp, setManualIp] = useState("");

  if (selectedRobot) {
    return <Redirect href="/robot/connected-robot" />;
  }

  function connectManual() {
    if (!manualIp.trim()) return;
    const robot = {
      robotName: "Manual",
      robotType: "",
      ipAddress: manualIp.trim(),
      port: 9000,
      serialNumber: "",
      controlEndpoint: "control",
    };
    setSelectedRobot(robot);
    robotClient.connectTo(robot);
    router.push(`/robot/connected-robot`);
  }

  return (
    <View style={styles.container}>
      {/* Manual connection card */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MANUAL CONNECTION</Text>
        <View style={styles.card}>
          <View style={styles.inputRow}>
            <View style={styles.iconTile}>
              <Wifi size={18} color="#2563eb" />
            </View>
            <TextInput
              value={manualIp}
              onChangeText={setManualIp}
              placeholder="192.168.x.x:9000"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={connectManual}
            />
            <TouchableOpacity
              style={[styles.connectBtn, !manualIp.trim() && styles.connectBtnDisabled]}
              onPress={connectManual}
              activeOpacity={0.8}
            >
              <Text style={styles.connectBtnText}>Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Discovered robots */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>DISCOVERED ROBOTS</Text>
          {robots.length === 0 && (
            <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 8 }} />
          )}
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={robots}
        keyExtractor={(r) => r.serialNumber || r.ipAddress}
        renderItem={({ item }) => <RobotCard robot={item} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <WifiOff size={32} color="#9ca3af" />
            </View>
            <Text style={styles.emptyTitle}>Scanning for robots…</Text>
            <Text style={styles.emptySubtext}>
              Make sure your robot is powered on and on the same network.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 14,
    backgroundColor: "#f9fafb",
    color: "#111827",
  },
  connectBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
  },
  connectBtnDisabled: {
    backgroundColor: "#93c5fd",
  },
  connectBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 19,
  },
});
