import { useIsWide } from "@/src/components/ui/responsive";
import {
  Button,
  buttonTextColor,
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
  OffsetAxis,
  OffsetDraft,
  OffsetGrid,
  offsetToDraft,
  parseOffsetDraft,
} from "@/src/components/space/OffsetFields";
import { useSelectedRobot, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useLocalSearchParams } from "expo-router";
import { Crosshair } from "lucide-react-native";
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
  const isWide = useIsWide();
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

  const nameSection = (
    <>
      <SectionHeader title="Tool" />
      <Card style={s.formCard}>
        <FormRow label="Name">
          <LocalInput
            value={draft.name}
            onChange={v => set({ name: v })}
            placeholder="e.g. Gripper"
            autoCapitalize="words"
            returnKeyType="next"
          />
        </FormRow>
        {nameClash && <Text style={s.error}>Another tool already has this name.</Text>}
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
        title="TCP offset  (mm / °)"
        right={<InfoTip text="The tool center point's offset and rotation relative to the robot flange. This is the point that gets driven to saved coordinates while this tool is active." />}
      />
      <Card>
        <OffsetGrid draft={draft} axes={axes} onChange={(a, v) => set({ [a]: v })} />
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
        {/* Teach the planar TCP by touching one point from several wrist angles (ASTRO only). */}
        {isAstro && (
          <Card style={s.teachCard}>
            <Text style={s.teachText}>
              {isNew
                ? "Touch one point from several wrist angles and the X/Y offset is worked out for you — or enter it by hand below."
                : "Re-teach this tool's X/Y offset by touching one point from several wrist angles. Z and rotation are kept."}
            </Text>
            <Button
              label="Teach with wizard"
              icon={<Crosshair size={16} color={buttonTextColor("primary")} />}
              onPress={openTeach}
            />
          </Card>
        )}

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

  wideRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  wideCol: { flex: 1, gap: spacing.md },

  formCard: { gap: spacing.md },
  error: { fontSize: 12, color: colors.danger, marginTop: -spacing.sm },
});
