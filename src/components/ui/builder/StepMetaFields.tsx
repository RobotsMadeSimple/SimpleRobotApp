import React from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { ProgramStep } from "@/src/models/robotModels";
import { colors, spacing } from "@/src/components/ui/kit";
import { ms } from "./builderStyles";

/** A step runs unless it is explicitly switched off. */
export const isStepEnabled = (s: ProgramStep): boolean => s.enabled !== false;

/**
 * The step with `enabled` set. Only `false` is ever written: absent means enabled,
 * which keeps saved programs identical for the common case.
 */
export function withStepEnabled(s: ProgramStep, enabled: boolean): ProgramStep {
  const { enabled: _previous, ...rest } = s;
  return enabled ? rest : { ...rest, enabled: false };
}

/**
 * "Enabled" switch and free-text comment, shown at the bottom of every step's
 * config page. Neither changes what the step does when it runs, so they sit after
 * the step's own settings rather than above them.
 */
export function StepMetaFields({ step, onChange }: {
  step: ProgramStep;
  onChange: (next: ProgramStep) => void;
}) {
  const enabled = isStepEnabled(step);
  return (
    <View style={styles.wrap}>
      <View style={ms.switchRow}>
        <View style={styles.switchText}>
          <Text style={ms.switchLabel}>Enabled</Text>
          <Text style={styles.hint}>
            {enabled ? "The step runs as normal." : "Skipped when the program runs. It stays in place so you can switch it back on."}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={v => onChange(withStepEnabled(step, v))}
          trackColor={{ false: colors.border, true: colors.accent }}
        />
      </View>

      <Text style={[ms.fieldLabel, styles.commentLabel]}>COMMENT  (optional)</Text>
      <TextInput
        style={[ms.input, styles.comment]}
        value={step.comment ?? ""}
        onChangeText={v => onChange({ ...step, comment: v.trim() ? v : undefined })}
        placeholder="Notes for whoever edits this program next. Never executed."
        placeholderTextColor={colors.textFaint}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  switchText:   { flex: 1, marginRight: spacing.md },
  hint:         { fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
  commentLabel: { marginTop: spacing.md },
  comment:      { minHeight: 64, marginTop: 6 },
});
