import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { EyeOff } from "lucide-react-native";
import { colors, spacing, StatusPill } from "@/src/components/ui/kit";
import type { StepProblems } from "./useProgramValidation";

/** Small pill beside a disabled step's type label. */
export function DisabledPill() {
  return (
    <StatusPill
      label="disabled"
      tone="neutral"
      icon={<EyeOff size={10} color={colors.textMuted} />}
      style={styles.pill}
    />
  );
}

/** The step's comment as a muted line under its details. */
export function StepComment({ text }: { text: string }) {
  return <Text style={styles.comment} numberOfLines={3}>{text}</Text>;
}

const hasError = (p: StepProblems) => [...p.own, ...p.nested].some(x => x.severity === "error");

/** Red (any error) or amber (warnings only) dot on a step with validation problems. */
export function ProblemDot({ problems, onPress }: { problems: StepProblems; onPress: () => void }) {
  const count = problems.own.length + problems.nested.length;
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} activeOpacity={0.7} style={styles.dotHit}
      accessibilityRole="button" accessibilityLabel={`${count} problem${count === 1 ? "" : "s"}`}>
      <View style={[styles.dot, { backgroundColor: hasError(problems) ? colors.danger : colors.warning }]} />
    </TouchableOpacity>
  );
}

/** The first problem's message, shown under the step when its dot is pressed. */
export function ProblemMessage({ problems }: { problems: StepProblems }) {
  const first = problems.own[0] ?? problems.nested[0];
  if (!first) return null;
  const color = first.severity === "error" ? colors.danger : colors.warning;
  const text = problems.own.length > 0
    ? first.message
    : `${problems.nested.length} problem${problems.nested.length === 1 ? "" : "s"} inside — ${first.message}`;
  const more = problems.own.length > 1 ? `  (+${problems.own.length - 1} more)` : "";
  return <Text style={[styles.problem, { color }]} numberOfLines={3}>{text}{more}</Text>;
}

const styles = StyleSheet.create({
  dotHit:  { padding: 4 },
  dot:     { width: 9, height: 9, borderRadius: 5 },
  problem: { fontSize: 12, marginTop: spacing.xs },
  pill:    { paddingVertical: 1, paddingHorizontal: 6 },
  comment: { fontSize: 12, color: colors.textFaint, fontStyle: "italic", marginTop: spacing.xs },
});
