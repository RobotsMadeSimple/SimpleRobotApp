import {
  Button,
  colors,
  PageHeader,
  Screen,
  spacing,
  type,
} from "@/src/components/ui/kit";
import {
  EditorCard,
  FieldGroup,
  FieldHint,
  FieldLabel,
  SectionHeading,
  TeachButton,
} from "@/src/components/space/EditorCard";
import {
  EMPTY_OFFSET_DRAFT,
  LocalInput,
  OffsetDraft,
  OffsetGrid,
  offsetToDraft,
  parseOffsetDraft,
} from "@/src/components/space/OffsetFields";
import { useLocals, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

/**
 * Teach reads the live position on its own, so the ~20Hz status broadcast re-renders only this
 * button and the pose line below, not the form fields.
 */
function TeachFromPositionButton({ onTeach }: { onTeach: (p: Pose) => void }) {
  const status = useRobotStatus();
  return (
    <TeachButton
      onPress={() => onTeach({ x: status.x, y: status.y, z: status.z, rx: status.rx, ry: status.ry, rz: status.rz })}
    />
  );
}

function LivePose() {
  const status = useRobotStatus();
  return (
    <Text style={s.poseText}>
      Now {status.x.toFixed(1)}, {status.y.toFixed(1)}, {status.z.toFixed(1)}
      {"  ·  R "}
      {status.rx.toFixed(1)}°, {status.ry.toFixed(1)}°, {status.rz.toFixed(1)}°
    </Text>
  );
}

/**
 * Local editor — name, description and offset of one local coordinate frame. Route param `id`
 * edits that local (found by its stable id, so a rename keeps it the same local); no id creates one.
 */
export default function LocalEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const locals = useLocals();

  const isNew    = !id || id === "new";
  const existing = isNew ? null : (locals.find(l => l.id === id) ?? null);

  const [draft, setDraft] = useState<OffsetDraft>(() => existing ? offsetToDraft(existing) : EMPTY_OFFSET_DRAFT);

  // Sync the draft if the local loads after navigation or changes on the controller.
  const existingKey = existing ? JSON.stringify(existing) : "";
  const [seedKey, setSeedKey] = useState(existingKey);
  if (existingKey !== seedKey) {
    setSeedKey(existingKey);
    if (existing) setDraft(offsetToDraft(existing));
  }

  const set = (fields: Partial<OffsetDraft>) => setDraft(d => ({ ...d, ...fields }));

  const teach = (p: Pose) => set({
    x:  String(+p.x.toFixed(3)),
    y:  String(+p.y.toFixed(3)),
    z:  String(+p.z.toFixed(3)),
    rx: String(+p.rx.toFixed(3)),
    ry: String(+p.ry.toFixed(3)),
    rz: String(+p.rz.toFixed(3)),
  });

  const name = draft.name.trim();
  const nameClash = !!name && locals.some(l => l.name === name && l.id !== existing?.id);
  const canSave = !!name && !nameClash && (isNew || !!existing);

  function handleSave() {
    if (!canSave) return;
    const p = parseOffsetDraft(draft);
    if (existing) {
      robotClient.editLocal(existing.name, {
        newName:     p.name !== existing.name ? p.name : undefined,
        description: p.description,
        x: p.x, y: p.y, z: p.z,
        rx: p.rx, ry: p.ry, rz: p.rz,
      });
    } else {
      robotClient.createLocal(p);
    }
    if (router.canGoBack()) router.back(); else router.replace("/space/locals");
  }

  const title = isNew ? "New Local" : "Edit Local";

  const identity = (
    <FieldGroup>
      <View>
        <FieldLabel text="Name" />
        <LocalInput
          value={draft.name}
          onChange={v => set({ name: v })}
          placeholder="e.g. Workbench A"
          autoCapitalize="words"
          returnKeyType="next"
        />
        {nameClash && <Text style={s.error}>Another local already has this name.</Text>}
      </View>
      <View>
        <FieldLabel text="Description" />
        <LocalInput
          value={draft.description}
          onChange={v => set({ description: v })}
          placeholder="Optional"
          returnKeyType="next"
        />
      </View>
    </FieldGroup>
  );

  // The offset, with Teach right beside it since teaching from the current position fills it in.
  const offset = (
    <FieldGroup>
      <SectionHeading
        title="Offset"
        unit="mm / °"
        tip="Where this frame's origin sits in world coordinates, and how it is rotated. Points measured while the local is active are relative to it."
        action={<TeachFromPositionButton onTeach={teach} />}
      />
      <OffsetGrid draft={draft} axes={["x", "y", "z", "rx", "ry", "rz"]} onChange={(a, v) => set({ [a]: v })} />
      <View style={s.hintBlock}>
        <FieldHint>
          {isNew
            ? "Teach takes the robot's current position as the frame's origin, or enter it by hand."
            : "Teach replaces the offset and rotation with the robot's current position when you save."}
        </FieldHint>
        <LivePose />
      </View>
    </FieldGroup>
  );

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader
        title={title}
        subtitle="A coordinate frame that point coordinates are measured from"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Locals", href: "/space/locals" },
          { label: title },
        ]}
        backTo="/space/locals"
        right={<Button label="Save" size="sm" onPress={handleSave} disabled={!canSave} />}
      />

      <Screen>
        {/* The whole local setup in one card; split in two halves on desktop. */}
        <EditorCard left={[identity]} right={[offset]} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  poseText: { ...type.mono, fontSize: 12, color: colors.textFaint },
  hintBlock: { gap: spacing.xs },
  error: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },
});
