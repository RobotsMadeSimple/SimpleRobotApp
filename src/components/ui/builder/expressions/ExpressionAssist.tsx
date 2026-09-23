import React, { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SquareFunction } from "lucide-react-native";
import { accents, colors, radii, spacing } from "@/src/components/ui/kit";
import { useExpressionEnv } from "./ExpressionEnv";
import { Completion, applyCompletion, completionsAt, insertAt } from "./completions";
import { useLiveValue } from "./useLiveValue";
import { FunctionsHelpSheet } from "./FunctionsHelpSheet";

const KIND_TINT: Record<Completion["kind"], string> = {
  variable: accents.purple,
  property: accents.cyan,
  io:       colors.success,
  function: colors.accent,
};

/**
 * Focus state for a field that shows ExpressionAssist. Losing focus is delayed a
 * moment so a tap on a suggestion chip (which blurs the field first, on web) still
 * lands before the chips disappear.
 */
export function useFieldFocus(): { focused: boolean; onFocus: () => void; onBlur: () => void } {
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFocus = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setFocused(true);
  }, []);
  const onBlur = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFocused(false), 250);
  }, []);
  return { focused, onFocus, onBlur };
}

/**
 * The extras under an expression field, fed by the builder's ExpressionEnv:
 *
 * - autocomplete chips while typing — `$` offers variables, properties and IO;
 *   a bare word offers function names (inserted with `(`);
 * - the expression's live value from the controller: the number, the error in
 *   red, or "—" when it cannot be evaluated right now;
 * - an ƒ button opening the functions reference.
 *
 * Renders nothing outside the builder (no env) so shared inputs stay unchanged.
 */
export function ExpressionAssist({ text, cursor, focused, showValue, onChangeText }: {
  text: string;
  /** Caret position; defaults to the end of the text. */
  cursor?: number;
  /** Suggestions only show while the field has focus. */
  focused: boolean;
  /** Evaluate live — callers skip plain numbers, which evaluate to themselves. */
  showValue: boolean;
  onChangeText: (next: string) => void;
}) {
  const env = useExpressionEnv();
  const [helpOpen, setHelpOpen] = useState(false);
  const caret = Math.min(cursor ?? text.length, text.length);

  const completion = useMemo(
    () => (env && focused ? completionsAt(text, caret, env.symbols, env.localVariables) : null),
    [env, focused, text, caret]);
  const live = useLiveValue(env, text, showValue);

  if (!env) return null;
  const functions = env.symbols?.functions ?? [];
  // The functions link appears while the field is being edited; the value line
  // whenever there is something to show. Idle numeric fields stay as they were.
  const showFunctions = functions.length > 0 && (focused || helpOpen);
  if (!completion && live.kind === "none" && !showFunctions) return null;

  return (
    <View>
      {completion && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
          style={styles.suggestions} contentContainerStyle={styles.suggestionsContent}>
          {completion.items.map(item => (
            <TouchableOpacity
              key={`${item.kind}:${item.label}`}
              style={styles.suggestion}
              onPress={() => onChangeText(applyCompletion(text, completion.start, caret, item.insert))}
              activeOpacity={0.7}
            >
              <Text style={[styles.suggestionText, { color: KIND_TINT[item.kind] }]}>
                {item.label}
                {item.computed && <Text style={styles.computedTag}>  ƒ</Text>}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {(live.kind !== "none" || showFunctions) && <View style={styles.statusRow}>
        <View style={styles.value}>
          {live.kind === "value" && <Text style={styles.valueText} numberOfLines={1}>= {live.text}</Text>}
          {live.kind === "error" && <Text style={styles.errorText} numberOfLines={2}>{live.text}</Text>}
          {live.kind === "unavailable" && (
            <Text style={styles.mutedText} numberOfLines={1}>= —  (evaluated while the program runs)</Text>
          )}
        </View>
        {showFunctions && (
          <TouchableOpacity onPress={() => setHelpOpen(true)} hitSlop={8} activeOpacity={0.7}
            style={styles.fnBtn} accessibilityRole="button" accessibilityLabel="Functions">
            <SquareFunction size={14} color={colors.accent} />
            <Text style={styles.fnText}>Functions</Text>
          </TouchableOpacity>
        )}
      </View>}

      <FunctionsHelpSheet
        visible={helpOpen}
        functions={functions}
        onClose={() => setHelpOpen(false)}
        onInsert={name => onChangeText(insertAt(text, caret, `${name}(`))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  suggestions:        { marginTop: 6 },
  suggestionsContent: { gap: 5 },
  suggestion: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4,
  },
  suggestionText: { fontSize: 12, fontWeight: "600" },
  computedTag:    { fontStyle: "italic", fontWeight: "700", color: colors.textMuted },
  statusRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4, minHeight: 18 },
  value:      { flex: 1, minWidth: 0 },
  valueText:  { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  errorText:  { fontSize: 12, color: colors.danger },
  mutedText:  { fontSize: 12, color: colors.textFaint },
  fnBtn:      { flexDirection: "row", alignItems: "center", gap: 3 },
  fnText:     { fontSize: 11, fontWeight: "600", color: colors.accent },
});
