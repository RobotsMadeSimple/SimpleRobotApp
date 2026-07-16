import { wide } from "@/src/components/ui/responsive";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  Gauge,
  Home,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  Zap,
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
  robotType: string;
  // ASTRO homing
  homingSpeed: number;
  j1HomeOffsetDeg: number;
  verticalHomePosition: number;
  horizontalHomePosition: number;
  verticalHomingDirection: number;
  horizontalHomingDirection: number;
  j1HomingDirection: number;
  j4HomeOffsetDeg: number;
  // Motor directions (shared)
  m1Direction: number;
  m2Direction: number;
  m3Direction: number;
  m4Direction: number;
  // Jog speeds
  jogSlowSpeed:   number;
  jogNormalSpeed: number;
  jogFastSpeed:   number;
  // CNC4Axis motor config
  cncStepsPerRevX:  number;
  cncStepsPerRevY:  number;
  cncStepsPerRevZ:  number;
  cncStepsPerRevRZ: number;
  cncMmPerRevX:     number;
  cncMmPerRevY:     number;
  cncMmPerRevZ:     number;
  cncDegPerRevRZ:   number;
  // CNC4Axis homing
  cncXHomePosition:   number;
  cncYHomePosition:   number;
  cncZHomePosition:   number;
  cncRzHomePosition:  number;
  cncXHomingDirection: number;
  cncYHomingDirection: number;
  cncZHomingDirection: number;
};

