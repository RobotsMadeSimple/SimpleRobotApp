import { useIsWide } from "@/src/components/ui/responsive";
import {
  accents,
  Button,
  Card,
  colors,
  FormRow,
  InfoTip,
  PageHeader,
  Screen,
  SectionHeader,
  spacing,
  type,
} from "@/src/components/ui/kit";
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
import { Grid3x3 } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

/**
 * The teach card reads the live position on its own, so the ~20Hz status broadcast re-renders
 * only this card and not the form fields.
 */
function TeachFromPositionCard({ isNew, onTeach }: { isNew: boolean; onTeach: (p: Pose) => void }) {
  const status = useRobotStatus();
  return (
    <Card style={s.teachCard}>
      <Text style={s.teachText}>
        {isNew
          ? "Jog the robot to the frame's origin and take its position as the offset — or enter it by hand below."
          : "Re-teach this local from the robot's current position. Its offset and rotation are replaced when you save."}
      </Text>
      <Text style={s.poseText}>
        {status.x.toFixed(1)}, {status.y.toFixed(1)}, {status.z.toFixed(1)}
        {"  ·  R "}
        {status.rx.toFixed(1)}°, {status.ry.toFixed(1)}°, {status.rz.toFixed(1)}°
      </Text>
      <Button
        label="Teach from current position"
        icon={<Grid3x3 size={16} color={colors.onAccent} />}
        style={s.teachBtn}
        onPress={() => onTeach({ x: status.x, y: status.y, z: status.z, rx: status.rx, ry: status.ry, rz: status.rz })}
      />
    </Card>
  );
}

/**
 * Local editor — name, description and offset of one local coordinate frame. Route param `id`
 * edits that local (found by its stable id, so a rename keeps it the same local); no id creates one.
 */
export default function LocalEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const locals = useLocals();
  const isWide = useIsWide();

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

  const nameSection = (
    <>
      <SectionHeader title="Local" />
      <Card style={s.formCard}>
        <FormRow label="Name">
          <LocalInput
            value={draft.name}
            onChange={v => set({ name: v })}
            placeholder="e.g. Workbench A"
            autoCapitalize="words"
            returnKeyType="next"
          />
        </FormRow>
        {nameClash && <Text style={s.error}>Another local already has this name.</Text>}
        <FormRow label="Description">
          <LocalInput
            value={draft.description}
            onChange={v => set({ description: v })}
            placeholder="Optional"
            returnKeyType="next"
          />
        </FormRow>
      </Card>
    </>
  );

  const offsetSection = (
    <>
      <SectionHeader
        title="Offset  (mm / °)"
        right={<InfoTip text="Where this frame's origin sits in world coordinates, and how it is rotated. Points measured while the local is active are relative to it." />}
      />
      <Card>
        <OffsetGrid draft={draft} axes={["x", "y", "z", "rx", "ry", "rz"]} onChange={(a, v) => set({ [a]: v })} />
      </Card>
    </>
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
        <TeachFromPositionCard isNew={isNew} onTeach={teach} />

        {isWide ? (
          <View style={s.wideRow}>
            <View style={s.wideCol}>{nameSection}</View>
            <View style={s.wideCol}>{offsetSection}</View>
          </View>
        ) : (
          <>
            {nameSection}
            {offsetSection}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },

  teachCard: { gap: spacing.md },
  teachText: { ...type.body, color: colors.textMuted },
  poseText: { ...type.mono, fontSize: 12, color: colors.textFaint },
  teachBtn: { backgroundColor: accents.purple },

  wideRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  wideCol: { flex: 1, gap: spacing.md },

  formCard: { gap: spacing.md },
  error: { fontSize: 12, color: colors.danger, marginTop: -spacing.sm },
});
