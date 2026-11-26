import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";

import { Point } from "@/src/models/robotModels";
import { Button, colors, radii, shadows, spacing, type } from "@/src/components/ui/kit";
import { newId } from "./stepUtils";

/**
 * Add or edit a PROGRAM point's metadata — its name and an optional description. The position is
 * taught separately on the Jog page (the point starts "untaught"), so this modal never touches the
 * pose. On save it returns the full Point: a fresh id + untaught:true for a new one, or the edited
 * name/description on top of the existing point's id/pose for an edit.
 */
export function PointEditModal({
  visible, point, existingNames, onSave, onClose,
}: {
  visible: boolean;
  /** The point being edited, or null to add a new one. */
  point: Point | null;
  /** Names already used by this program's points (excluding the one being edited), for dup-check. */
  existingNames: string[];
  onSave: (point: Point) => void;
  onClose: () => void;
}) {
  // Seeded from the point being edited. The caller remounts this modal (via `key`) on each open, so
  // these initial values are always fresh — no reset effect needed.
  const [name, setName] = useState(point?.name ?? "");
  const [description, setDescription] = useState(point?.description ?? "");

  const trimmed = name.trim();
  const dup = existingNames.some(n => n.toLowerCase() === trimmed.toLowerCase());
  const valid = trimmed.length > 0 && !dup;

  const save = () => {
    if (!valid) return;
    const base: Point = point ?? {
      id: newId(),
      name: trimmed,
      description: description.trim(),
      untaught: true,
      x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0,
      lastUpdatedUnixMs: Date.now(),
    };
    onSave({ ...base, name: trimmed, description: description.trim() });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <View style={{ width: 18 }} />
            <Text style={s.title}>{point ? "Edit Point" : "Add Point"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          <View style={s.body}>
            <Text style={s.label}>NAME</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Pickup"
              placeholderTextColor={colors.textFaint}
              autoFocus
              returnKeyType="next"
            />
            {dup && <Text style={s.err}>A point with this name already exists.</Text>}

            <Text style={[s.label, { marginTop: spacing.md }]}>DESCRIPTION</Text>
            <TextInput
              style={[s.input, s.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="What is this point for? (optional)"
              placeholderTextColor={colors.textFaint}
              multiline
            />

            <Text style={s.hint}>Set the position next with Teach on the point&apos;s row.</Text>

            <View style={s.buttons}>
              <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
              <Button label="Save" style={{ flex: 1 }} disabled={!valid} onPress={save} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center", padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radii.xl, width: "100%", maxWidth: 400, ...shadows.raised },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { ...type.title },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.xs },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: 15, color: colors.text, backgroundColor: colors.surface,
  },
  multiline: { minHeight: 64, textAlignVertical: "top" },
  err: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: spacing.md, lineHeight: 17 },
  buttons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.lg },
});
