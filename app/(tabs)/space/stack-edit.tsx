import { wide } from "@/src/components/ui/responsive";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
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
  TextInput,
  TouchableOpacity,
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
    <TextInput
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
      placeholderTextColor="#9ca3af"
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
    <TextInput
      style={s.input}
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
      placeholderTextColor="#9ca3af"
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
      style={{ flex: 1, backgroundColor: "#f3f4f6" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SubPageHeader
        title={isNew ? "New Stack" : "Edit Stack"}
        right={
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={8}
            activeOpacity={0.7}
            style={[s.saveBtn, !canSave && { opacity: 0.4 }]}
          >
            <Text style={s.saveBtnText}>Save</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[s.scroll, wide.content]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Name ── */}
        <Text style={s.sectionLabel}>NAME</Text>
        <View style={s.card}>
          <TextInput
            style={s.cardInput}
            value={draft.name}
            onChangeText={v => set({ name: v })}
            placeholder="e.g. Tube Rack A"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* ── Base Point ── */}
        <Text style={s.sectionLabel}>BASE POINT</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.pickerRow}
            onPress={() => setPointPickerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={[s.pickerRowText, !draft.basePointName && { color: "#9ca3af" }]}>
              {draft.basePointName || "Select point…"}
            </Text>
            <ChevronRight size={16} color="#d1d5db" />
          </TouchableOpacity>
        </View>

        {/* ── Step Offset ── */}
        <Text style={s.sectionLabel}>STEP OFFSET  (mm per index step)</Text>
        <View style={s.card}>
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
        </View>

        {/* ── Max Count ── */}
        <Text style={s.sectionLabel}>MAX COUNT  (optional — enables round-robin)</Text>
        <View style={s.card}>
          <View style={s.countRow}>
            <OptionalCountInput
              value={draft.maxCount}
              onChange={v => set({ maxCount: v })}
            />
          </View>
          <Text style={s.hint}>
            When set, indices ≥ max count wrap around via modulo.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

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
              <TouchableOpacity onPress={() => setPointPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {points.length === 0 && (
                <Text style={s.pickerEmpty}>No points saved yet.</Text>
              )}
              {points.map((p, i) => {
                const active = draft.basePointName === p.name;
                return (
                  <TouchableOpacity
                    key={p.name}
                    style={[s.pickerItem, i < points.length - 1 && s.pickerItemBorder, active && s.pickerItemActive]}
                    onPress={() => { set({ basePointName: p.name }); setPointPickerOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.radioRing, active && s.radioRingActive]}>
                      {active && <View style={s.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pickerItemLabel, active && { color: "#7c3aed" }]}>{p.name}</Text>
                      <Text style={s.pickerItemDesc}>{p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}</Text>
                    </View>
                  </TouchableOpacity>
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
  scroll: { padding: 16 },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#6b7280",
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    overflow: "hidden",
  },

  cardInput: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: "#111827",
  },

  input: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },

  axisRow: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  axisCol: { flex: 1 },
  axisLabel: {
    fontSize: 11, fontWeight: "600", color: "#9ca3af",
    textAlign: "center", marginBottom: 4,
  },

  countRow: {
    padding: 14,
    paddingBottom: 8,
  },
  hint: {
    fontSize: 12, color: "#9ca3af",
    paddingHorizontal: 14, paddingBottom: 12,
  },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  pickerRowText: {
    fontSize: 15, color: "#111827",
  },

  saveBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  saveBtnText: {
    color: "#fff", fontSize: 14, fontWeight: "600",
  },

  // ── Point picker modal ────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: 300,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    overflow: "hidden",
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  pickerTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  pickerEmpty: {
    fontSize: 13, color: "#9ca3af",
    textAlign: "center", padding: 20,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  pickerItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  pickerItemActive:  { backgroundColor: "#f5f3ff" },
  pickerItemLabel:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  pickerItemDesc:    { fontSize: 11, color: "#9ca3af", fontFamily: "monospace", marginTop: 1 },

  radioRing: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: "#d1d5db",
    justifyContent: "center", alignItems: "center",
  },
  radioRingActive: { borderColor: "#7c3aed" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#7c3aed" },
});
