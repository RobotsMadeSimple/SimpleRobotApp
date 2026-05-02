import { robotClient } from "@/src/services/RobotConnectService";
import {
  Home,
  MoveHorizontal,
  MoveVertical,
  Pencil,
  RotateCcw,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type RobotConfig = {
  homingSpeed: number;
  j1HomeOffsetDeg: number;
  verticalHomePosition: number;
  horizontalHomePosition: number;
};

function InfoRow({
  icon,
  tileBg,
  label,
  value,
  last = false,
}: {
  icon: React.ReactNode;
  tileBg?: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={[styles.rowTile, { backgroundColor: tileBg ?? "#f3f4f6" }]}>
        {icon}
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function ConfigureRobot() {
  const [config, setConfig] = useState<RobotConfig | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editHomingSpeed, setEditHomingSpeed] = useState("");
  const [editJ1Offset, setEditJ1Offset] = useState("");
  const [editVertical, setEditVertical] = useState("");
  const [editHorizontal, setEditHorizontal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    robotClient.getRobotConfig().then(setConfig).catch(() => {});
  }, []);

  function openEdit() {
    if (!config) return;
    setEditHomingSpeed(String(config.homingSpeed));
    setEditJ1Offset(String(config.j1HomeOffsetDeg));
    setEditVertical(String(config.verticalHomePosition));
    setEditHorizontal(String(config.horizontalHomePosition));
    setEditVisible(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const fields = {
        homingSpeed:            parseFloat(editHomingSpeed),
        j1HomeOffsetDeg:        parseFloat(editJ1Offset),
        verticalHomePosition:   parseFloat(editVertical),
        horizontalHomePosition: parseFloat(editHorizontal),
      };
      await robotClient.setRobotConfig(fields);
      setConfig(fields);
      setEditVisible(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Homing */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>HOMING</Text>
        <TouchableOpacity
          onPress={openEdit}
          style={styles.editButton}
          disabled={!config}
        >
          <Pencil size={14} color="#2563eb" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <InfoRow
          icon={<Home size={16} color="#7c3aed" />}
          tileBg="#f5f3ff"
          label="Homing Speed"
          value={config ? `${config.homingSpeed} u/s` : "—"}
        />
        <InfoRow
          icon={<RotateCcw size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="J1 Home Offset"
          value={config ? `${config.j1HomeOffsetDeg}°` : "—"}
        />
        <InfoRow
          icon={<MoveVertical size={16} color="#16a34a" />}
          tileBg="#f0fdf4"
          label="Vertical Home Position"
          value={config ? `${config.verticalHomePosition} mm` : "—"}
        />
        <InfoRow
          icon={<MoveHorizontal size={16} color="#ea580c" />}
          tileBg="#fff7ed"
          label="Horizontal Home Position"
          value={config ? `${config.horizontalHomePosition} mm` : "—"}
          last
        />
      </View>

      {/* Edit modal */}
      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Homing Config</Text>

            <Text style={styles.editLabel}>HOMING SPEED (u/s)</Text>
            <TextInput
              style={styles.editInput}
              value={editHomingSpeed}
              onChangeText={setEditHomingSpeed}
              keyboardType="numeric"
              placeholder="20"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.editLabel}>J1 HOME OFFSET (°)</Text>
            <TextInput
              style={styles.editInput}
              value={editJ1Offset}
              onChangeText={setEditJ1Offset}
              keyboardType="numeric"
              placeholder="-17"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.editLabel}>VERTICAL HOME POSITION (mm)</Text>
            <TextInput
              style={styles.editInput}
              value={editVertical}
              onChangeText={setEditVertical}
              keyboardType="numeric"
              placeholder="445"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.editLabel}>HORIZONTAL HOME POSITION (mm)</Text>
            <TextInput
              style={styles.editInput}
              value={editHorizontal}
              onChangeText={setEditHorizontal}
              keyboardType="numeric"
              placeholder="413"
              placeholderTextColor="#9ca3af"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? "Saving…" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content:   { padding: 16, paddingBottom: 36 },

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

  // Modal
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
});
