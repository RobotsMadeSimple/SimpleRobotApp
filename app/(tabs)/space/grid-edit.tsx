import { useIsWide } from "@/src/components/ui/responsive";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import {
  Button,
  Card,
  colors,
  Divider,
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
import { Grid } from "@/src/models/robotModels";
import { useGrids, usePoints } from "@/src/providers/RobotProvider";
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

export default function GridEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const grids  = useGrids();
  const points = usePoints();
  const isWide = useIsWide();

  const isNew    = !id || id === "new";
  const existing = isNew ? null : (grids.find(g => g.id === id) ?? null);

  const [draft, setDraft] = useState<Grid>(() => existing ?? {
    id: "",
    name: "",
    basePointName: "",
    rowOffsetX: 0, rowOffsetY: 0, rowOffsetZ: 0,
    colOffsetX: 0, colOffsetY: 0, colOffsetZ: 0,
    rowCount: undefined,
    colCount: undefined,
    rotation: 0,
    lastUpdatedUnixMs: 0,
  });

  const [pointPickerOpen, setPointPickerOpen] = useState(false);

  // Sync draft if the grid loads after navigation (grids from context may lag)
  useEffect(() => {
    if (existing) setDraft({ ...existing });
  }, [existing?.id]);

  const set = (fields: Partial<Grid>) => setDraft(d => ({ ...d, ...fields }));

  function handleSave() {
    if (!draft.name.trim()) return;
    robotClient.saveGrid(draft).catch(() => {});
    router.back();
  }

  const canSave = draft.name.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <PageHeader
        title={isNew ? "New Grid" : "Edit Grid"}
        subtitle="A 2D array of positions stepped from a base point"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Grids", href: "/space/grids" },
          { label: isNew ? "New Grid" : "Edit Grid" },
        ]}
        backTo="/space/grids"
        right={
          <Button label="Save" size="sm" onPress={handleSave} disabled={!canSave} />
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
                  placeholder="e.g. Pallet A"
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

          const rowOffsetSection = (
            <>
              <SectionHeader title="Row offset  (mm per row step)" />
              <Card>
                <View style={s.axisRow}>
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <View key={axis} style={s.axisCol}>
                      <Text style={s.axisLabel}>{axis}</Text>
                      <SignedNumberInput
                        value={draft[`rowOffset${axis}` as "rowOffsetX"]}
                        onChange={v => set({ [`rowOffset${axis}`]: v } as any)}
                      />
                    </View>
                  ))}
                </View>
              </Card>
            </>
          );

          const colOffsetSection = (
            <>
              <SectionHeader title="Column offset  (mm per column step)" />
              <Card>
                <View style={s.axisRow}>
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <View key={axis} style={s.axisCol}>
                      <Text style={s.axisLabel}>{axis}</Text>
                      <SignedNumberInput
                        value={draft[`colOffset${axis}` as "colOffsetX"]}
                        onChange={v => set({ [`colOffset${axis}`]: v } as any)}
                      />
                    </View>
                  ))}
                </View>
              </Card>
            </>
          );

          const sizeSection = (
            <>
              <SectionHeader
                title="Grid size  (optional)"
                right={<InfoTip text="Row and column count only cap the grid for display — leave either blank for an unlimited grid in that direction." />}
              />
              <Card padded={false}>
                <View style={s.twoCol}>
                  <FormRow label="Row count" style={s.twoColItem}>
                    <OptionalCountInput
                      value={draft.rowCount}
                      onChange={v => set({ rowCount: v })}
                    />
                  </FormRow>
                  <FormRow label="Column count" style={[s.twoColItem, s.twoColDivider]}>
                    <OptionalCountInput
                      value={draft.colCount}
                      onChange={v => set({ colCount: v })}
                    />
                  </FormRow>
                </View>
              </Card>
            </>
          );

          const rotationSection = (
            <>
              <SectionHeader title="Rotation" />
              <Card>
                <View style={s.rotationRow}>
                  <SignedNumberInput
                    value={draft.rotation}
                    onChange={v => set({ rotation: v })}
                    placeholder="0"
                  />
                  <Text style={s.rotationUnit}>°</Text>
                </View>
                <Text style={s.rotationHint}>Z-axis rotation applied around the base point</Text>
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
                  {rotationSection}
                </View>
                <View style={s.wideCol}>
                  {rowOffsetSection}
                  {colOffsetSection}
                  {sizeSection}
                </View>
              </View>
            );
          }

          return (
            <>
              {nameSection}
              {baseSection}
              {rowOffsetSection}
              {colOffsetSection}
              {sizeSection}
              {rotationSection}
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

  twoCol: {
    flexDirection: "row",
  },
  twoColItem: {
    flex: 1,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
  },
  twoColDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },

  rotationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    marginBottom: spacing.xs,
  },
  rotationUnit: {
    fontSize: 16, fontWeight: "600", color: colors.textMuted,
  },
  rotationHint: {
    fontSize: 12, color: colors.textFaint,
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
