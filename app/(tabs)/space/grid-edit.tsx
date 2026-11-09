import { usePaneLayout } from "@/src/components/ui/responsive";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import {
  Button,
  buttonTextColor,
  Card,
  colors,
  Divider,
  InfoTip,
  Input,
  PageHeader,
  radii,
  RadioRow,
  Screen,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { Grid } from "@/src/models/robotModels";
import { useGrids, usePoints } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, Crosshair, X } from "lucide-react-native";
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

/** Small field label (matches the kit FormRow label) with an optional info tip. */
function FieldLabel({ text, tip }: { text: string; tip?: string }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label} numberOfLines={1}>{text}</Text>
      {!!tip && <InfoTip text={tip} size={13} />}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function GridEditPage() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const grids  = useGrids();
  const points = usePoints();
  const isDesktop = usePaneLayout() === "desktop";

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

  // Sync draft if the grid loads after navigation (grids from context may lag), and again
  // when the saved grid itself changes — e.g. after re-teaching it in the wizard.
  const existingKey = existing ? JSON.stringify(existing) : "";
  useEffect(() => {
    if (existing) setDraft({ ...existing });
  }, [existingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (fields: Partial<Grid>) => setDraft(d => ({ ...d, ...fields }));

  function handleSave() {
    if (!draft.name.trim()) return;
    robotClient.saveGrid(draft).catch(() => {});
    router.back();
  }

  const canSave = draft.name.trim().length > 0;

  // Teach opens the corner wizard. A saved grid is re-taught in place (same id); a new one is
  // created by the wizard, so it replaces this blank page and Done returns to the grid list.
  function openTeach() {
    if (isNew) {
      const name = draft.name.trim();
      router.replace(name ? `/space/grid-teach?name=${encodeURIComponent(name)}` : "/space/grid-teach");
    } else {
      router.push(`/space/grid-teach?id=${encodeURIComponent(draft.id)}`);
    }
  }

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
        right={<Button label="Save" size="sm" onPress={handleSave} disabled={!canSave} />}
      />

      <Screen>
        {(() => {
          // The whole grid setup lives in one card: plain field labels and hairline
          // dividers instead of a section header + card per field.
          const identity = (
            <View style={s.group}>
              <View>
                <FieldLabel text="Name" />
                <Input
                  value={draft.name}
                  onChangeText={v => set({ name: v })}
                  placeholder="e.g. Pallet A"
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
            </View>
          );

          // Row/column step offsets, with the teach wizard right beside them since
          // teaching is what fills them in (it replaces the base point and offsets).
          const offsets = (
            <View style={s.group}>
              <View style={s.offsetsHeader}>
                <View style={s.offsetsTitle}>
                  <Text style={s.label}>Step offsets</Text>
                  <Text style={s.unit}>mm per step</Text>
                </View>
                <Button
                  label="Teach"
                  size="sm"
                  variant="secondary"
                  icon={<Crosshair size={14} color={buttonTextColor("secondary")} />}
                  onPress={openTeach}
                />
              </View>
              <View>
                <View style={s.axisRow}>
                  <View style={s.axisRowLabel} />
                  {(["X", "Y", "Z"] as const).map(axis => (
                    <Text key={axis} style={[s.axisCol, s.axisLabel]}>{axis}</Text>
                  ))}
                </View>
                {([["Row", "rowOffset"], ["Column", "colOffset"]] as const).map(([label, key]) => (
                  <View key={key} style={[s.axisRow, s.axisRowGap]}>
                    <Text style={[s.axisRowLabel, s.axisRowLabelText]}>{label}</Text>
                    {(["X", "Y", "Z"] as const).map(axis => (
                      <View key={axis} style={s.axisCol}>
                        <SignedNumberInput
                          value={draft[`${key}${axis}`]}
                          onChange={v => set({ [`${key}${axis}`]: v } as Partial<Grid>)}
                        />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
              <Text style={s.hint}>
                {isNew
                  ? "Teach jogs the robot to the grid's corners and works these out for you, or enter them by hand."
                  : "Teach re-jogs the robot to the grid's corners and replaces the base point and offsets."}
              </Text>
            </View>
          );

          const sizeAndRotation = (
            <View style={s.triRow}>
              <View style={s.triCol}>
                <FieldLabel
                  text="Rows"
                  tip="Row and column count only cap the grid for display — leave either blank for an unlimited grid in that direction."
                />
                <OptionalCountInput value={draft.rowCount} onChange={v => set({ rowCount: v })} />
              </View>
              <View style={s.triCol}>
                <FieldLabel text="Columns" />
                <OptionalCountInput value={draft.colCount} onChange={v => set({ colCount: v })} />
              </View>
              <View style={s.triCol}>
                <FieldLabel text="Rotation °" tip="Z-axis rotation applied around the base point." />
                <SignedNumberInput
                  value={draft.rotation}
                  onChange={v => set({ rotation: v })}
                  placeholder="0"
                />
              </View>
            </View>
          );

          if (isDesktop) {
            // Desktop: identity + size on the left, step geometry on the right, still one card.
            return (
              <Card padded={false} style={s.cardRow}>
                <View style={[s.cardCol, s.cardSection]}>
                  {identity}
                  <Divider style={s.divider} />
                  {sizeAndRotation}
                </View>
                <Divider vertical style={s.vDivider} />
                <View style={[s.cardCol, s.cardSection]}>{offsets}</View>
              </Card>
            );
          }

          return (
            <Card>
              {identity}
              <Divider style={s.divider} />
              {offsets}
              <Divider style={s.divider} />
              {sizeAndRotation}
            </Card>
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

  // ── The single setup card ─────────────────────────────────────────────────
  group:   { gap: spacing.md },
  divider: { marginVertical: spacing.lg - 2 },

  // Desktop: two columns inside the one card, split by a hairline.
  cardRow:     { flexDirection: "row", alignItems: "stretch" },
  cardCol:     { flex: 1 },
  cardSection: { padding: spacing.lg - 2 },
  vDivider:    { marginHorizontal: 0 },

  // Same look as the kit FormRow label.
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, marginBottom: spacing.xs + 2 },
  label:    { fontSize: 13, fontWeight: "600", color: colors.textSecondary, flexShrink: 1 },
  unit:     { ...type.caption },
  hint:     { ...type.caption, fontSize: 12 },

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

  offsetsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  offsetsTitle:  { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexShrink: 1 },

  // Coordinate/position values use the mono type preset.
  input: { ...type.mono },

  axisRow:          { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  axisRowGap:       { marginTop: spacing.sm },
  axisRowLabel:     { width: 58 },
  axisRowLabelText: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
  axisCol:          { flex: 1, minWidth: 0 },
  axisLabel: {
    fontSize: 11, fontWeight: "600", color: colors.textFaint, textAlign: "center",
  },

  // Rows / Columns / Rotation share one row.
  triRow: { flexDirection: "row", gap: spacing.sm + 2 },
  triCol: { flex: 1, minWidth: 0 },

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
