import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ExpressionFunction } from "@/src/models/robotModels";
import { accents, colors, spacing, type } from "@/src/components/ui/kit";

/**
 * Every function the controller's evaluator knows, with its signature and what it does.
 * Tapping one inserts `name(` at the caret.
 *
 * Rendered inline inside ExpressionEditorModal rather than in a sheet of its own: the
 * reference and the expression being written belong on the same screen, and a sheet over
 * the editor would be the second layer of modal the editor exists to remove.
 */
export function FunctionsList({ functions, search, onInsert }: {
  functions: ExpressionFunction[];
  /** Filter shared with the modal's other reference sections. */
  search: string;
  onInsert: (name: string) => void;
}) {
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? functions.filter(f => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
      : functions;
  }, [functions, search]);

  if (functions.length === 0) return null;

  return (
    <View>
      {shown.length === 0 && <Text style={styles.empty}>No functions match.</Text>}
      {shown.map((f, i) => (
        <TouchableOpacity
          key={f.name}
          style={[styles.row, i < shown.length - 1 && styles.rowBorder]}
          onPress={() => onInsert(f.name)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Insert ${f.name}`}
        >
          <Text style={styles.signature}>{f.signature}</Text>
          {!!f.description && <Text style={styles.description}>{f.description}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty:       { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.lg },
  row:         { paddingVertical: 10 },
  rowBorder:   { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  signature:   { ...type.mono, color: accents.purple, fontWeight: "600" },
  description: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
});
