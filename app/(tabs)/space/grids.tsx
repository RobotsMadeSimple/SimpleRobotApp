import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { Grid } from "@/src/models/robotModels";
import { useGrids, usePoints } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  ChevronRight,
  Grid3x3,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Local input helpers ───────────────────────────────────────────────────────

function SignedNumberInput({
  value,
  onChange,
  style,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  style?: any;
  placeholder?: string;
}) {
  const [text, setText] = useState(String(value));
  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        const s = raw.replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, "");
        setText(s);
        const n = parseFloat(s);
        if (!isNaN(n)) onChange(n);
        else if (s === "" || s === "-") onChange(0);
      }}
      keyboardType="numbers-and-punctuation"
      placeholder={placeholder ?? "0"}
      placeholderTextColor="#9ca3af"
    />
  );
}

function OptionalCountInput({
  value,
  onChange,
  style,
}: {
  value?: number;
  onChange: (n: number | undefined) => void;
  style?: any;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");
  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        const s = raw.replace(/[^0-9]/g, "");
        setText(s);
        if (s === "") onChange(undefined);
        else {
          const n = parseInt(s, 10);
          if (!isNaN(n)) onChange(n);
        }
      }}
      keyboardType="numeric"
      placeholder="unlimited"
      placeholderTextColor="#9ca3af"
    />
  );
}

// ── Default grid factory ──────────────────────────────────────────────────────

