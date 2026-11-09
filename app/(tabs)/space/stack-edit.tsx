import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import {
  accents,
  Button,
  colors,
  Divider,
  Input,
  PageHeader,
  radii,
  RadioRow,
  Screen,
  shadows,
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
import { RobotStack } from "@/src/models/robotModels";
import { usePoints, useStacks } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, X } from "lucide-react-native";
import { useEffect, useState } from "react";
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

// ── Input helpers ─────────────────────────────────────────────────────────────

function SignedNumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  return (
    <Input
      style={s.input}
      value={text}
      onChangeText={raw => {
        const cleaned = raw.replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, "");
        setText(cleaned);
        const n = parseFloat(cleaned);
        if (!isNaN(n)) onChange(n);
        else if (cleaned === "" || cleaned === "-") onChange(0);
      }}
      keyboardType="numbers-and-punctuation"
      placeholder={placeholder ?? "0"}
      selectTextOnFocus
    />
  );
}

function OptionalCountInput({
  value,
  onChange,
}: {
  value?: number;
  onChange: (n: number | undefined) => void;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");

  useEffect(() => { setText(value !== undefined ? String(value) : ""); }, [value]);

  return (
    <Input
      value={text}
      onChangeText={raw => {
        const cleaned = raw.replace(/[^0-9]/g, "");
        setText(cleaned);
        if (cleaned === "") onChange(undefined);
        else {
          const n = parseInt(cleaned, 10);
          if (!isNaN(n)) onChange(n);
        }
      }}
      keyboardType="numeric"
      placeholder="unlimited"
      selectTextOnFocus
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StackEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const stacks = useStacks();
  const points = usePoints();

  const isNew    = !id || id === "new";
  const existing = isNew ? null : (stacks.find(s => s.id === id) ?? null);

  const [draft, setDraft] = useState<RobotStack>(() => existing ?? {
    id: "",
    name: "",
    basePointName: "",
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    maxCount: undefined,
    lastUpdatedUnixMs: 0,
  });

  const [pointPickerOpen, setPointPickerOpen] = useState(false);

  // Sync draft if the stack loads after navigation, and again when the saved stack itself
  // changes — e.g. after re-teaching it in the wizard.
  const existingKey = existing ? JSON.stringify(existing) : "";
  useEffect(() => {
    if (existing) setDraft({ ...existing });
  }, [existingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (fields: Partial<RobotStack>) => setDraft(d => ({ ...d, ...fields }));

  function handleSave() {
    if (!draft.name.trim()) return;
    robotClient.saveStack(draft).catch(() => {});
    router.back();
  }

  const canSave = draft.name.trim().length > 0;

  // Teach opens the stack wizard. A saved stack is re-taught in place (same id); a new one is
  // created by the wizard, so it replaces this blank page and Done returns to the stack list.
  function openTeach() {
    if (isNew) {
      const name = draft.name.trim();
      router.replace(name ? `/space/stack-teach?name=${encodeURIComponent(name)}` : "/space/stack-teach");
    } else {
      router.push(`/space/stack-teach?id=${encodeURIComponent(draft.id)}`);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader
        title={isNew ? "New Stack" : "Edit Stack"}
        subtitle="A 1D array of positions stepped from a base point"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Stacks", href: "/space/stacks" },
          { label: isNew ? "New Stack" : "Edit Stack" },
        ]}
        backTo="/space/stacks"
        right={
          <Button
            label="Save"
            size="sm"
            onPress={handleSave}
            disabled={!canSave}
            style={s.saveBtn}
          />
        }
      />

      <Screen>
        {(() => {
          // The whole stack setup lives in one card: plain field labels and hairline dividers.
          const identity = (
            <FieldGroup>
              <View>
                <FieldLabel text="Name" />
                <Input
                  value={draft.name}
                  onChangeText={v => set({ name: v })}
                  placeholder="e.g. Tube Rack A"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              <View>
                <FieldLabel text="Base point" />
                <AnimatedPressable style={s.pickerWell} onPress={() => setPointPickerOpen(true)}>
                  <Text
                    style={[s.pickerWellText, !draft.basePointName && s.pickerWellPlaceholder]}
                    numberOfLines={1}
                  >
                    {draft.basePointName || "Select point…"}
                  </Text>
                  <ChevronRight size={16} color={colors.textFaint} />
                </AnimatedPressable>
              </View>
            </FieldGroup>
          );

          // The step offset, with the teach wizard right beside it since teaching is what fills
          // it in (it replaces the base point and step).
          const offset = (
            <FieldGroup>
              <SectionHeading
                title="Step offset"
                unit="mm per index step"
                action={<TeachButton onPress={openTeach} />}
              />
              <View>
                <View style={s.axisRow}>
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <Text key={axis} style={[s.axisCol, s.axisLabel]}>{axis}</Text>
                  ))}
                </View>
                <View style={[s.axisRow, s.axisRowGap]}>
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <View key={axis} style={s.axisCol}>
                      <SignedNumberInput
                        value={draft[`offset${axis}`]}
                        onChange={v => set({ [`offset${axis}`]: v } as Partial<RobotStack>)}
                      />
                    </View>
                  ))}
                </View>
              </View>
              <FieldHint>
                {isNew
                  ? "Teach jogs the robot to the first item and one more and works out the step for you, or enter it by hand."
                  : "Teach re-jogs the robot to the stack's items and replaces the base point and step."}
              </FieldHint>
            </FieldGroup>
          );

          const maxCount = (
            <View>
              <FieldLabel
                text="Max count"
                tip="Optional. When set, indices at or beyond the max count wrap back to the start via modulo, so a program can cycle through the same slots repeatedly. Leave blank for no limit."
              />
              <OptionalCountInput
                value={draft.maxCount}
                onChange={v => set({ maxCount: v })}
              />
            </View>
          );

          // Desktop: identity + max count on the left, step geometry on the right, still one card.
          return (
            <EditorCard
              left={[identity, maxCount]}
              right={[offset]}
              stacked={[identity, offset, maxCount]}
            />
          );
        })()}
      </Screen>

      {/* ── Base point picker ── */}
      <Modal
        visible={pointPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPointPickerOpen(false)}
      >
        <Pressable style={s.overlay} onPress={() => setPointPickerOpen(false)}>
          <Pressable style={s.pickerCard} onPress={() => {}}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select Base Point</Text>
              <Pressable onPress={() => setPointPickerOpen(false)} hitSlop={12}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {points.length === 0 && (
                <Text style={s.pickerEmpty}>No points saved yet.</Text>
              )}
              {points.map((p, i) => {
                const active = draft.basePointName === p.name;
                return (
                  <View key={p.name}>
                    <RadioRow
                      title={p.name}
                      subtitleNode={
                        <Text style={s.pickerItemDesc}>{p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}</Text>
                      }
                      selected={active}
                      onPress={() => { set({ basePointName: p.name }); setPointPickerOpen(false); }}
                      style={s.pickerItem}
                    />
                    {i < points.length - 1 && <Divider inset />}
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },

  // Stacks use accents.purple for their primary action, unlike the default
  // kit Button primary (accent blue), to match the app-wide Stacks color coding.
  saveBtn: { backgroundColor: accents.purple },

  pickerWell: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md - 2,
    backgroundColor: colors.surfaceMuted,
  },
  pickerWellText:        { flex: 1, fontSize: 14, color: colors.text },
  pickerWellPlaceholder: { color: colors.textFaint },

  // Coordinate/position values use the mono type preset.
  input: { ...type.mono },

  axisRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  axisRowGap: { marginTop: spacing.xs },
  axisCol:    { flex: 1, minWidth: 0 },
  axisLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textFaint, textAlign: "center",
  },

  // ── Point picker modal ────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    width: 300,
    maxHeight: "70%",
    overflow: "hidden",
    ...shadows.raised,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pickerEmpty: {
    fontSize: 13, color: colors.textFaint,
    textAlign: "center", padding: spacing.xl - 4,
  },
  pickerItem: { paddingHorizontal: spacing.lg },
  pickerItemDesc: { ...type.mono, fontSize: 11, color: colors.textFaint, marginTop: 1 },
});
