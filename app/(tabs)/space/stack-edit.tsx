import { useIsWide } from "@/src/components/ui/responsive";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import {
  accents,
  Button,
  Card,
  colors,
  Divider,
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
  const isWide = useIsWide();

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

  useEffect(() => {
    if (existing) setDraft({ ...existing });
  }, [existing?.id]);

  const set = (fields: Partial<RobotStack>) => setDraft(d => ({ ...d, ...fields }));

  function handleSave() {
    if (!draft.name.trim()) return;
    robotClient.saveStack(draft).catch(() => {});
    router.back();
  }

  const canSave = draft.name.trim().length > 0;

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
          const nameSection = (
            <>
              <SectionHeader title="Name" />
              <Card>
                <Input
                  value={draft.name}
                  onChangeText={v => set({ name: v })}
                  placeholder="e.g. Tube Rack A"
                  autoCapitalize="words"
                  returnKeyType="next"
                  style={s.nameInput}
                />
              </Card>
            </>
          );

          const baseSection = (
            <>
              <SectionHeader title="Base point" />
              <Card padded={false}>
                <AnimatedPressable style={s.pickerRow} onPress={() => setPointPickerOpen(true)}>
                  <Text style={[s.pickerRowText, !draft.basePointName && s.pickerRowPlaceholder]}>
                    {draft.basePointName || "Select point…"}
                  </Text>
                  <ChevronRight size={16} color={colors.textFaint} />
                </AnimatedPressable>
              </Card>
            </>
          );

          const offsetSection = (
            <>
              <SectionHeader title="Step offset  (mm per index step)" />
              <Card>
                <View style={s.axisRow}>
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <View key={axis} style={s.axisCol}>
                      <Text style={s.axisLabel}>{axis}</Text>
                      <SignedNumberInput
                        value={draft[`offset${axis}` as "offsetX"]}
                        onChange={v => set({ [`offset${axis}`]: v } as any)}
                      />
                    </View>
                  ))}
                </View>
              </Card>
            </>
          );

          const maxCountSection = (
            <>
              <SectionHeader
                title="Max count  (optional — enables round-robin)"
                right={<InfoTip text="When set, indices at or beyond the max count wrap back to the start via modulo, so a program can cycle through the same slots repeatedly." />}
              />
              <Card>
                <View style={s.countRow}>
                  <OptionalCountInput
                    value={draft.maxCount}
                    onChange={v => set({ maxCount: v })}
                  />
                </View>
                <Text style={s.hint}>
                  When set, indices ≥ max count wrap around via modulo.
                </Text>
              </Card>
            </>
          );

          if (isWide) {
            // Wide: identity/base info on the left, step geometry on the right —
            // avoids one long skinny column of stacked cards.
            return (
              <View style={s.wideRow}>
                <View style={s.wideCol}>
                  {nameSection}
                  {baseSection}
                </View>
                <View style={s.wideCol}>
                  {offsetSection}
                  {maxCountSection}
                </View>
              </View>
            );
          }

          return (
            <>
              {nameSection}
              {baseSection}
              {offsetSection}
              {maxCountSection}
            </>
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

  // Wide: two columns instead of one long stack of cards. Each column keeps
  // its own vertical rhythm since Screen's `gap` only spaces its direct child.
  wideRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  wideCol: { flex: 1, gap: spacing.md },

  nameInput: { borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 },

  // Coordinate/position values use the mono type preset.
  input: { ...type.mono },

  axisRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
  },
  axisCol: { flex: 1 },
  axisLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textFaint,
    textAlign: "center", marginBottom: spacing.xs,
  },

  countRow: {
    paddingHorizontal: spacing.md + 2,
    paddingTop: spacing.md,
  },
  hint: {
    fontSize: 12, color: colors.textFaint,
    paddingHorizontal: spacing.md + 2, paddingTop: spacing.xs, paddingBottom: spacing.sm,
  },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md + 1,
  },
  pickerRowText: {
    ...type.body,
    fontSize: 15,
    color: colors.text,
  },
  pickerRowPlaceholder: { color: colors.textFaint },

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
