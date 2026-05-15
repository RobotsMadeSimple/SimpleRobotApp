import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  CircuitBoard,
  Cpu,
  Home,
  MoveHorizontal,
  MoveVertical,
  Radio,
  RotateCcw,
  Zap,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
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
  verticalHomingDirection: number;
  horizontalHomingDirection: number;
  j1HomingDirection: number;
  j4HomeOffsetDeg: number;
  m1Direction: number;
  m2Direction: number;
  m3Direction: number;
  m4Direction: number;
  enableStbCard: boolean;
  enableNanoCards: boolean;
  enableRelayCard: boolean;
};

type EditingField = {
  label: string;
  type: "number" | "direction" | "homing";
  numKey?: keyof RobotConfig;
  numText: string;
  unit?: string;
  placeholder?: string;
  dirKey?: keyof RobotConfig;
  dirValue: number;
};

// ── Config row ────────────────────────────────────────────────────────────────

function ConfigRow({
  icon,
  tileBg,
  label,
  value,
  last = false,
  onPress,
}: {
  icon: React.ReactNode;
  tileBg?: string;
  label: string;
  value: string;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.infoRow, !last && styles.infoRowBorder]}
      onPress={onPress}
      activeOpacity={onPress ? 0.55 : 1}
      disabled={!onPress}
    >
      <View style={[styles.rowTile, { backgroundColor: tileBg ?? "#f3f4f6" }]}>
        {icon}
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

// ── Direction toggle ───────────────────────────────────────────────────────────

