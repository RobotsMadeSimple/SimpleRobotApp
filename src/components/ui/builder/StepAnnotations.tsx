import React from "react";
import { StyleSheet, Text } from "react-native";
import { EyeOff } from "lucide-react-native";
import { colors, spacing, StatusPill } from "@/src/components/ui/kit";

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

const styles = StyleSheet.create({
  pill:    { paddingVertical: 1, paddingHorizontal: 6 },
  comment: { fontSize: 12, color: colors.textFaint, fontStyle: "italic", marginTop: spacing.xs },
});
