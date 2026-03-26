import { useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Tabs } from "expo-router";
import {
  Check,
  ChevronRight,
  Edit2,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
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

type ToolDraft = {
  name: string;
  description: string;
  x: string; y: string; z: string;
  rx: string; ry: string; rz: string;
};

const EMPTY_DRAFT: ToolDraft = {
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

// ── Tool form modal ────────────────────────────────────────────────────────────

function ToolFormModal({
  visible,
  title,
  draft,
  onChangeDraft,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  draft: ToolDraft;
  onChangeDraft: (d: ToolDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = (k: keyof ToolDraft) => (v: string) =>
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
                placeholder="e.g. Gripper"
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

              {/* Position */}
              <Text style={[styles.fieldLabel, { marginTop: 4 }]}>TCP Offset (mm / °)</Text>
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

export default function ToolsPage() {
  const tools      = useTools();
  const status     = useRobotStatus();
  const activeTool = status.activeTool;

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen,   setEditOpen]   = useState(false);
  const [draft,      setDraft]      = useState<ToolDraft>(EMPTY_DRAFT);
  const editingName = useRef<string>("");

  // ── Helpers ────────────────────────────────────────────────────────────────

  function parseDraft(d: ToolDraft) {
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

  function handleCreate() {
    const p = parseDraft(draft);
    robotClient.createTool(p);
    setCreateOpen(false);
    setDraft(EMPTY_DRAFT);
  }

  function openEdit(name: string) {
    const t = tools.find(t => t.name === name);
    if (!t) return;
    editingName.current = name;
    setDraft({
      name:        t.name,
      description: t.description,
      x:  String(t.x),  y:  String(t.y),  z:  String(t.z),
      rx: String(t.rx), ry: String(t.ry), rz: String(t.rz),
    });
    setEditOpen(true);
  }

  function handleEdit() {
    const p = parseDraft(draft);
    const orig = editingName.current;
    robotClient.editTool(orig, {
      newName:     p.name !== orig ? p.name : undefined,
      description: p.description,
      x: p.x, y: p.y, z: p.z,
      rx: p.rx, ry: p.ry, rz: p.rz,
    });
    setEditOpen(false);
  }

  function confirmDelete(name: string) {
    Alert.alert(
      "Delete Tool",
      `Delete "${name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => robotClient.deleteTool(name) },
      ]
    );
  }

  function toggleActiveTool(name: string) {
    robotClient.setActiveTool(activeTool === name ? "None" : name);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Tabs.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Section header */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconTile}>
            <Wrench size={14} color="#2563eb" />
          </View>
          <Text style={styles.sectionLabel}>SAVED TOOLS</Text>
        </View>

        {/* No-tool row — always at top */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.toolRow}
            onPress={() => robotClient.setActiveTool("None")}
            activeOpacity={0.75}
          >
            <View style={[styles.activeTile, activeTool === "" && styles.activeTileOn]}>
              {activeTool === "" && <View style={styles.radioDot} />}
            </View>
            <View style={styles.toolInfo}>
              <Text style={[styles.toolName, activeTool === "" && styles.toolNameActive]}>
                No Tool
              </Text>
              <Text style={styles.toolCoords}>Origin (0, 0, 0)</Text>
            </View>
            {activeTool === "" && (
              <View style={styles.activeChip}>
                <Text style={styles.activeChipText}>Active</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Empty state */}
        {tools.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconTile}>
              <Wrench size={28} color="#2563eb" />
            </View>
            <Text style={styles.emptyTitle}>No tools yet</Text>
            <Text style={styles.emptySub}>Tap below to define a TCP offset</Text>
          </View>
        )}

        {/* Tool list */}
        {tools.length > 0 && (
          <View style={styles.card}>
            {tools.map((tool, i) => {
              const isActive = activeTool === tool.name;
              const isLast   = i === tools.length - 1;
              return (
                <TouchableOpacity
                  key={tool.name}
                  style={[styles.toolRow, !isLast && styles.toolRowBorder, isActive && styles.toolRowActive]}
                  onPress={() => toggleActiveTool(tool.name)}
                  activeOpacity={0.75}
                >
                  {/* Radio button */}
                  <View style={[styles.activeTile, isActive && styles.activeTileOn]}>
                    {isActive && <View style={styles.radioDot} />}
                  </View>

                  {/* Name + coords */}
                  <View style={styles.toolInfo}>
                    <Text style={[styles.toolName, isActive && styles.toolNameActive]}>
                      {tool.name}
                    </Text>
                    {tool.description ? (
                      <Text style={styles.toolDesc} numberOfLines={1}>{tool.description}</Text>
                    ) : (
                      <Text style={styles.toolCoords}>
                        {tool.x.toFixed(1)}, {tool.y.toFixed(1)}, {tool.z.toFixed(1)}
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
                    onPress={() => openEdit(tool.name)}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={16} color="#6b7280" />
                  </TouchableOpacity>

                  {/* Delete */}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => confirmDelete(tool.name)}
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

        {/* Add tool — outlined continuation card */}
        <TouchableOpacity
          style={styles.addCard}
          onPress={() => { setDraft(EMPTY_DRAFT); setCreateOpen(true); }}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#2563eb" />
          <Text style={styles.addCardText}>New Tool</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Create modal */}
      <ToolFormModal
        visible={createOpen}
        title="New Tool"
        draft={draft}
        onChangeDraft={setDraft}
        onSave={handleCreate}
        onClose={() => setCreateOpen(false)}
      />

      {/* Edit modal */}
      <ToolFormModal
        visible={editOpen}
        title="Edit Tool"
        draft={draft}
        onChangeDraft={setDraft}
        onSave={handleEdit}
        onClose={() => setEditOpen(false)}
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

  // ── Section header ────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIconTile: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#eff6ff",
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
    borderColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  addCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },

  // ── Card ──────────────────────────────────────────────────────────────────
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

  // ── Tool row ──────────────────────────────────────────────────────────────
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  toolRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  toolRowActive: {
    backgroundColor: "#f0f9ff",
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
    borderColor: "#2563eb",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563eb",
  },

  toolInfo: {
    flex: 1,
    gap: 2,
  },
  toolName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  toolNameActive: {
    color: "#2563eb",
  },
  toolDesc: {
    fontSize: 12,
    color: "#9ca3af",
  },
  toolCoords: {
    fontSize: 12,
    color: "#9ca3af",
    fontFamily: "monospace",
  },

  activeChip: {
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
    letterSpacing: 0.3,
  },

  iconBtn: {
    padding: 4,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
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
    backgroundColor: "#eff6ff",
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

  // ── Modal ─────────────────────────────────────────────────────────────────
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

  // ── Form fields ───────────────────────────────────────────────────────────
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

  // ── Modal actions ─────────────────────────────────────────────────────────
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
