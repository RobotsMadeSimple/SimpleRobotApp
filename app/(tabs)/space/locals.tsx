import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useLocals, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  Check,
  Edit2,
  Grid3x3,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import { useRef, useState } from "react";
import {
  Alert,
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

// ── Types ──────────────────────────────────────────────────────────────────────

type LocalDraft = {
  name: string;
  description: string;
  x: string; y: string; z: string;
  rx: string; ry: string; rz: string;
};

const EMPTY_DRAFT: LocalDraft = {
  name: "", description: "",
  x: "0", y: "0", z: "0",
  rx: "0", ry: "0", rz: "0",
};

// ── Coordinate field ──────────────────────────────────────────────────────────

function CoordField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.coordField}>
      <Text style={styles.coordFieldLabel}>{label}</Text>
      <TextInput
        style={styles.coordInput}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
        placeholderTextColor="#9ca3af"
      />
    </View>
  );
}

// ── Local form modal ───────────────────────────────────────────────────────────

function LocalFormModal({
  visible,
  title,
  draft,
  onChangeDraft,
  onSave,
  onClose,
  onTeach,
}: {
  visible: boolean;
  title: string;
  draft: LocalDraft;
  onChangeDraft: (d: LocalDraft) => void;
  onSave: () => void;
  onClose: () => void;
  onTeach: () => void;
}) {
  const set = (k: keyof LocalDraft) => (v: string) =>
    onChangeDraft({ ...draft, [k]: v });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOuter}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>

            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Name */}
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={draft.name}
                onChangeText={set("name")}
                placeholder="e.g. Workbench A"
                placeholderTextColor="#9ca3af"
                returnKeyType="next"
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={styles.textInput}
                value={draft.description}
                onChangeText={set("description")}
                placeholder="Optional"
                placeholderTextColor="#9ca3af"
                returnKeyType="next"
              />

              {/* Teach from current position */}
              <TouchableOpacity style={styles.teachBtn} onPress={onTeach} activeOpacity={0.7}>
                <Grid3x3 size={14} color="#7c3aed" />
                <Text style={styles.teachBtnText}>Teach from current robot position</Text>
              </TouchableOpacity>

              {/* Position */}
              <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Offset (mm / °)</Text>
              <View style={styles.coordGrid}>
                <CoordField label="X"  value={draft.x}  onChange={set("x")}  />
                <CoordField label="Y"  value={draft.y}  onChange={set("y")}  />
                <CoordField label="Z"  value={draft.z}  onChange={set("z")}  />
                <CoordField label="RX" value={draft.rx} onChange={set("rx")} />
                <CoordField label="RY" value={draft.ry} onChange={set("ry")} />
                <CoordField label="RZ" value={draft.rz} onChange={set("rz")} />
              </View>

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirm, !draft.name.trim() && styles.disabled]}
                  onPress={onSave}
                  disabled={!draft.name.trim()}
                  activeOpacity={0.7}
                >
                  <Check size={15} color="white" />
                  <Text style={styles.modalConfirmText}>Save</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocalsPage() {
  const locals      = useLocals();
  const status      = useRobotStatus();
  const activeLocal = status.activeLocal;

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen,   setEditOpen]   = useState(false);
  const [draft,      setDraft]      = useState<LocalDraft>(EMPTY_DRAFT);
  const editingName = useRef<string>("");

  // ── Helpers ────────────────────────────────────────────────────────────────

  function parseDraft(d: LocalDraft) {
    return {
      name:        d.name.trim(),
      description: d.description.trim() || undefined,
      x:  parseFloat(d.x)  || 0,
      y:  parseFloat(d.y)  || 0,
      z:  parseFloat(d.z)  || 0,
      rx: parseFloat(d.rx) || 0,
      ry: parseFloat(d.ry) || 0,
      rz: parseFloat(d.rz) || 0,
    };
  }

  function teachCurrentPosition() {
    setDraft(d => ({
      ...d,
      x:  String(+status.x.toFixed(3)),
      y:  String(+status.y.toFixed(3)),
      z:  String(+status.z.toFixed(3)),
      rx: String(+status.rx.toFixed(3)),
      ry: String(+status.ry.toFixed(3)),
      rz: String(+status.rz.toFixed(3)),
    }));
  }

  function handleCreate() {
    const p = parseDraft(draft);
    robotClient.createLocal(p);
    setCreateOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  function openEdit(name: string) {
    const l = locals.find(l => l.name === name);
    if (!l) return;
    editingName.current = name;
    setDraft({
      name:        l.name,
      description: l.description,
      x:  String(l.x),  y:  String(l.y),  z:  String(l.z),
      rx: String(l.rx), ry: String(l.ry), rz: String(l.rz),
    });
    setEditOpen(true);
  }

  function handleEdit() {
    const p = parseDraft(draft);
    const orig = editingName.current;
    robotClient.editLocal(orig, {
      newName:     p.name !== orig ? p.name : undefined,
      description: p.description,
      x: p.x, y: p.y, z: p.z,
      rx: p.rx, ry: p.ry, rz: p.rz,
    });
    setEditOpen(false);
  }

  function confirmDelete(name: string) {
    Alert.alert(
      "Delete Local",
      `Delete "${name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => robotClient.deleteLocal(name) },
      ]
    );
  }

  function toggleActiveLocal(name: string) {
    robotClient.setActiveLocal(activeLocal === name ? "None" : name);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <SubPageHeader title="Locals" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Section header */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconTile}>
            <Grid3x3 size={14} color="#7c3aed" />
          </View>
          <Text style={styles.sectionLabel}>SAVED LOCALS</Text>
        </View>

        {/* No-local row — always at top */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.localRow}
            onPress={() => robotClient.setActiveLocal("None")}
            activeOpacity={0.75}
          >
            <View style={[styles.activeTile, activeLocal === "" && styles.activeTileOn]}>
              {activeLocal === "" && <View style={styles.radioDot} />}
            </View>
            <View style={styles.localInfo}>
              <Text style={[styles.localName, activeLocal === "" && styles.localNameActive]}>
                No Local
              </Text>
              <Text style={styles.localCoords}>World origin (0, 0, 0)</Text>
            </View>
            {activeLocal === "" && (
              <View style={styles.activeChip}>
                <Text style={styles.activeChipText}>Active</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Empty state */}
        {locals.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconTile}>
              <Grid3x3 size={28} color="#7c3aed" />
            </View>
            <Text style={styles.emptyTitle}>No locals yet</Text>
            <Text style={styles.emptySub}>Tap below to define a coordinate system</Text>
          </View>
        )}

        {/* Local list */}
        {locals.length > 0 && (
          <View style={styles.card}>
            {locals.map((local, i) => {
              const isActive = activeLocal === local.name;
              const isLast   = i === locals.length - 1;
              return (
                <TouchableOpacity
                  key={local.name}
                  style={[styles.localRow, !isLast && styles.localRowBorder, isActive && styles.localRowActive]}
                  onPress={() => toggleActiveLocal(local.name)}
                  activeOpacity={0.75}
                >
                  {/* Radio button */}
                  <View style={[styles.activeTile, isActive && styles.activeTileOn]}>
                    {isActive && <View style={styles.radioDot} />}
                  </View>

                  {/* Name + coords */}
                  <View style={styles.localInfo}>
                    <Text style={[styles.localName, isActive && styles.localNameActive]}>
                      {local.name}
                    </Text>
                    {local.description ? (
                      <Text style={styles.localDesc} numberOfLines={1}>{local.description}</Text>
                    ) : (
                      <Text style={styles.localCoords}>
                        {local.x.toFixed(1)}, {local.y.toFixed(1)}, {local.z.toFixed(1)}
                      </Text>
                    )}
                  </View>

                  {isActive && (
                    <View style={styles.activeChip}>
                      <Text style={styles.activeChipText}>Active</Text>
                    </View>
                  )}

                  {/* Edit */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => openEdit(local.name)}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={16} color="#6b7280" />
                  </TouchableOpacity>

                  {/* Delete */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => confirmDelete(local.name)}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Add local */}
        <TouchableOpacity
          style={styles.addCard}
          onPress={() => { setDraft(EMPTY_DRAFT); setCreateOpen(true); }}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#7c3aed" />
          <Text style={styles.addCardText}>New Local</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Create modal */}
      <LocalFormModal
        visible={createOpen}
        title="New Local"
        draft={draft}
        onChangeDraft={setDraft}
        onSave={handleCreate}
        onClose={() => setCreateOpen(false)}
        onTeach={teachCurrentPosition}
      />

      {/* Edit modal */}
      <LocalFormModal
        visible={editOpen}
        title="Edit Local"
        draft={draft}
        onChangeDraft={setDraft}
        onSave={handleEdit}
        onClose={() => setEditOpen(false)}
        onTeach={teachCurrentPosition}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIconTile: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#f5f3ff",
    justifyContent: "center",
    alignItems: "center",
  },
  sectionLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
  },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  addCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7c3aed",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },

  localRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  localRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  localRowActive: {
    backgroundColor: "#faf5ff",
  },

  activeTile: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
  },
  activeTileOn: {
    borderColor: "#7c3aed",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#7c3aed",
  },

  localInfo: {
    flex: 1,
    gap: 2,
  },
  localName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  localNameActive: {
    color: "#7c3aed",
  },
  localDesc: {
    fontSize: 12,
    color: "#9ca3af",
  },
  localCoords: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "monospace",
  },

  activeChip: {
    backgroundColor: "#f5f3ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7c3aed",
    letterSpacing: 0.3,
  },

  iconBtn: {
    padding: 4,
  },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 36,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  emptyIconTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: "#f5f3ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  emptySub: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },

  modalOuter: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
  },

  teachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f5f3ff",
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  teachBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7c3aed",
  },

  fieldLabel: {
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

  coordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  coordField: {
    width: "30%",
    flexGrow: 1,
  },
  coordFieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  coordInput: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111",
    backgroundColor: "#f9fafb",
    textAlign: "center",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
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
    backgroundColor: "#7c3aed",
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
