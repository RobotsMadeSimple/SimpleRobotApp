import { getSelectedRobot, setSelectedRobot, subscribeRobot } from "@/src/connections/robotState";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";
import {
  Activity,
  Cpu,
  Gauge,
  Hash,
  Network,
  Pencil,
  RefreshCw,
  Server,
  Tag,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react-native";

import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { Picker } from "@react-native-picker/picker";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const robotImages: Record<string, any> = {
  ASTRO: require("@/assets/images/ASTRO.png"),
};
const defaultRobotImage = require("@/assets/images/no-robot.png");

// ── Small building blocks ─────────────────────────────────────────────────────

function InfoRow({
  icon,
  iconColor,
  tileBg,
  label,
  value,
  last = false,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  tileBg?: string;
  label: string;
  value: string | number | React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={[styles.rowTile, { backgroundColor: tileBg ?? "#f3f4f6" }]}>
        {icon}
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.statusDot}>
      <View style={[styles.dot, { backgroundColor: ok ? "#16a34a" : "#dc2626" }]} />
      <Text style={[styles.dotLabel, { color: ok ? "#16a34a" : "#dc2626" }]}>{label}</Text>
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AboutRobot() {
  const [robot, setRobot] = useState(getSelectedRobot());
  const status = useRobotStatus();

  useEffect(() => subscribeRobot(setRobot), []);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [saving, setSaving] = useState(false);

  const [restartVisible, setRestartVisible] = useState(false);
  const [restarting, setRestarting] = useState(false);


  async function confirmRestart() {
    setRestarting(true);
    try {
      await robotClient.restartController();
    } finally {
      setRestarting(false);
      setRestartVisible(false);
    }
  }

  function openEdit() {
    setEditName(robot?.robotName ?? "");
    setEditType(robot?.robotType ?? "");
    setEditVisible(true);
  }

  async function saveEdit() {
    if (!robot) return;
    setSaving(true);
    try {
      await robotClient.setRobotIdentity({
        robotName: editName !== robot.robotName ? editName : undefined,
        robotType: editType !== robot.robotType ? editType : undefined,
      });
      const updated = { ...robot, robotName: editName, robotType: editType };
      setSelectedRobot(updated);
      robotDiscovery.updateRobot(robot.serialNumber, updated);
      setEditVisible(false);
    } finally {
      setSaving(false);
    }
  }

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No robot selected</Text>
      </View>
    );
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;
  const isHoming = status.homingState !== "WaitingForStart";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Tabs.Screen options={{ headerShown: false }} />
      {/* Hero card */}
      <View style={styles.heroCard}>
        <View style={styles.heroImageWrapper}>
          <Image source={imageSource} style={styles.heroImage} resizeMode="contain" />
        </View>
        <Text style={styles.heroName}>{robot.robotName || "Unknown Robot"}</Text>
        {!!robot.robotType && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{robot.robotType}</Text>
          </View>
        )}
      </View>

      {/* Identity */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>IDENTITY</Text>
        <TouchableOpacity onPress={openEdit} style={styles.editButton}>
          <Pencil size={14} color="#2563eb" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <InfoRow
          icon={<Tag size={16} color="#2563eb" />}
          tileBg="#eff6ff"
          label="Name"
          value={robot.robotName || "—"}
        />
        <InfoRow
          icon={<Cpu size={16} color="#7c3aed" />}
          tileBg="#f5f3ff"
          label="Type"
          value={robot.robotType || "—"}
        />
        <InfoRow
          icon={<Hash size={16} color="#6b7280" />}
          tileBg="#f9fafb"
          label="Serial Number"
          value={robot.serialNumber || "—"}
          last
        />
      </View>

      {/* Network */}
      <Text style={styles.sectionLabel}>NETWORK</Text>
      <View style={styles.card}>
        <InfoRow
          icon={<Network size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="IP Address"
          value={robot.ipAddress || "—"}
        />
        <InfoRow
          icon={<Server size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="Port"
          value={robot.port}
        />
        <InfoRow
          icon={<Zap size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="Endpoint"
          value={robot.controlEndpoint}
          last
        />
      </View>

      {/* Live status */}
      <Text style={styles.sectionLabel}>LIVE STATUS</Text>
      <View style={styles.card}>
        <InfoRow
          icon={status.connected ? <Wifi size={16} color="#16a34a" /> : <WifiOff size={16} color="#dc2626" />}
          tileBg={status.connected ? "#f0fdf4" : "#fef2f2"}
          label="Connection"
          value={<StatusDot ok={status.connected} label={status.connected ? "Connected" : "Disconnected"} />}
        />
        <InfoRow
          icon={<Cpu size={16} color={status.driverConnected ? "#16a34a" : "#dc2626"} />}
          tileBg={status.driverConnected ? "#f0fdf4" : "#fef2f2"}
          label="Motor Driver"
          value={<StatusDot ok={status.driverConnected} label={status.driverConnected ? "Online" : "Offline"} />}
        />
        <InfoRow
          icon={<Activity size={16} color={status.wasHomed ? "#16a34a" : "#f97316"} />}
          tileBg={status.wasHomed ? "#f0fdf4" : "#fff7ed"}
          label="Homed"
          value={<StatusDot ok={status.wasHomed} label={status.wasHomed ? "Yes" : "No"} />}
        />
        <InfoRow
          icon={<Gauge size={16} color="#6b7280" />}
          tileBg="#f9fafb"
          label="Homing State"
          value={isHoming ? status.homingState : "Idle"}
          last
        />
      </View>

      {/* Restart */}
      <TouchableOpacity style={styles.restartButton} onPress={() => setRestartVisible(true)}>
        <RefreshCw size={15} color="#dc2626" />
        <Text style={styles.restartButtonText}>Restart Controller</Text>
      </TouchableOpacity>

      <Modal visible={restartVisible} transparent animationType="fade" onRequestClose={() => setRestartVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Restart Controller?</Text>
            <Text style={styles.restartWarning}>
              The robot will disconnect briefly while the controller restarts. Motion will stop.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setRestartVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.restartConfirmButton, restarting && { opacity: 0.6 }]}
                onPress={confirmRestart}
                disabled={restarting}
              >
                <Text style={styles.saveButtonText}>{restarting ? "Restarting…" : "Restart"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Robot Identity</Text>

            <Text style={styles.editLabel}>ROBOT NAME</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Robot name"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.editLabel}>ROBOT TYPE</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={editType}
                onValueChange={setEditType}
                style={styles.picker}
                dropdownIconColor="#6b7280"
              >
                <Picker.Item label="ASTRO" value="ASTRO" />
              </Picker>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={saveEdit} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  centerText: {
    fontSize: 15,
    color: "#6b7280",
  },

  // Hero
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 8,
  },
  heroImageWrapper: {
    width: 110,
    height: 110,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  heroImage: {
    width: 110,
    height: 110,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  typeBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },

  // Section label
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },

  // Restart button
  restartButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
    marginBottom: 20,
  },
  restartButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dc2626",
  },
  restartWarning: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 16,
    lineHeight: 18,
  },
  restartConfirmButton: {
    flex: 1,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },

  // Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    width: 300,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  editInput: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
    marginBottom: 12,
  },
  pickerWrapper: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    marginBottom: 12,
    overflow: "hidden",
  },
  picker: {
    color: "#111827",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },

  // Card
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },

  // Info row
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  rowTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  infoValue: {
    fontSize: 14,
    color: "#6b7280",
    maxWidth: "45%",
    textAlign: "right",
  },

  // Status dot
  statusDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

});
