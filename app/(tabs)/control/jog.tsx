import JogPad from "@/src/components/ui/JogPad";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { usePoints, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, Tabs } from "expo-router";
import {
  ArrowRight,
  ChevronDown,
  Grid2X2,
  MousePointerClick,
  Move,
  OctagonX,
  Plus,
  Rotate3d,
  Search,
  Wrench,
  X,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Picker modal ──────────────────────────────────────────────────────────────
function PickerModal({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  viewLabel,
  viewRoute,
}: {
  visible: boolean;
  title: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  viewLabel?: string;
  viewRoute?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={styles.pickerCard} onPress={() => {}} activeOpacity={1}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {options.map((opt, i) => {
              const active = opt === value;
              const isLast = i === options.length - 1;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.pickerRow, !isLast && styles.pickerRowBorder, active && styles.pickerRowActive]}
                  onPress={() => { onSelect(opt); onClose(); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radioRing, active && styles.radioRingActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.pickerRowText, active && styles.pickerRowTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {viewLabel && viewRoute && (
            <TouchableOpacity
              style={styles.pickerViewLink}
              onPress={() => { onClose(); router.push(viewRoute as any); }}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerViewLinkText}>{viewLabel}</Text>
              <ArrowRight size={14} color="#2563eb" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Selector ──────────────────────────────────────────────────────────────────
function Selector({
  label,
  value,
  options,
  onSelect,
  icon,
  viewLabel,
  viewRoute,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  icon?: React.ReactNode;
  viewLabel?: string;
  viewRoute?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.selectorWrap}>
      <TouchableOpacity style={styles.selectorBtn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        {icon && <View style={styles.selectorIcon}>{icon}</View>}
        <View style={styles.selectorTextStack}>
          <Text style={styles.selectorLabel}>{label}</Text>
          <View style={styles.selectorValueRow}>
            <Text style={styles.selectorValue}>{value}</Text>
            <ChevronDown size={13} color="#9ca3af" />
          </View>
        </View>
      </TouchableOpacity>

      <PickerModal
        visible={open}
        title={label}
        options={options}
        value={value}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
        viewLabel={viewLabel}
        viewRoute={viewRoute}
      />
    </View>
  );
}

// ── Teach modal ───────────────────────────────────────────────────────────────
function TeachModal({ onClose }: { onClose: () => void }) {
  const points = usePoints();
  const [mode, setMode] = useState<"list" | "new">("list");
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  const filtered = points.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function teachPoint(name: string) {
    robotClient.sendCommand("TeachPoint", { name });
    onClose();
  }

  function teachNew() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    robotClient.sendCommand("TeachPoint", { name: trimmed });
    onClose();
  }

  return (
    <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
      <TouchableOpacity style={styles.dialog} onPress={() => {}} activeOpacity={1}>
        <View style={styles.dialogHeader}>
          <Text style={styles.dialogTitle}>
            {mode === "list" ? "Teach Point" : "New Point"}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
            <X size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {mode === "list" ? (
          <>
            <View style={styles.searchRow}>
              <Search size={15} color="#9ca3af" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search points…"
                placeholderTextColor="#9ca3af"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={styles.pointList} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 && (
                <Text style={styles.emptyText}>
                  {points.length === 0 ? "No points saved yet" : "No matches"}
                </Text>
              )}
              {filtered.map((p) => (
                <TouchableOpacity key={p.name} style={styles.pointRow} onPress={() => teachPoint(p.name)} activeOpacity={0.7}>
                  <Text style={styles.pointName}>{p.name}</Text>
                  <Text style={styles.pointCoords}>
                    {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.newPointButton} onPress={() => setMode("new")} activeOpacity={0.7}>
              <Plus size={16} color="#2563eb" />
              <Text style={styles.newPointText}>New Point</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.inputLabel}>Point name</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. PickUp1"
              placeholderTextColor="#9ca3af"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={teachNew}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setMode("list")} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !newName.trim() && styles.disabled]}
                onPress={teachNew}
                disabled={!newName.trim()}
                activeOpacity={0.7}
              >
                <MousePointerClick size={15} color="white" />
                <Text style={styles.modalConfirmText}>Teach Here</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function JogScreen() {
  const [local, setLocal]               = useState("Global");
  const [selectedSpeed, setSelectedSpeed] = useState("Slow");
  const [mode, setMode]                 = useState("XYZ");
  const [teachOpen, setTeachOpen]       = useState(false);

  const tools      = useTools();
  const status     = useRobotStatus();
  const activeTool = status.activeTool;

  const [tool, setToolLocal] = useState(activeTool || "None");

  function setTool(name: string) {
    setToolLocal(name);
    robotClient.setActiveTool(name);
  }

  const s = status;

  const fmt          = (v?: number) => (v ?? 0).toFixed(1);
  const speedOptions = ["0.1mm", "1mm", "10mm", "Slow", "Normal", "Fast"];

  const jogModes = [
    { key: "XYZ",   icon: (active: boolean) => <Move    size={17} color={active ? "#fff" : "#6b7280"} /> },
    { key: "Tool",  icon: (active: boolean) => <Move    size={17} color={active ? "#fff" : "#6b7280"} /> },
    { key: "Joint", icon: (active: boolean) => <Rotate3d size={17} color={active ? "#fff" : "#6b7280"} /> },
  ];

  // Keep local selector in sync when active tool changes externally
  useEffect(() => {
    setToolLocal(activeTool || "None");
  }, [activeTool]);

  const coords = mode === "Joint"
    ? [
        { label: "J1", value: s?.joint1Angle, unit: "°" },
        { label: "J2", value: s?.joint2X,     unit: "mm" },
        { label: "J3", value: s?.joint2Z,     unit: "mm" },
        { label: "J4", value: s?.joint4Angle, unit: "°" },
      ]
    : [
        { label: "X",  value: s?.x,  unit: "mm" },
        { label: "Y",  value: s?.y,  unit: "mm" },
        { label: "Z",  value: s?.z,  unit: "mm" },
        { label: "RZ", value: s?.rz, unit: "°"  },
      ];

  return (
    <View style={styles.container}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <SubPageHeader title="Jog & Teach" />

      {/* ── Scrollable area: position + controls + jogpad ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Position card */}
        <View style={styles.card}>
          <View style={styles.coordRow}>
            {coords.map(({ label, value, unit }) => (
              <View key={label} style={styles.coordCell}>
                <Text style={styles.coordLabel}>{label}</Text>
                <Text style={styles.coordValue}>{fmt(value)}</Text>
                <Text style={styles.coordUnit}>{unit}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Controls card (selectors + mode + speed) */}
        <View style={styles.card}>

          {/* Local / Tool row */}
          <View style={styles.selectorsRow}>
            <Selector
              label="LOCAL"
              value={local}
              options={["Global", "Local1"]}
              onSelect={setLocal}
              icon={<Grid2X2 size={15} color="#6b7280" />}
              viewLabel="View Locals"
              viewRoute="/space/locals"
            />
            <View style={styles.cardDivider} />
            <Selector
              label="TOOL"
              value={tool || "None"}
              options={["None", ...tools.map(t => t.name)]}
              onSelect={setTool}
              icon={<Wrench size={15} color="#6b7280" />}
              viewLabel="View Tools"
              viewRoute="/space/tools"
            />
          </View>

          <View style={styles.cardSeparator} />

          {/* Jog mode */}
          <View style={styles.segmentRow}>
            {jogModes.map(({ key, icon }) => {
              const active = mode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.segment, active && styles.segmentActive]}
                  onPress={() => setMode(key)}
                  activeOpacity={0.8}
                >
                  {icon(active)}
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.cardSeparator} />

          {/* Speed */}
          <View style={styles.chipRow}>
            {speedOptions.map((spd) => {
              const active = selectedSpeed === spd;
              return (
                <TouchableOpacity
                  key={spd}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedSpeed(spd)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{spd}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

        </View>

        {/* JogPad */}
        <View style={styles.jogWrapper}>
          <JogPad jogMode={mode} selectedSpeed={selectedSpeed} />
        </View>
      </ScrollView>

      {/* ── Fixed bottom row: STOP + Teach ── */}
      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.stopButton} onPress={() => robotClient.sendCommand("HardStop")} activeOpacity={0.8}>
          <OctagonX size={22} color="white" />
          <Text style={styles.stopText}>STOP</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.teachButton} onPress={() => setTeachOpen(true)} activeOpacity={0.8}>
          <MousePointerClick size={18} color="#2563eb" />
          <Text style={styles.teachButtonText}>Teach</Text>
        </TouchableOpacity>
      </View>

      {/* ── Teach modal ── */}
      <Modal
        visible={teachOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTeachOpen(false)}
      >
        <TeachModal key={teachOpen ? "open" : "closed"} onClose={() => setTeachOpen(false)} />
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 16,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  selectorsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  cardDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#e5e7eb",
    marginHorizontal: 4,
  },

  cardSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 1,
    marginBottom: 10,
  },

  // ── Position ──────────────────────────────────────────────────────────────
  coordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  coordCell: {
    alignItems: "center",
    flex: 1,
  },

  coordLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.5,
    marginBottom: 4,
  },

  coordValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    fontFamily: "monospace",
  },

  coordUnit: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // ── Selector ──────────────────────────────────────────────────────────────
  selectorWrap: {
    flex: 1,
    position: "relative",
  },

  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },

  selectorIcon: {
    opacity: 0.7,
  },

  selectorTextStack: {
    alignItems: "flex-start",
    gap: 2,
  },

  selectorLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.8,
  },

  selectorValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  selectorValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },

  // ── Picker modal ──────────────────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },

  pickerCard: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "70%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },

  pickerViewLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },

  pickerViewLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },

  pickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },

  pickerRowActive: {
    // no background tint needed — radio dot communicates state
  },

  pickerRowText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },

  pickerRowTextActive: {
    fontWeight: "700",
    color: "#2563eb",
  },

  radioRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },

  radioRingActive: {
    borderColor: "#2563eb",
  },

  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
  },

  // ── Segmented control ─────────────────────────────────────────────────────
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
  },

  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },

  segmentActive: {
    backgroundColor: "#2563eb",
  },

  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },

  segmentTextActive: {
    color: "#fff",
  },

  // ── Speed chips ───────────────────────────────────────────────────────────
  chipRow: {
    flexDirection: "row",
    gap: 6,
  },

  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },

  chipActive: {
    backgroundColor: "#2563eb",
  },

  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },

  chipTextActive: {
    color: "#fff",
  },

  // ── JogPad ────────────────────────────────────────────────────────────────
  jogWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  // ── Bottom row (fixed) ────────────────────────────────────────────────────
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: "#f3f4f6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },

  stopButton: {
    flex: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 15,
  },

  stopText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 2,
  },

  teachButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 15,
    backgroundColor: "#eff6ff",
  },

  teachButtonText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Teach modal ───────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    width: 300,
    maxHeight: 600,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },

  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111",
    padding: 0,
  },

  pointList: {
    maxHeight: 200,
  },

  pointRow: {
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },

  pointName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },

  pointCoords: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "monospace",
    marginTop: 2,
  },

  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 20,
    fontSize: 14,
  },

  newPointButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    marginTop: 4,
  },

  newPointText: {
    fontSize: 14,
    color: "#2563eb",
    fontWeight: "600",
  },

  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  textInput: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111",
    backgroundColor: "#f9fafb",
    marginBottom: 14,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
  },

  modalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },

  modalCancelText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "500",
  },

  modalConfirm: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 11,
  },

  modalConfirmText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },

  disabled: {
    opacity: 0.4,
  },
});
