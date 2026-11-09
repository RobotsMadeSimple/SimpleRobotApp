import {
  Button,
  colors,
  PageHeader,
  Screen,
  spacing,
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
  OffsetAxis,
  OffsetDraft,
  OffsetGrid,
  offsetToDraft,
  parseOffsetDraft,
} from "@/src/components/space/OffsetFields";
import { useSelectedRobot, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

/**
 * Tool editor — name, description and TCP offset of one tool. Route param `id` edits that tool
 * (found by its stable id, so a rename keeps it the same tool); no id creates a new one.
 */
export default function ToolEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tools  = useTools();
  const robot  = useSelectedRobot();
  const isAstro = robot?.robotType === "ASTRO";

  const isNew    = !id || id === "new";
  const existing = isNew ? null : (tools.find(t => t.id === id) ?? null);

  const [draft, setDraft] = useState<OffsetDraft>(() => existing ? offsetToDraft(existing) : EMPTY_OFFSET_DRAFT);

  // Sync the draft if the tool loads after navigation, and again when the saved tool itself
  // changes — e.g. after re-teaching its offset in the wizard.
  const existingKey = existing ? JSON.stringify(existing) : "";
  const [seedKey, setSeedKey] = useState(existingKey);
  if (existingKey !== seedKey) {
    setSeedKey(existingKey);
    if (existing) setDraft(offsetToDraft(existing));
  }

  const set = (fields: Partial<OffsetDraft>) => setDraft(d => ({ ...d, ...fields }));

  const name = draft.name.trim();
  const nameClash = !!name && tools.some(t => t.name === name && t.id !== existing?.id);
  const canSave = !!name && !nameClash && (isNew || !!existing);

  function handleSave() {
    if (!canSave) return;
    const p = parseOffsetDraft(draft);
    if (existing) {
      robotClient.editTool(existing.name, {
        newName:     p.name !== existing.name ? p.name : undefined,
        description: p.description,
        x: p.x, y: p.y, z: p.z,
        rx: p.rx, ry: p.ry, rz: p.rz,
      });
    } else {
      robotClient.createTool(p);
    }
    if (router.canGoBack()) router.back(); else router.replace("/space/tools");
  }

  // Teach opens the TCP wizard. A saved tool is re-taught in place (by its stable id) and this
  // page reloads on return; a new one is created by the wizard, so it replaces this blank page.
  function openTeach() {
    if (existing?.id) {
      router.push(`/space/teach-tcp?id=${encodeURIComponent(existing.id)}`);
    } else {
      router.replace(name ? `/space/teach-tcp?name=${encodeURIComponent(name)}` : "/space/teach-tcp");
    }
  }

  const title = isNew ? "New Tool" : "Edit Tool";
  const axes: OffsetAxis[] = isAstro ? ["x", "y", "z", "rz"] : ["x", "y", "z", "rx", "ry", "rz"];

  const identity = (
    <FieldGroup>
      <View>
        <FieldLabel text="Name" />
        <LocalInput
          value={draft.name}
          onChange={v => set({ name: v })}
          placeholder="e.g. Gripper"
          autoCapitalize="words"
          returnKeyType="next"
        />
        {nameClash && <Text style={s.error}>Another tool already has this name.</Text>}
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

  // The TCP offset, with the teach wizard (ASTRO only) right beside it since teaching fills it in.
  const offset = (
    <FieldGroup>
      <SectionHeading
        title="TCP offset"
        unit="mm / °"
        tip="The tool center point's offset and rotation relative to the robot flange. This is the point that gets driven to saved coordinates while this tool is active."
        action={isAstro ? <TeachButton onPress={openTeach} /> : undefined}
      />
      <OffsetGrid draft={draft} axes={axes} onChange={(a, v) => set({ [a]: v })} />
      {isAstro && (
        <FieldHint>
          {isNew
            ? "Teach touches one point from several wrist angles and works out X/Y for you, or enter it by hand."
            : "Teach re-teaches X/Y by touching one point from several wrist angles. Z and rotation are kept."}
        </FieldHint>
      )}
    </FieldGroup>
  );

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader
        title={title}
        subtitle="A tool center point offset from the robot flange"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Tools", href: "/space/tools" },
          { label: title },
        ]}
        backTo="/space/tools"
        right={<Button label="Save" size="sm" onPress={handleSave} disabled={!canSave} />}
      />

      <Screen>
        {/* The whole tool setup in one card; split in two halves on desktop. */}
        <EditorCard left={[identity]} right={[offset]} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  error: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },
});
