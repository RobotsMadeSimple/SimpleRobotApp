import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import {
  accents,
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
import { useLocals, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Check, Edit2, Grid3x3, Plus, X } from "lucide-react-native";
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
                  placeholder="e.g. Workbench A"
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

              {/* Teach from current position */}
              <AnimatedPressable style={styles.teachBtn} onPress={onTeach}>
                <Grid3x3 size={14} color={accents.purple} />
                <Text style={styles.teachBtnText}>Teach from current robot position</Text>
              </AnimatedPressable>

              {/* Position */}
              <Text style={[styles.fieldLabel, { marginTop: spacing.xs }]}>Offset (mm / °)</Text>
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
    appAlert(
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
      <PageHeader title="Locals" subtitle="Local coordinate frames offset where point coordinates are measured from" />

      <Screen>
        <SectionHeader
          title="Saved locals"
          icon={Grid3x3}
          right={<InfoTip text="A local applies an offset and rotation to the coordinates the robot works in. Activate one to shift the origin your saved points are measured from; choose No Local to move in world coordinates." />}
        />

        {/* No-local row — always at top */}
        <Card padded={false}>
          <RadioRow
            title="No Local"
            subtitleNode={<Text style={styles.localCoords}>World origin (0, 0, 0)</Text>}
            selected={activeLocal === ""}
            onPress={() => robotClient.setActiveLocal("None")}
            tint={accents.purple}
            style={styles.radioRowPad}
            right={
              activeLocal === "" ? (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>Active</Text>
                </View>
              ) : undefined
            }
          />
        </Card>

        {/* Empty state */}
        {locals.length === 0 && (
          <EmptyState
            icon={<Grid3x3 size={28} color={colors.textFaint} />}
            title="No locals yet"
            subtitle="Tap below to define a coordinate system"
          />
        )}

        {/* Local list */}
        {locals.length > 0 && (
          <Card padded={false}>
            {locals.map((local, i) => {
              const isActive = activeLocal === local.name;
              const isLast   = i === locals.length - 1;
              return (
                <View key={local.name}>
                  <RadioRow
                    title={local.name}
                    subtitleNode={
                      <View>
                        {local.description ? (
                          <Text style={styles.localDesc} numberOfLines={1}>{local.description}</Text>
                        ) : null}
                        <Text style={styles.localCoords} numberOfLines={1}>
                          {local.x.toFixed(1)}, {local.y.toFixed(1)}, {local.z.toFixed(1)}
                          {"  ·  R "}
                          {local.rx.toFixed(1)}°, {local.ry.toFixed(1)}°, {local.rz.toFixed(1)}°
                        </Text>
                      </View>
                    }
                    selected={isActive}
                    onPress={() => toggleActiveLocal(local.name)}
                    tint={accents.purple}
                    style={[isActive && styles.localRowActive, styles.radioRowPad]}
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
                          onPress={() => openEdit(local.name)}
                          hitSlop={8}
                        >
                          <Edit2 size={16} color={colors.textMuted} />
                        </Pressable>

                        {/* Delete */}
                        <DeleteIconButton style={styles.iconBtn} onPress={() => confirmDelete(local.name)} />
                      </View>
                    }
                  />
                  {!isLast && <Divider />}
                </View>
              );
            })}
          </Card>
        )}

        {/* Add local */}
        <Button
          variant="dashed"
          label="New Local"
          icon={<Plus size={16} color={accents.purple} />}
          style={styles.addCard}
          textStyle={styles.addCardText}
          onPress={() => { setDraft(EMPTY_DRAFT); setCreateOpen(true); }}
        />

      </Screen>

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
    backgroundColor: colors.background,
  },

  addCard: { borderColor: accents.purple },
  addCardText: { color: accents.purple },

  radioRowPad: {
    paddingHorizontal: spacing.md + 2,
  },
  localRowActive: {
    backgroundColor: accents.purpleSoft,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },

  localDesc: {
    fontSize: 12,
    color: colors.textFaint,
  },
  localCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
  },

  activeChip: {
    backgroundColor: accents.purpleSoft,
    borderRadius: radii.sm - 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  activeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: accents.purple,
    letterSpacing: 0.3,
  },

  iconBtn: {
    padding: spacing.xs,
  },

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

  teachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    backgroundColor: accents.purpleSoft,
    borderWidth: 1,
    borderColor: accents.purpleBorder,
    borderRadius: radii.sm - 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    marginBottom: spacing.md + 2,
  },
  teachBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: accents.purple,
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
    letterSpacing: 0.5,
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
    backgroundColor: accents.purple,
  },
});
