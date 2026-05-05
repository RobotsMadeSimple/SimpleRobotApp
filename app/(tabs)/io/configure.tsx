import { useNanoIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { NanoPinState, PinType } from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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

function typeColor(type: PinType | "Unconfigured") {
  if (type === "Input")    return { fg: "#2563eb", bg: "#eff6ff" };
  if (type === "Output")   return { fg: "#7c3aed", bg: "#f5f3ff" };
  if (type === "Neopixel") return { fg: "#d97706", bg: "#fffbeb" };
  return { fg: "#9ca3af", bg: "#f3f4f6" };
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
        <TextInput
          style={styles.nameInput}
          value={edit.name}
          onChangeText={v => onChange({ name: v, dirty: true })}
          placeholder="Label…"
          placeholderTextColor="#c4c9d4"
        />
      ) : (
        <View style={styles.nameInputPlaceholder} />
      )}

      {/* Pixel count — Neopixel only */}
      {edit.type === "Neopixel" && (
        <TextInput
          style={styles.pixelInput}
          value={edit.pixelCount}
          onChangeText={v => onChange({ pixelCount: v, dirty: true })}
          keyboardType="numeric"
          placeholder="px"
          placeholderTextColor="#c4c9d4"
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ConfigurePage() {
  const { nanoId } = useLocalSearchParams<{ nanoId: string }>();
  const nanos       = useNanoIO();
  const nano        = nanos.find(n => n.id === nanoId);

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
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={20} color="#111827" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>Configure Pins</Text>
            <View style={styles.topSubRow}>
              <Cpu size={11} color="#9ca3af" />
              <Text style={styles.topSub}>{nano.name}</Text>
            </View>
          </View>
          <Pressable
            style={[styles.saveBtn, (saving || dirtyCount === 0) && styles.saveBtnDim]}
            onPress={saveAll}
            disabled={saving || dirtyCount === 0}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Check size={16} color="#fff" />
            }
            <Text style={styles.saveBtnText}>
              {saving ? "Saving…" : dirtyCount > 0 ? `Save (${dirtyCount})` : "Save"}
            </Text>
          </Pressable>
        </View>

        {/* ── Column headers ── */}
        <View style={styles.colHeaders}>
          <Text style={[styles.colHeader, { width: 44 }]}>PIN</Text>
          <Text style={[styles.colHeader, { width: 52 }]}>TYPE</Text>
          <Text style={[styles.colHeader, { flex: 1 }]}>LABEL</Text>
        </View>

        {/* ── Pin list ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {NANO_PINS.map(def => (
            <PinRow
              key={def.pin}
              def={def}
              edit={edits.find(e => e.pin === def.pin)!}
              onChange={partial => updatePin(def.pin, partial)}
            />
          ))}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },

  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  notFound: { fontSize: 15, color: "#6b7280" },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  topSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  topSub: { fontSize: 11, color: "#9ca3af" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#4f46e5",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  saveBtnDim: { opacity: 0.4 },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // ── Column headers ─────────────────────────────────────────────────────────
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: "#f3f4f6",
  },
  colHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.6,
  },

  // ── Pin list ───────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 6,
  },

  // ── Pin row ────────────────────────────────────────────────────────────────
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  pinRowDirty: {
    borderColor: "#a5b4fc",
    backgroundColor: "#fafafe",
  },

  // ── Pin label ──────────────────────────────────────────────────────────────
  pinLabelWrap: { width: 44 },
  pinLabel: { fontSize: 13, fontWeight: "700", color: "#111827" },
  pinNote:  { fontSize: 9, color: "#9ca3af", marginTop: 1 },

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
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  typeMenuCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    width: 200,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  typeMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  typeMenuChip: {
    width: 36,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  typeMenuChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  typeMenuLabel: { flex: 1, fontSize: 14, color: "#374151" },
  typeMenuDot: { width: 7, height: 7, borderRadius: 4 },

  // ── Name input ─────────────────────────────────────────────────────────────
  nameInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 7,
    fontSize: 13,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  nameInputPlaceholder: { flex: 1, minWidth: 0 },

  // ── Pixel count ────────────────────────────────────────────────────────────
  pixelInput: {
    width: 42,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 7,
    fontSize: 13,
    color: "#92400e",
    backgroundColor: "#fffbeb",
    textAlign: "center",
  },
});