function makeDefaultGrid(): Grid {
  return {
    id: "",
    name: "",
    basePointName: "",
    rowOffsetX: 0, rowOffsetY: 0, rowOffsetZ: 0,
    colOffsetX: 0, colOffsetY: 0, colOffsetZ: 0,
    rowCount: undefined,
    colCount: undefined,
    rotation: 0,
    lastUpdatedUnixMs: 0,
  };
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function GridEditModal({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: Grid | null;
  onSave: (g: Grid) => void;
  onClose: () => void;
}) {
  const points = usePoints();
  const [draft, setDraft] = useState<Grid>(makeDefaultGrid());
  const [pointPickerOpen, setPointPickerOpen] = useState(false);

  // Sync draft when modal opens
  React.useEffect(() => {
    if (visible) {
      setDraft(initial ? { ...initial } : makeDefaultGrid());
    }
  }, [visible, initial]);

  const set = (fields: Partial<Grid>) => setDraft(d => ({ ...d, ...fields }));

  function handleSave() {
    if (!draft.name.trim()) return;
    onSave(draft);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={gs.overlay} onPress={onClose}>
          <Pressable style={gs.editCard} onPress={() => {}}>
            {/* Header */}
            <View style={gs.editHeader}>
              <Text style={gs.editTitle}>{initial ? "Edit Grid" : "New Grid"}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Name */}
              <Text style={gs.fieldLabel}>NAME</Text>
              <TextInput
                style={gs.input}
                value={draft.name}
                onChangeText={v => set({ name: v })}
                placeholder="e.g. Pallet A"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* Base Point */}
              <Text style={[gs.fieldLabel, { marginTop: 12 }]}>BASE POINT</Text>
              <TouchableOpacity
                style={[gs.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                onPress={() => setPointPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={[{ fontSize: 14 }, draft.basePointName ? { color: "#111827" } : { color: "#9ca3af" }]}>
                  {draft.basePointName || "Select point…"}
                </Text>
                <ChevronRight size={16} color="#d1d5db" />
              </TouchableOpacity>

              {/* Row Offsets */}
              <Text style={[gs.fieldLabel, { marginTop: 12 }]}>ROW OFFSET  (mm per row step)</Text>
              <View style={gs.threeCol}>
                <View style={gs.threeColItem}>
                  <Text style={gs.axisLabel}>X</Text>
                  <SignedNumberInput
                    value={draft.rowOffsetX}
                    onChange={v => set({ rowOffsetX: v })}
                    style={gs.input}
                  />
                </View>
                <View style={gs.threeColItem}>
                  <Text style={gs.axisLabel}>Y</Text>
                  <SignedNumberInput
                    value={draft.rowOffsetY}
                    onChange={v => set({ rowOffsetY: v })}
                    style={gs.input}
                  />
                </View>
                <View style={gs.threeColItem}>
                  <Text style={gs.axisLabel}>Z</Text>
                  <SignedNumberInput
                    value={draft.rowOffsetZ}
                    onChange={v => set({ rowOffsetZ: v })}
                    style={gs.input}
                  />
                </View>
              </View>

              {/* Col Offsets */}
              <Text style={[gs.fieldLabel, { marginTop: 12 }]}>COLUMN OFFSET  (mm per column step)</Text>
              <View style={gs.threeCol}>
                <View style={gs.threeColItem}>
                  <Text style={gs.axisLabel}>X</Text>
                  <SignedNumberInput
                    value={draft.colOffsetX}
                    onChange={v => set({ colOffsetX: v })}
                    style={gs.input}
                  />
                </View>
                <View style={gs.threeColItem}>
                  <Text style={gs.axisLabel}>Y</Text>
                  <SignedNumberInput
                    value={draft.colOffsetY}
                    onChange={v => set({ colOffsetY: v })}
                    style={gs.input}
                  />
                </View>
                <View style={gs.threeColItem}>
                  <Text style={gs.axisLabel}>Z</Text>
                  <SignedNumberInput
                    value={draft.colOffsetZ}
                    onChange={v => set({ colOffsetZ: v })}
                    style={gs.input}
                  />
                </View>
              </View>

              {/* Row / Col count */}
              <View style={gs.twoCol}>
                <View style={gs.twoColItem}>
                  <Text style={[gs.fieldLabel, { marginTop: 12 }]}>ROW COUNT</Text>
                  <OptionalCountInput
                    value={draft.rowCount}
                    onChange={v => set({ rowCount: v })}
                    style={gs.input}
                  />
                </View>
                <View style={gs.twoColItem}>
                  <Text style={[gs.fieldLabel, { marginTop: 12 }]}>COLUMN COUNT</Text>
                  <OptionalCountInput
                    value={draft.colCount}
                    onChange={v => set({ colCount: v })}
                    style={gs.input}
                  />
                </View>
              </View>

              {/* Rotation */}
              <Text style={[gs.fieldLabel, { marginTop: 12 }]}>ROTATION  (°)</Text>
              <SignedNumberInput
                value={draft.rotation}
                onChange={v => set({ rotation: v })}
                style={gs.input}
                placeholder="0"
              />

              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Actions */}
            <View style={gs.editActions}>
              <TouchableOpacity style={gs.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={gs.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[gs.saveBtn, !draft.name.trim() && { opacity: 0.5 }]}
                onPress={handleSave}
                activeOpacity={0.7}
              >
                <Text style={gs.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      {/* Base point picker modal */}
      <Modal visible={pointPickerOpen} transparent animationType="fade" onRequestClose={() => setPointPickerOpen(false)}>
        <Pressable style={gs.overlay} onPress={() => setPointPickerOpen(false)}>
          <Pressable style={gs.pickerCard} onPress={() => {}}>
            <View style={gs.pickerHeader}>
              <Text style={gs.pickerTitle}>Select Base Point</Text>
              <TouchableOpacity onPress={() => setPointPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {points.length === 0 && (
                <Text style={gs.emptyHint}>No points saved yet.</Text>
              )}
              {points.map((p, i) => {
                const active = draft.basePointName === p.name;
                return (
                  <TouchableOpacity
                    key={p.name}
                    style={[gs.pickerRow, i < points.length - 1 && gs.pickerRowBorder, active && gs.pickerRowActive]}
                    onPress={() => {
                      set({ basePointName: p.name });
                      setPointPickerOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[gs.radioRing, active && gs.radioRingActive]}>
                      {active && <View style={gs.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[gs.pickerRowLabel, active && { color: "#2563eb" }]}>{p.name}</Text>
                      <Text style={gs.pickerRowDesc}>{p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function GridsPage() {
  const grids = useGrids();
  const [editTarget, setEditTarget] = useState<Grid | null | "new">(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function handleSave(g: Grid) {
    robotClient.saveGrid(g).catch(() => {});
  }

  function handleDelete(id: string) {
    robotClient.deleteGrid(id).catch(() => {});
    setConfirmDeleteId(null);
  }

  const renderItem = ({ item }: { item: Grid }) => (
    <TouchableOpacity
      style={gs.gridRow}
      onPress={() => setEditTarget(item)}
      activeOpacity={0.7}
    >
      <View style={gs.gridIconTile}>
        <Grid3x3 size={18} color="#d97706" />
      </View>
      <View style={gs.gridRowText}>
        <Text style={gs.gridRowName}>{item.name}</Text>
        <Text style={gs.gridRowDesc} numberOfLines={1}>
          Base: {item.basePointName || "—"}
          {"  ·  "}
          Row ({item.rowOffsetX}, {item.rowOffsetY}, {item.rowOffsetZ})
          {"  ·  "}
          Col ({item.colOffsetX}, {item.colOffsetY}, {item.colOffsetZ})
          {item.rowCount != null || item.colCount != null
            ? `  ·  ${item.rowCount ?? "∞"} × ${item.colCount ?? "∞"}`
            : ""}
        </Text>
      </View>
      <TouchableOpacity
        style={gs.gridDeleteBtn}
        onPress={() => setConfirmDeleteId(item.id)}
        hitSlop={8}
        activeOpacity={0.7}
      >
        <Trash2 size={15} color="#ef4444" />
      </TouchableOpacity>
      <ChevronRight size={16} color="#d1d5db" />
    </TouchableOpacity>
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <SubPageHeader
        title="Grids"
        right={
          <TouchableOpacity
            onPress={() => setEditTarget("new")}
            hitSlop={8}
            activeOpacity={0.7}
            style={gs.addBtn}
          >
            <Plus size={20} color="#2563eb" />
          </TouchableOpacity>
        }
      />

      <FlatList
        data={grids}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={gs.listContent}
        ListEmptyComponent={
          <View style={gs.emptyContainer}>
            <Grid3x3 size={40} color="#d1d5db" />
            <Text style={gs.emptyTitle}>No Grids</Text>
            <Text style={gs.emptyBody}>
              Tap the + button to define a 2D position array.
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={gs.separator} />}
      />

      {/* Edit / Add Modal */}
      <GridEditModal
        visible={editTarget !== null}
        initial={editTarget === "new" ? null : editTarget}
        onSave={handleSave}
        onClose={() => setEditTarget(null)}
      />

      {/* Confirm Delete Modal */}
      <Modal
        visible={confirmDeleteId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDeleteId(null)}
      >
        <Pressable style={gs.overlay} onPress={() => setConfirmDeleteId(null)}>
          <Pressable style={gs.confirmCard} onPress={() => {}}>
            <Trash2 size={26} color="#dc2626" />
            <Text style={gs.confirmTitle}>Delete Grid?</Text>
            <Text style={gs.confirmBody}>
              {grids.find(g => g.id === confirmDeleteId)?.name ?? ""}
              {"\n"}This cannot be undone.
            </Text>
            <View style={gs.confirmButtons}>
              <TouchableOpacity
                style={gs.confirmCancel}
                onPress={() => setConfirmDeleteId(null)}
                activeOpacity={0.7}
              >
                <Text style={gs.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={gs.confirmDelete}
                onPress={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                activeOpacity={0.7}
              >
                <Text style={gs.confirmDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  addBtn: {
    padding: 4,
  },

  // ── List ──────────────────────────────────────────────────────────────────
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    marginBottom: 10,
  },
  gridIconTile: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
  },
  gridRowText: {
    flex: 1,
    gap: 2,
  },
  gridRowName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  gridRowDesc: {
    fontSize: 11,
    color: "#9ca3af",
  },
  gridDeleteBtn: {
    padding: 4,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: "center",
    marginTop: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  emptyBody: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // ── Edit modal ────────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  editCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    maxHeight: "90%",
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  axisLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 3,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  threeCol: {
    flexDirection: "row",
    gap: 8,
  },
  threeColItem: {
    flex: 1,
  },
  twoCol: {
    flexDirection: "row",
    gap: 12,
  },
  twoColItem: {
    flex: 1,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "500",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },

  // ── Point picker modal ────────────────────────────────────────────────────
  pickerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 300,
    alignSelf: "center",
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  pickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  pickerRowActive: {
    backgroundColor: "#eff6ff",
  },
  pickerRowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  pickerRowDesc: {
    fontSize: 11,
    color: "#9ca3af",
    fontFamily: "monospace",
    marginTop: 1,
  },
  radioRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },
  radioRingActive: {
    borderColor: "#2563eb",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },
  emptyHint: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    padding: 20,
  },

  // ── Confirm delete modal ──────────────────────────────────────────────────
  confirmCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    width: 280,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 4,
  },
  confirmBody: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  confirmButtons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  confirmCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmCancelText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "500",
  },
  confirmDelete: {
    flex: 1,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  confirmDeleteText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
