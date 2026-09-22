import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { NanoPinState, PinType } from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
import {
  Check,
  ChevronDown,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import {
  accents,
  Button,
  colors,
  InfoTip,
  Input,
  PageHeader,
  radii,
  shadows,
  spacing,
} from "@/src/components/ui/kit";

// ─────────────────────────────────────────────────────────────────────────────
// Arduino Nano pin definitions — D0-D13, A0-A5
// ─────────────────────────────────────────────────────────────────────────────

type PinDef = {
  pin: number;          // firmware pin number
  label: string;        // printed on the board  (D2, A0, …)
  note?: string;        // optional warning shown in grey
};

const NANO_PINS: PinDef[] = [
  { pin:  0, label: "D0",  note: "RX — shared with serial" },
  { pin:  1, label: "D1",  note: "TX — shared with serial" },
  { pin:  2, label: "D2"  },
  { pin:  3, label: "D3",  note: "PWM" },
  { pin:  4, label: "D4"  },
  { pin:  5, label: "D5",  note: "PWM" },
  { pin:  6, label: "D6",  note: "PWM" },
  { pin:  7, label: "D7"  },
  { pin:  8, label: "D8"  },
  { pin:  9, label: "D9",  note: "PWM" },
  { pin: 10, label: "D10", note: "PWM / SS" },
  { pin: 11, label: "D11", note: "PWM / MOSI" },
  { pin: 12, label: "D12", note: "MISO" },
  { pin: 13, label: "D13", note: "LED" },
  { pin: 14, label: "A0",  note: "Analog" },
  { pin: 15, label: "A1",  note: "Analog" },
  { pin: 16, label: "A2",  note: "Analog" },
  { pin: 17, label: "A3",  note: "Analog" },
  { pin: 18, label: "A4",  note: "Analog / SDA" },
  { pin: 19, label: "A5",  note: "Analog / SCL" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Local pin edit state
// ─────────────────────────────────────────────────────────────────────────────

type PinEdit = {
  pin: number;
  type: PinType | "Unconfigured";
  name: string;
  pixelCount: string;   // string so the TextInput stays controlled
  dirty: boolean;       // changed from the server snapshot
};

const TYPE_OPTIONS: Array<PinType | "Unconfigured"> = [
  "Unconfigured", "Input", "Output", "Neopixel",
];

// Pin-type colors: Input/Neopixel map onto kit tokens; Output keeps the
// purple device-type tint used for outputs across this section (ioShared).
function typeColor(type: PinType | "Unconfigured") {
  if (type === "Input")    return { fg: colors.accent,  bg: colors.accentSoft };
  if (type === "Output")   return { fg: accents.purple, bg: accents.purpleSoft };
  if (type === "Neopixel") return { fg: colors.warning, bg: colors.warningSoft };
  return { fg: colors.textFaint, bg: colors.background };
}

function typeLabel(type: PinType | "Unconfigured") {
  if (type === "Input")    return "IN";
  if (type === "Output")   return "OUT";
  if (type === "Neopixel") return "NEO";
  return "—";
}

function TypeDropdown({
  value,
  onChange,
}: {
  value: PinType | "Unconfigured";
  onChange: (v: PinType | "Unconfigured") => void;
}) {
  const [open, setOpen] = useState(false);
  const { fg, bg } = typeColor(value);

  return (
    <>
      <Pressable
        style={[styles.typeChip, { backgroundColor: bg, borderColor: fg }]}
        onPress={() => setOpen(true)}
        hitSlop={4}
      >
        <Text style={[styles.typeChipText, { color: fg }]}>{typeLabel(value)}</Text>
        <ChevronDown size={9} color={fg} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.typeModalOverlay} onPress={() => setOpen(false)}>
          <View style={styles.typeMenuCard}>
            {TYPE_OPTIONS.map(opt => {
              const { fg: ofg, bg: obg } = typeColor(opt);
              const selected = opt === value;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.typeMenuItem, selected && { backgroundColor: obg }]}
                  onPress={() => { onChange(opt); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typeMenuChip, { backgroundColor: obg, borderColor: ofg }]}>
                    <Text style={[styles.typeMenuChipText, { color: ofg }]}>{typeLabel(opt)}</Text>
                  </View>
                  <Text style={[styles.typeMenuLabel, selected && { color: ofg, fontWeight: "700" }]}>
                    {opt === "Unconfigured" ? "Unconfigured" : opt}
                  </Text>
                  {selected && <View style={[styles.typeMenuDot, { backgroundColor: ofg }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single pin row
// ─────────────────────────────────────────────────────────────────────────────

function PinRow({
  def,
  edit,
  onChange,
}: {
  def: PinDef;
  edit: PinEdit;
  onChange: (updated: Partial<PinEdit>) => void;
}) {
  const isConfigured = edit.type !== "Unconfigured";

  return (
    <View style={[styles.pinRow, edit.dirty && styles.pinRowDirty]}>
      {/* Pin label */}
      <View style={styles.pinLabelWrap}>
        <Text style={styles.pinLabel}>{def.label}</Text>
        {def.note && <Text style={styles.pinNote}>{def.note}</Text>}
      </View>

      {/* Type dropdown */}
      <TypeDropdown
        value={edit.type}
        onChange={v => onChange({ type: v, dirty: true })}
      />

      {/* Name input — only shown when configured */}
      {isConfigured ? (
        <Input
          style={styles.nameInput}
          value={edit.name}
          onChangeText={v => onChange({ name: v, dirty: true })}
          placeholder="Label…"
        />
      ) : (
        <View style={styles.nameInputPlaceholder} />
      )}

      {/* Pixel count — Neopixel only */}
      {edit.type === "Neopixel" && (
        <Input
          style={styles.pixelInput}
          value={edit.pixelCount}
          onChangeText={v => onChange({ pixelCount: v, dirty: true })}
          keyboardType="numeric"
          placeholder="px"
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function ColumnHeaders({ style }: { style?: any }) {
  return (
    <View style={[styles.colHeaders, style]}>
      <Text style={[styles.colHeader, { width: 44 }]}>PIN</Text>
      <Text style={[styles.colHeader, { width: 52 }]}>TYPE</Text>
      <Text style={[styles.colHeader, { flex: 1 }]}>LABEL</Text>
      <InfoTip
        size={12}
        text="Input reads a sensor or switch. Output can be toggled on/off from the IO pages. Neopixel drives an addressable LED strip and needs a pixel count. Unconfigured pins are left alone."
      />
    </View>
  );
}

export default function ConfigurePage() {
  const { nanoId } = useLocalSearchParams<{ nanoId: string }>();
  const nanos       = useNanoIO();
  const nano        = nanos.find(n => n.id === nanoId);
  const wideContent = useWideContent();
  const isWide      = useIsWide();

  // Build initial edit state from the current nanoIO snapshot
  const initialEdits = useMemo<PinEdit[]>(() => {
    const configuredMap = new Map<number, NanoPinState>();
    nano?.pins.forEach(p => configuredMap.set(p.pin, p));

    return NANO_PINS.map(def => {
      const existing = configuredMap.get(def.pin);
      return {
        pin:        def.pin,
        type:       existing?.type ?? "Unconfigured",
        name:       existing?.name ?? "",
        pixelCount: String(existing?.pixelCount ?? 8),
        dirty:      false,
      };
    });
  }, [nano?.id]); // intentionally only recomputes when the nano ID changes

  const [edits, setEdits] = useState<PinEdit[]>(initialEdits);
  const [saving, setSaving] = useState(false);

  // Reset when navigating to a different nano
  useEffect(() => { setEdits(initialEdits); }, [initialEdits]);

  function updatePin(pin: number, partial: Partial<PinEdit>) {
    setEdits(prev => prev.map(e => e.pin === pin ? { ...e, ...partial } : e));
  }

  const dirtyCount = edits.filter(e => e.dirty).length;

  async function saveAll() {
    setSaving(true);
    try {
      // Snapshot of what was configured before this save
      const previousPins = new Set(nano?.pins.map(p => p.pin) ?? []);

      for (const edit of edits) {
        if (!edit.dirty) continue;

        const wasCfg = previousPins.has(edit.pin);
        const nowCfg = edit.type !== "Unconfigured";

        if (nowCfg) {
          // Add or update type/pixelCount
          await robotClient.configureNanoPin(
            nanoId,
            edit.pin,
            edit.type as PinType,
            Number(edit.pixelCount) || 8,
          );
          // Set name (pin now exists in state)
          if (edit.name.trim() !== "") {
            await robotClient.renameNanoPin(nanoId, edit.pin, edit.name.trim());
          }
        } else if (wasCfg) {
          // Was configured, now unconfigured → remove
          await robotClient.configureNanoPin(nanoId, edit.pin, "Unconfigured" as any);
        }
      }

      // Refresh IO state then go back
      await robotClient.getIO().catch(() => {});
      router.back();
    } catch {
      // stay on page — user can retry
    } finally {
      setSaving(false);
    }
  }

  if (!nano) {
    return (
      <View style={styles.centred}>
        <Text style={styles.notFound}>Nano device not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <PageHeader
          title="Configure Pins"
          subtitle={nano.name}
          crumbs={[
            { label: "I/O", href: "/io" },
            { label: nano.name, href: `/(tabs)/io/nanos?nanoId=${encodeURIComponent(nano.id)}` },
            { label: "Configure Pins" },
          ]}
          right={
            <Button
              variant="primary"
              size="sm"
              label={dirtyCount > 0 ? `Save (${dirtyCount})` : "Save"}
              icon={<Check size={16} color={colors.onAccent} />}
              loading={saving}
              disabled={dirtyCount === 0}
              onPress={saveAll}
              style={{ backgroundColor: "#4f46e5" }}
            />
          }
        />

        {/* ── Column headers (narrow: one shared header; wide: one per column) ── */}
        {!isWide && <ColumnHeaders style={wideContent} />}

        {/* ── Pin list ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.listContent, wideContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isWide ? (
            <View style={styles.pinColumnsRow}>
              {[NANO_PINS.slice(0, Math.ceil(NANO_PINS.length / 2)), NANO_PINS.slice(Math.ceil(NANO_PINS.length / 2))].map(
                (colPins, ci) => (
                  <View key={ci} style={styles.pinColumn}>
                    <ColumnHeaders />
                    {colPins.map(def => (
                      <PinRow
                        key={def.pin}
                        def={def}
                        edit={edits.find(e => e.pin === def.pin)!}
                        onChange={partial => updatePin(def.pin, partial)}
                      />
                    ))}
                  </View>
                )
              )}
            </View>
          ) : (
            NANO_PINS.map(def => (
              <PinRow
                key={def.pin}
                def={def}
                edit={edits.find(e => e.pin === def.pin)!}
                onChange={partial => updatePin(def.pin, partial)}
              />
            ))
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  notFound: { fontSize: 15, color: colors.textMuted },


  // ── Column headers ─────────────────────────────────────────────────────────
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.6,
  },

  // ── Pin list ───────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xs + 2,
  },

  // Wide: two side-by-side pin columns instead of one long list.
  pinColumnsRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  pinColumn:     { flex: 1, minWidth: 0, gap: spacing.xs + 2 },

  // ── Pin row ────────────────────────────────────────────────────────────────
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinRowDirty: {
    borderColor: "#a5b4fc",
    backgroundColor: "#fafafe",
  },

  // ── Pin label ──────────────────────────────────────────────────────────────
  pinLabelWrap: { width: 44 },
  pinLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  pinNote:  { fontSize: 9, color: colors.textFaint, marginTop: 1 },

  // ── Type chip + dropdown ───────────────────────────────────────────────────
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    width: 52,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: "center",
  },
  typeChipText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  typeModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  typeMenuCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    width: 200,
    paddingVertical: spacing.xs + 2,
    ...shadows.raised,
  },
  typeMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.sm,
    marginHorizontal: spacing.xs,
  },
  typeMenuChip: {
    width: 36,
    height: 22,
    borderRadius: radii.sm - 4,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  typeMenuChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  typeMenuLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  typeMenuDot: { width: 7, height: 7, borderRadius: 4 },

  // ── Name input ─────────────────────────────────────────────────────────────
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    fontSize: 13,
  },
  nameInputPlaceholder: { flex: 1, minWidth: 0 },

  // ── Pixel count ────────────────────────────────────────────────────────────
  pixelInput: {
    width: 42,
    minHeight: 0,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    borderColor: colors.warningBorder,
    fontSize: 13,
    color: "#92400e",
    backgroundColor: colors.warningSoft,
    textAlign: "center",
  },
});
