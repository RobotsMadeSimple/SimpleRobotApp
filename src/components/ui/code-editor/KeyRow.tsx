import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { IndentDecrease, IndentIncrease, Plus, Redo2, Undo2 } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/components/ui/kit";
import type { EditorCommand } from "./bridge";

/** The symbols a phone keyboard hides behind a long press or a second layer (§7.2 key row). */
const SYMBOLS: { label: string; text: string; hint: string }[] = [
  { label: "$", text: "$", hint: "variable" },
  { label: "(", text: "(", hint: "open bracket" },
  { label: ")", text: ")", hint: "close bracket" },
  { label: "[", text: "[", hint: "open index" },
  { label: "]", text: "]", hint: "close index" },
  { label: "=", text: "=", hint: "equals" },
  { label: ",", text: ", ", hint: "comma" },
  { label: "\"", text: "\"", hint: "quote" },
  { label: "#", text: "# ", hint: "comment" },
  { label: "->", text: " -> ", hint: "arrow (into a variable)" },
  { label: ".", text: ".", hint: "dot" },
  { label: "_", text: "_", hint: "underscore" },
];

/**
 * The accessory row docked above the keyboard while editing program text: common symbols,
 * indent / outdent, undo / redo and "Insert step…". Taps never take focus, so the keyboard stays
 * up and the caret stays where it was.
 */
export function KeyRow({ send, onInsertStep, compact }: {
  send: (cmd: EditorCommand) => void;
  onInsertStep?: () => void;
  /** Desktop: hide the symbol keys (a real keyboard has them). */
  compact?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {onInsertStep && (
          <TouchableOpacity style={[styles.key, styles.insert]} onPress={onInsertStep} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Insert step">
            <Plus size={14} color={colors.accent} />
            <Text style={styles.insertText}>Step</Text>
          </TouchableOpacity>
        )}
        {!compact && SYMBOLS.map(s => (
          <TouchableOpacity key={s.label} style={styles.key} onPress={() => send({ type: "insertText", text: s.text })}
            activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={`Insert ${s.hint}`}>
            <Text style={styles.keyText}>{s.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.key} onPress={() => send({ type: "dedent" })} activeOpacity={0.6}
          accessibilityRole="button" accessibilityLabel="Outdent">
          <IndentDecrease size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => send({ type: "indent" })} activeOpacity={0.6}
          accessibilityRole="button" accessibilityLabel="Indent">
          <IndentIncrease size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => send({ type: "toggleComment" })} activeOpacity={0.6}
          accessibilityRole="button" accessibilityLabel="Comment or uncomment the line">
          <Text style={styles.keyText}>{"#/"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => send({ type: "undo" })} activeOpacity={0.6}
          accessibilityRole="button" accessibilityLabel="Undo typing">
          <Undo2 size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => send({ type: "redo" })} activeOpacity={0.6}
          accessibilityRole="button" accessibilityLabel="Redo typing">
          <Redo2 size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

export const KEY_ROW_HEIGHT = 46;

const styles = StyleSheet.create({
  bar: {
    height: KEY_ROW_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
  },
  row: { alignItems: "center", gap: 6, paddingHorizontal: spacing.sm },
  key: {
    minWidth: 38,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
  },
  keyText: { fontSize: 16, fontWeight: "600", color: colors.text, fontFamily: "monospace" },
  insert: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  insertText: { fontSize: 13, fontWeight: "700", color: colors.accent },
});