type EditingField = {
  label: string;
  type: "number" | "direction" | "homing" | "cncAxis";
  numKey?: keyof RobotConfig;
  numText: string;
  unit?: string;
  placeholder?: string;
  dirKey?: keyof RobotConfig;
  dirValue: number;
  // cncAxis only
  cncStepsKey?: keyof RobotConfig;
  cncStepsText?: string;
  cncMeasureKey?: keyof RobotConfig;
  cncMeasureText?: string;
  cncIsRotary?: boolean;
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

  useEffect(() => {
    robotClient.getRobotConfig().then(setConfig).catch(() => {});
  }, []);

  const isCNC = config?.robotType === "CNC4Axis";

  async function saveField() {
    if (!editing || !config) return;
    setSaving(true);
    try {
      const patch: any = {};
      if ((editing.type === "number" || editing.type === "homing") && editing.numKey)
        patch[editing.numKey] = parseFloat(editing.numText);
      if ((editing.type === "direction" || editing.type === "homing") && editing.dirKey)
        patch[editing.dirKey] = editing.dirValue;
      if (editing.type === "cncAxis") {
        if (editing.cncStepsKey)   patch[editing.cncStepsKey]   = parseInt(editing.cncStepsText  ?? "1600") || 1600;
        if (editing.cncMeasureKey) patch[editing.cncMeasureKey] = parseFloat(editing.cncMeasureText ?? "5") || 5;
      }
      await robotClient.setRobotConfig(patch);
      setConfig({ ...config, ...patch });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function dirLabel(v: number) {
    return v === 1 ? "+" : "−";
  }

  const motorRows: { key: keyof RobotConfig; label: string }[] = isCNC
    ? [
        { key: "m1Direction", label: "M1 — X Axis" },
        { key: "m2Direction", label: "M2 — Y Axis" },
        { key: "m3Direction", label: "M3 — Z Axis" },
        { key: "m4Direction", label: "M4 — RZ Spindle" },
      ]
    : [
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
        contentContainerStyle={[styles.content, wide.content]}
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

        {/* ── Homing — ASTRO ── */}
        {!isCNC && (
          <>
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
          </>
        )}

        {/* ── Homing — CNC4Axis ── */}
        {isCNC && (
          <>
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
                icon={<MoveHorizontal size={16} color="#16a34a" />}
                tileBg="#f0fdf4"
                label="X Home Position"
                value={config ? `${config.cncXHomePosition} mm · ${dirLabel(config.cncXHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "X Home Position", type: "homing",
                  numKey: "cncXHomePosition", numText: String(config.cncXHomePosition),
                  unit: "mm", placeholder: "0",
                  dirKey: "cncXHomingDirection", dirValue: config.cncXHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveHorizontal size={16} color="#ea580c" />}
                tileBg="#fff7ed"
                label="Y Home Position"
                value={config ? `${config.cncYHomePosition} mm · ${dirLabel(config.cncYHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "Y Home Position", type: "homing",
                  numKey: "cncYHomePosition", numText: String(config.cncYHomePosition),
                  unit: "mm", placeholder: "0",
                  dirKey: "cncYHomingDirection", dirValue: config.cncYHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveVertical size={16} color="#0891b2" />}
                tileBg="#ecfeff"
                label="Z Home Position"
                value={config ? `${config.cncZHomePosition} mm · ${dirLabel(config.cncZHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "Z Home Position", type: "homing",
                  numKey: "cncZHomePosition", numText: String(config.cncZHomePosition),
                  unit: "mm", placeholder: "0",
                  dirKey: "cncZHomingDirection", dirValue: config.cncZHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<RotateCcw size={16} color="#7c3aed" />}
                tileBg="#f5f3ff"
                label="RZ Home Angle"
                value={config ? `${config.cncRzHomePosition}°` : "—"}
                last
                onPress={config ? () => setEditing({
                  label: "RZ Home Angle", type: "number",
                  numKey: "cncRzHomePosition", numText: String(config.cncRzHomePosition),
                  unit: "°", placeholder: "0", dirValue: 1,
                }) : undefined}
              />
            </View>

            {/* ── Motor Setup (CNC only) ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>MOTOR SETUP</Text>
            </View>
            <View style={styles.card}>
              {([
                { label: "X Axis",    stepsKey: "cncStepsPerRevX"  as const, measureKey: "cncMmPerRevX"   as const, isRotary: false },
                { label: "Y Axis",    stepsKey: "cncStepsPerRevY"  as const, measureKey: "cncMmPerRevY"   as const, isRotary: false },
                { label: "Z Axis",    stepsKey: "cncStepsPerRevZ"  as const, measureKey: "cncMmPerRevZ"   as const, isRotary: false },
                { label: "RZ Spindle",stepsKey: "cncStepsPerRevRZ" as const, measureKey: "cncDegPerRevRZ" as const, isRotary: true  },
              ] as { label: string; stepsKey: keyof RobotConfig; measureKey: keyof RobotConfig; isRotary: boolean }[]).map(({ label, stepsKey, measureKey, isRotary }, idx, arr) => (
                <ConfigRow
                  key={stepsKey}
                  icon={<Gauge size={16} color="#7c3aed" />}
                  tileBg="#f5f3ff"
                  label={label}
                  value={config ? `${config[stepsKey]} spr · ${config[measureKey]} ${isRotary ? "°/rev" : "mm/rev"}` : "—"}
                  last={idx === arr.length - 1}
                  onPress={config ? () => setEditing({
                    label, type: "cncAxis",
                    numText: "", dirValue: 1,
                    cncStepsKey:   stepsKey,
                    cncStepsText:  String(config[stepsKey]),
                    cncMeasureKey: measureKey,
                    cncMeasureText: String(config[measureKey]),
                    cncIsRotary: isRotary,
                  }) : undefined}
                />
              ))}
            </View>
          </>
        )}

        {/* ── Jog Speeds ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>JOGGING</Text>
        </View>
        <View style={styles.card}>
          {([
            { key: "jogSlowSpeed"   as const, label: "Slow Speed"   },
            { key: "jogNormalSpeed" as const, label: "Normal Speed" },
            { key: "jogFastSpeed"   as const, label: "Fast Speed"   },
          ] as { key: keyof RobotConfig; label: string }[]).map(({ key, label }, idx, arr) => (
            <ConfigRow
              key={key}
              icon={<Gauge size={16} color="#16a34a" />}
              tileBg="#f0fdf4"
              label={label}
              value={config ? `${config[key]} u/s` : "—"}
              last={idx === arr.length - 1}
              onPress={config ? () => setEditing({
                label, type: "number",
                numKey: key, numText: String(config[key]),
                unit: "u/s", placeholder: "100", dirValue: 1,
              }) : undefined}
            />
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

              {editing?.type === "cncAxis" && (
                <>
                  <Text style={styles.editLabel}>STEPS PER REVOLUTION</Text>
                  <View style={styles.presetRow}>
                    {([
                      { label: "Full",  steps: 200  },
                      { label: "1/2",   steps: 400  },
                      { label: "1/4",   steps: 800  },
                      { label: "1/8",   steps: 1600 },
                      { label: "1/16",  steps: 3200 },
                    ] as const).map(({ label, steps }) => {
                      const active = editing.cncStepsText === String(steps);
                      return (
                        <TouchableOpacity
                          key={steps}
                          style={[styles.presetBtn, active && styles.presetBtnActive]}
                          onPress={() => setEditing(e => e ? { ...e, cncStepsText: String(steps) } : e)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.presetBtnLabel, active && styles.presetBtnLabelActive]}>{label}</Text>
                          <Text style={[styles.presetBtnSub, active && styles.presetBtnSubActive]}>{steps}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={styles.editInput}
                    value={editing.cncStepsText ?? ""}
                    onChangeText={v => setEditing(e => e ? { ...e, cncStepsText: v } : e)}
                    keyboardType="numeric"
                    placeholder="Custom"
                    placeholderTextColor="#9ca3af"
                  />
                  <Text style={[styles.editLabel, { marginTop: 8 }]}>
                    {editing.cncIsRotary ? "DEG PER REVOLUTION" : "MM PER REVOLUTION"}
                  </Text>
                  <TextInput
                    style={styles.editInput}
                    value={editing.cncMeasureText ?? ""}
                    onChangeText={v => setEditing(e => e ? { ...e, cncMeasureText: v } : e)}
                    keyboardType="decimal-pad"
                    placeholder={editing.cncIsRotary ? "360" : "5"}
                    placeholderTextColor="#9ca3af"
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

  // ── CNC preset picker ─────────────────────────────────────────────────────
  presetRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  presetBtn: {
    flex: 1,
    minWidth: 44,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  presetBtnActive: {
    borderColor: "#7c3aed",
    backgroundColor: "#f5f3ff",
  },
  presetBtnLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  presetBtnLabelActive: {
    color: "#7c3aed",
  },
  presetBtnSub: {
    fontSize: 10,
    color: "#9ca3af",
  },
  presetBtnSubActive: {
    color: "#a78bfa",
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
