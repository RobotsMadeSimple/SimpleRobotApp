import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight, CircleAlert, TriangleAlert } from "lucide-react-native";
import { KnownValidationCode, ValidationProblem } from "@/src/models/robotModels";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { colors, spacing, StatusPill } from "@/src/components/ui/kit";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What to do about a problem, for codes whose controller message says what is wrong
 * but not where to fix it. The message itself always comes from the controller.
 */
export const PROBLEM_HINTS: Partial<Record<KnownValidationCode, string>> = {
  unknownPlugin:         "Install the plugin (IO → Plugins) or delete this step.",
  unknownPluginStep:     "The installed plugin no longer offers this step — update the plugin or delete the step.",
  pluginNotRunning:      "Start the plugin from IO → Plugins before running the program.",
  pluginParamMissing:    "Open the step and fill in the highlighted parameter.",
  pluginParamEnum:       "Open the step and pick one of the listed options.",
  pluginOutputType:      "Map the output to a variable of the matching kind.",
  unknownPluginFunction: "Check the plugin's functions in the expression editor.",
};

/**
 * Header pill with the problem count: red when anything is an error, amber when
 * there are only warnings, nothing at all for a clean program.
 */
export function ProblemsPill({ errorCount, warningCount, onPress }: {
  errorCount: number; warningCount: number; onPress: () => void;
}) {
  if (errorCount === 0 && warningCount === 0) return null;
  const label = errorCount > 0
    ? plural(errorCount, "error") + (warningCount > 0 ? ` · ${plural(warningCount, "warning")}` : "")
    : plural(warningCount, "warning");
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={6} accessibilityRole="button"
      accessibilityLabel={`${label}. Show problems`}>
      <StatusPill
        label={label}
        tone={errorCount > 0 ? "danger" : "warning"}
        icon={errorCount > 0
          ? <CircleAlert size={12} color={colors.danger} />
          : <TriangleAlert size={12} color={colors.warning} />}
      />
    </TouchableOpacity>
  );
}

/**
 * Every problem the controller found, errors first. Tapping one that belongs to a
 * step hands it back to the builder, which navigates to and opens that step.
 */
export function ValidationPanel({ visible, problems, onClose, onSelect }: {
  visible: boolean;
  problems: ValidationProblem[];
  onClose: () => void;
  onSelect: (problem: ValidationProblem) => void;
}) {
  const sorted = [...problems].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1);
  const errors = problems.filter(p => p.severity === "error").length;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Problems">
      <Text style={styles.summary}>
        {errors > 0
          ? "Errors stop the program from running. You can still save it."
          : "Warnings do not stop the program from running."}
      </Text>
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 && <Text style={styles.empty}>No problems found.</Text>}
        {sorted.map((p, i) => {
          const isError = p.severity === "error";
          const tappable = !!p.stepId;
          return (
            <TouchableOpacity
              key={`${p.stepId}-${p.code}-${p.field ?? ""}-${i}`}
              style={[styles.row, i < sorted.length - 1 && styles.rowBorder]}
              onPress={tappable ? () => onSelect(p) : undefined}
              disabled={!tappable}
              activeOpacity={0.7}
            >
              <View style={[styles.dot, { backgroundColor: isError ? colors.danger : colors.warning }]} />
              <View style={styles.text}>
                <Text style={styles.message}>{p.message}</Text>
                {!!PROBLEM_HINTS[p.code as KnownValidationCode] && (
                  <Text style={styles.hint}>{PROBLEM_HINTS[p.code as KnownValidationCode]}</Text>
                )}
                <Text style={styles.meta} numberOfLines={1}>
                  {[p.stepPath || (p.stepId ? "" : "Program"), p.field, p.code].filter(Boolean).join("  ·  ")}
                </Text>
              </View>
              {tappable && <ChevronRight size={15} color={colors.textFaint} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  summary:   { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  list:      { maxHeight: 420 },
  empty:     { fontSize: 13, color: colors.textFaint, textAlign: "center", paddingVertical: spacing.lg },
  row:       { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  text:      { flex: 1, minWidth: 0 },
  message:   { fontSize: 14, color: colors.text },
  meta:      { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  hint:      { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
