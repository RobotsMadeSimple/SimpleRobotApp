import { useRelayIO } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { ArrowLeft, Check, Radio } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const RELAY_COUNT = 4;

export default function ConfigureRelayPage() {
  const relay   = useRelayIO();
  const names   = relay?.names ?? ["Relay 1", "Relay 2", "Relay 3", "Relay 4"];

  // Local edit state — string per channel
  const [edits,  setEdits]  = useState<string[]>(names);
  const [saving, setSaving] = useState(false);

  // Re-sync when relay state arrives (e.g. first load after navigation)
  useEffect(() => {
    setEdits(names);
  }, [JSON.stringify(names)]);

  const dirty = edits.some((e, i) => e !== names[i]);

  function updateName(index: number, value: string) {
    setEdits(prev => prev.map((n, i) => (i === index ? value : n)));
  }

  async function saveAll() {
    setSaving(true);
    try {
      for (let i = 0; i < RELAY_COUNT; i++) {
        const trimmed = edits[i]?.trim() ?? "";
        if (trimmed !== names[i]) {
          await robotClient.renameRelay(i + 1, trimmed || `Relay ${i + 1}`);
        }
      }
      router.back();
    } catch {
      // Stay on page so user can retry
    } finally {
      setSaving(false);
    }
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
            <Text style={styles.topTitle}>Configure Relay Board</Text>
            <View style={styles.topSubRow}>
              <Radio size={11} color="#9ca3af" />
              <Text style={styles.topSub}>DCTTECH 4-Channel USB HID</Text>
            </View>
          </View>
          <Pressable
            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDim]}
            onPress={saveAll}
            disabled={!dirty || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Check size={16} color="#fff" />
            }
            <Text style={styles.saveBtnText}>
              {saving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        {/* ── Column headers ── */}
        <View style={styles.colHeaders}>
          <Text style={[styles.colHeader, { width: 60 }]}>CHANNEL</Text>
          <Text style={[styles.colHeader, { flex: 1 }]}>LABEL</Text>
        </View>

        {/* ── Relay rows ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {Array.from({ length: RELAY_COUNT }, (_, i) => {
            const isDirty = edits[i] !== names[i];
            return (
              <View key={i} style={[styles.row, isDirty && styles.rowDirty]}>
                <View style={styles.channelWrap}>
                  <View style={[styles.channelBadge, isDirty && styles.channelBadgeDirty]}>
                    <Text style={[styles.channelNum, isDirty && styles.channelNumDirty]}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text style={styles.channelSub}>CH{i + 1}</Text>
                </View>

                <TextInput
                  style={[styles.nameInput, isDirty && styles.nameInputDirty]}
                  value={edits[i] ?? ""}
                  onChangeText={v => updateName(i, v)}
                  placeholder={`Relay ${i + 1}`}
                  placeholderTextColor="#c4c9d4"
                  returnKeyType="next"
                  maxLength={32}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },

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
  topTitle:  { fontSize: 16, fontWeight: "700", color: "#111827" },
  topSubRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  topSub:    { fontSize: 11, color: "#9ca3af" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0891b2",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  saveBtnDim:  { opacity: 0.4 },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // ── Column headers ─────────────────────────────────────────────────────────
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  colHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.6,
  },

  // ── List ───────────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 6,
  },

  // ── Row ────────────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  rowDirty: {
    borderColor: "#67e8f9",
    backgroundColor: "#f0fdff",
  },

  // ── Channel badge ──────────────────────────────────────────────────────────
  channelWrap: {
    width: 48,
    alignItems: "center",
    gap: 2,
  },
  channelBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#ecfeff",
    borderWidth: 1.5,
    borderColor: "#a5f3fc",
    justifyContent: "center",
    alignItems: "center",
  },
  channelBadgeDirty: {
    backgroundColor: "#cffafe",
    borderColor: "#0891b2",
  },
  channelNum: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0891b2",
  },
  channelNumDirty: {
    color: "#0e7490",
  },
  channelSub: {
    fontSize: 9,
    color: "#9ca3af",
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // ── Name input ─────────────────────────────────────────────────────────────
  nameInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  nameInputDirty: {
    borderColor: "#0891b2",
    backgroundColor: "#ecfeff",
    color: "#0e7490",
  },
});
