import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import {
  Button,
  Card,
  colors,
  Divider,
  EmptyState,
  FormRow,
  InfoTip,
  Input,
  PageHeader,
  radii,
  RadioRow,
  Screen,
  SectionHeader,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { useRobotStatus, useSelectedRobot, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Check, Edit2, Plus, Wrench, X } from "lucide-react-native";
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

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
      <Input
        style={styles.coordInput}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
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
  const robot   = useSelectedRobot();
  const isAstro = robot?.robotType === 'ASTRO';

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
              <Pressable onPress={onClose} hitSlop={12}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Name */}
              <FormRow label="Name" style={styles.formRow}>
                <Input
                  value={draft.name}
                  onChangeText={set("name")}
                  placeholder="e.g. Gripper"
                  returnKeyType="next"
                />
              </FormRow>

              {/* Description */}
              <FormRow label="Description" style={styles.formRow}>
                <Input
                  value={draft.description}
                  onChangeText={set("description")}
                  placeholder="Optional"
                  returnKeyType="next"
                />
              </FormRow>

              {/* Position */}
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>TCP Offset (mm / °)</Text>
                <InfoTip text="The tool center point's offset and rotation relative to the robot flange. This is the point that gets driven to saved coordinates while this tool is active." />
              </View>
              <View style={styles.coordGrid}>
                <CoordField label="X"  value={draft.x}  onChange={set("x")}  />
                <CoordField label="Y"  value={draft.y}  onChange={set("y")}  />
                <CoordField label="Z"  value={draft.z}  onChange={set("z")}  />
                {!isAstro && <CoordField label="RX" value={draft.rx} onChange={set("rx")} />}
                {!isAstro && <CoordField label="RY" value={draft.ry} onChange={set("ry")} />}
                <CoordField label="RZ" value={draft.rz} onChange={set("rz")} />
              </View>

              {/* Actions */}
              <View style={styles.modalActions}>
                <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.modalCancel} />
                <Button
                  label="Save"
                  variant="primary"
                  icon={<Check size={15} color={colors.onAccent} />}
                  onPress={onSave}
                  disabled={!draft.name.trim()}
                  style={styles.modalConfirm}
                />
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
    appAlert(
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
      <PageHeader title="Tools" subtitle="Define TCP offsets and pick the active tool" />

      <Screen>
        <SectionHeader
          title="Saved tools"
          icon={Wrench}
          right={<InfoTip text="A tool's offset defines its TCP (tool center point) relative to the robot flange. Activate a tool so saved points and moves target that offset instead of the raw flange position." />}
        />

        {/* No-tool row — always at top */}
        <Card padded={false}>
          <RadioRow
            title="No Tool"
            subtitleNode={<Text style={styles.toolCoords}>Origin (0, 0, 0)</Text>}
            selected={activeTool === ""}
            onPress={() => robotClient.setActiveTool("None")}
            style={styles.radioRowPad}
            right={
              activeTool === "" ? (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>Active</Text>
                </View>
              ) : undefined
            }
          />
        </Card>

        {/* Empty state */}
        {tools.length === 0 && (
          <EmptyState
            icon={<Wrench size={28} color={colors.textFaint} />}
            title="No tools yet"
            subtitle="Tap below to define a TCP offset"
          />
        )}

        {/* Tool list */}
        {tools.length > 0 && (
          <Card padded={false}>
            {tools.map((tool, i) => {
              const isActive = activeTool === tool.name;
              const isLast   = i === tools.length - 1;
              return (
                <View key={tool.name}>
                  <RadioRow
                    title={tool.name}
                    subtitleNode={
                      tool.description ? (
                        <Text style={styles.toolDesc} numberOfLines={1}>{tool.description}</Text>
                      ) : (
                        <Text style={styles.toolCoords}>
                          {tool.x.toFixed(1)}, {tool.y.toFixed(1)}, {tool.z.toFixed(1)}
                        </Text>
                      )
                    }
                    selected={isActive}
                    onPress={() => toggleActiveTool(tool.name)}
                    style={[isActive && styles.toolRowActive, styles.radioRowPad]}
                    right={
                      <View style={styles.rowActions}>
                        {isActive && (
                          <View style={styles.activeChip}>
                            <Text style={styles.activeChipText}>Active</Text>
                          </View>
                        )}
                        {/* Edit */}
                        <Pressable
                          style={styles.iconBtn}
                          onPress={() => openEdit(tool.name)}
                          hitSlop={8}
                        >
                          <Edit2 size={16} color={colors.textMuted} />
                        </Pressable>

                        {/* Delete */}
                        <DeleteIconButton style={styles.iconBtn} onPress={() => confirmDelete(tool.name)} />
                      </View>
                    }
                  />
                  {!isLast && <Divider />}
                </View>
              );
            })}
          </Card>
        )}

        {/* Add tool — outlined continuation card */}
        <Button
          variant="dashed"
          label="New Tool"
          icon={<Plus size={16} color={colors.accent} />}
          onPress={() => { setDraft(EMPTY_DRAFT); setCreateOpen(true); }}
        />

      </Screen>

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
    backgroundColor: colors.background,
  },

  // ── Tool row ──────────────────────────────────────────────────────────────
  radioRowPad: {
    paddingHorizontal: spacing.md + 2,
  },
  toolRowActive: {
    backgroundColor: colors.accentSoft,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },

  toolDesc: {
    fontSize: 12,
    color: colors.textFaint,
  },
  toolCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
  },

  activeChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm - 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 0.3,
  },

  iconBtn: {
    padding: spacing.xs,
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOuter: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },

  // ── Form fields ───────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
    letterSpacing: 0.5,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.xs + 2,
  },
  formRow: { marginBottom: spacing.md + 2 },

  coordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  coordField: {
    width: "30%",
    flexGrow: 1,
  },
  coordFieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  coordInput: {
    ...type.mono,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },

  // ── Modal actions ─────────────────────────────────────────────────────────
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  modalCancel: {
    flex: 1,
  },
  modalConfirm: {
    flex: 2,
  },
});
