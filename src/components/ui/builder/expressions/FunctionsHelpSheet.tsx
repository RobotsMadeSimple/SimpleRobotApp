import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { X } from "lucide-react-native";
import { ExpressionFunction } from "@/src/models/robotModels";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { accents, colors, radii, spacing, type } from "@/src/components/ui/kit";

/**
 * Every function the controller's evaluator knows, with its signature and what it
 * does. Tapping one inserts `name(` into the field the sheet was opened from.
 */
export function FunctionsHelpSheet({ visible, functions, onClose, onInsert }: {
  visible: boolean;
  functions: ExpressionFunction[];
  onClose: () => void;
  onInsert: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  // Cleared on the way out so the sheet always opens on the full list.
  const close = () => { setSearch(""); onClose(); };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? functions.filter(f => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
      : functions;
  }, [functions, search]);

  return (
    <BottomSheet visible={visible} onClose={close} title="Functions">
      <View style={styles.search}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search functions…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
            <X size={13} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {shown.length === 0 && <Text style={styles.empty}>No functions match.</Text>}
        {shown.map((f, i) => (
          <TouchableOpacity
            key={f.name}
            style={[styles.row, i < shown.length - 1 && styles.rowBorder]}
            onPress={() => { onInsert(f.name); close(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.signature}>{f.signature}</Text>
            {!!f.description && <Text style={styles.description}>{f.description}</Text>}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: 10, backgroundColor: colors.surfaceMuted, marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 9 },
  list:        { maxHeight: 440 },
  empty:       { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.lg },
  row:         { paddingVertical: 10 },
  rowBorder:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  signature:   { ...type.mono, color: accents.purple, fontWeight: "600" },
  description: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
});