function DirectionToggle({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.dirToggleRow}>
      <TouchableOpacity
        style={[styles.dirBtn, value === -1 && styles.dirBtnActive]}
        onPress={() => onChange(-1)}
        activeOpacity={0.7}
      >
        <Text style={[styles.dirBtnText, value === -1 && styles.dirBtnTextActive]}>−</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.dirBtn, value === 1 && styles.dirBtnActive]}
        onPress={() => onChange(1)}
        activeOpacity={0.7}
      >
        <Text style={[styles.dirBtnText, value === 1 && styles.dirBtnTextActive]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConfigureRobot() {
  const [config, setConfig] = useState<RobotConfig | null>(null);
  const [editing, setEditing] = useState<EditingField | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCards, setSavingCards] = useState(false);

  useEffect(() => {
    robotClient.getRobotConfig().then(setConfig).catch(() => {});
  }, []);

  async function saveField() {
    if (!editing || !config) return;
    setSaving(true);
    try {
      const patch: any = {};
      if ((editing.type === "number" || editing.type === "homing") && editing.numKey)
        patch[editing.numKey] = parseFloat(editing.numText);
      if ((editing.type === "direction" || editing.type === "homing") && editing.dirKey)
        patch[editing.dirKey] = editing.dirValue;
      await robotClient.setRobotConfig(patch);
      setConfig({ ...config, ...patch });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCard(
    field: "enableStbCard" | "enableNanoCards" | "enableRelayCard",
    value: boolean
  ) {
    if (!config || savingCards) return;
    setSavingCards(true);
    try {
      const updated = { ...config, [field]: value };
      await robotClient.setRobotConfig({ [field]: value });
      setConfig(updated);
    } finally {
      setSavingCards(false);
    }
  }

  function dirLabel(v: number) {
    return v === 1 ? "+" : "−";
  }

  const motorRows: { key: keyof RobotConfig; label: string }[] = [
    { key: "m1Direction", label: "M1 — J1 Rotation" },
    { key: "m2Direction", label: "M2 — CoreXY A" },
    { key: "m3Direction", label: "M3 — CoreXY B" },
    { key: "m4Direction", label: "M4 — J4 Rotation" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader title="Configure Robot" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Motor Directions ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>MOTOR DIRECTIONS</Text>
        </View>
        <View style={styles.card}>
          {motorRows.map(({ key, label }, idx) => (
            <ConfigRow
              key={key}
              icon={<Zap size={16} color="#d97706" />}
              tileBg="#fffbeb"
              label={label}
              value={config ? dirLabel(config[key] as number) : "—"}
              last={idx === motorRows.length - 1}
              onPress={config ? () => setEditing({
                label,
                type: "direction",
                dirKey: key,
                dirValue: config[key] as number,
                numText: "",
              }) : undefined}
            />
          ))}
        </View>

        {/* ── Homing ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>HOMING</Text>
        </View>
        <View style={styles.card}>
          <ConfigRow
            icon={<Home size={16} color="#7c3aed" />}
            tileBg="#f5f3ff"
            label="Homing Speed"
            value={config ? `${config.homingSpeed} u/s` : "—"}
            onPress={config ? () => setEditing({
              label: "Homing Speed", type: "number",
              numKey: "homingSpeed", numText: String(config.homingSpeed),
              unit: "u/s", placeholder: "20", dirValue: 1,
            }) : undefined}
          />
          <ConfigRow
            icon={<RotateCcw size={16} color="#0891b2" />}
            tileBg="#ecfeff"
            label="J1 Homing"
            value={config ? `${config.j1HomeOffsetDeg}° · ${dirLabel(config.j1HomingDirection)}` : "—"}
            onPress={config ? () => setEditing({
              label: "J1 Homing", type: "homing",
              numKey: "j1HomeOffsetDeg", numText: String(config.j1HomeOffsetDeg),
              unit: "°", placeholder: "-17",
              dirKey: "j1HomingDirection", dirValue: config.j1HomingDirection,
            }) : undefined}
          />
          <ConfigRow
            icon={<MoveVertical size={16} color="#16a34a" />}
            tileBg="#f0fdf4"
            label="Vertical Homing"
            value={config ? `${config.verticalHomePosition} mm · ${dirLabel(config.verticalHomingDirection)}` : "—"}
            onPress={config ? () => setEditing({
              label: "Vertical Homing", type: "homing",
              numKey: "verticalHomePosition", numText: String(config.verticalHomePosition),
              unit: "mm", placeholder: "445",
              dirKey: "verticalHomingDirection", dirValue: config.verticalHomingDirection,
            }) : undefined}
          />
          <ConfigRow
            icon={<MoveHorizontal size={16} color="#ea580c" />}
            tileBg="#fff7ed"
            label="Horizontal Homing"
            value={config ? `${config.horizontalHomePosition} mm · ${dirLabel(config.horizontalHomingDirection)}` : "—"}
            onPress={config ? () => setEditing({
              label: "Horizontal Homing", type: "homing",
              numKey: "horizontalHomePosition", numText: String(config.horizontalHomePosition),
              unit: "mm", placeholder: "413",
              dirKey: "horizontalHomingDirection", dirValue: config.horizontalHomingDirection,
            }) : undefined}
          />
          <ConfigRow
            icon={<RotateCcw size={16} color="#7c3aed" />}
            tileBg="#f5f3ff"
            label="J4 Home Offset"
            value={config ? `${config.j4HomeOffsetDeg}°` : "—"}
            last
            onPress={config ? () => setEditing({
              label: "J4 Home Offset", type: "number",
              numKey: "j4HomeOffsetDeg", numText: String(config.j4HomeOffsetDeg),
              unit: "°", placeholder: "0", dirValue: 1,
            }) : undefined}
          />
        </View>

        {/* ── IO Cards ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>IO CARDS</Text>
        </View>
        <View style={styles.card}>
          {[
            { field: "enableStbCard"   as const, icon: <CircuitBoard size={16} color="#16a34a" />, tileBg: "#f0fdf4", label: "STB4100 Robot IO Board" },
            { field: "enableNanoCards" as const, icon: <Cpu size={16} color="#4f46e5" />,          tileBg: "#eef2ff", label: "Arduino Nano Devices" },
            { field: "enableRelayCard" as const, icon: <Radio size={16} color="#0891b2" />,        tileBg: "#ecfeff", label: "USB Relay Board" },
          ].map(({ field, icon, tileBg, label }, idx, arr) => (
            <View key={field} style={[styles.infoRow, idx < arr.length - 1 && styles.infoRowBorder]}>
              <View style={[styles.rowTile, { backgroundColor: tileBg }]}>{icon}</View>
              <Text style={[styles.infoLabel, { flex: 1 }]}>{label}</Text>
              <Switch
                value={config ? config[field] : false}
                onValueChange={v => toggleCard(field, v)}
                disabled={!config || savingCards}
                trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        {/* ── Edit modal ── */}
        <Modal
          visible={editing !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditing(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing?.label}</Text>

              {(editing?.type === "number" || editing?.type === "homing") && (
                <>
                  <Text style={styles.editLabel}>
                    {editing.unit ? `OFFSET (${editing.unit})` : "VALUE"}
                  </Text>
                  <TextInput
                    style={styles.editInput}
                    value={editing.numText}
                    onChangeText={v => setEditing(e => e ? { ...e, numText: v } : e)}
                    keyboardType="numeric"
                    placeholder={editing.placeholder ?? "0"}
                    placeholderTextColor="#9ca3af"
                    autoFocus={editing.type === "number"}
                  />
                </>
              )}

              {(editing?.type === "direction" || editing?.type === "homing") && (
                <>
                  <Text style={styles.editLabel}>DIRECTION</Text>
                  <DirectionToggle
                    value={editing.dirValue}
                    onChange={v => setEditing(e => e ? { ...e, dirValue: v } : e)}
                  />
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setEditing(null)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && { opacity: 0.6 }]}
                  onPress={saveField}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content:   { padding: 16, paddingBottom: 36 },

  sectionHeader: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
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

  // ── Modal ──────────────────────────────────────────────────────────────────
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

  // ── Direction toggle ───────────────────────────────────────────────────────
  dirToggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  dirBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  dirBtnActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  dirBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#9ca3af",
  },
  dirBtnTextActive: {
    color: "#2563eb",
  },

  // ── Modal buttons ──────────────────────────────────────────────────────────
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
