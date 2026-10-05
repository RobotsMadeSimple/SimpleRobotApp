import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, radii, spacing } from "./theme";

export type PillTone = "success" | "danger" | "warning" | "accent" | "neutral";

const tones: Record<PillTone, { fg: string; bg: string }> = {
  success: { fg: colors.success,       bg: colors.successSoft },
  danger:  { fg: colors.danger,        bg: colors.dangerSoft },
  warning: { fg: colors.warning,       bg: colors.warningSoft },
  accent:  { fg: colors.accent,        bg: colors.accentSoft },
  neutral: { fg: colors.textMuted,     bg: colors.background },
};

type Props = {
  label: string;
  tone?: PillTone;
  /** Custom text/dot color for tint families outside the tones (e.g. accents.purple). */
  color?: string;
  /** Custom fill to pair with `color` (e.g. accents.purpleSoft). */
  background?: string;
  /** Show a small status dot before the label. */
  dot?: boolean;
  /** Custom leading icon (overrides dot). */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Soft-background pill for statuses: Connected / Offline / Running / counts. */
export function StatusPill({ label, tone = "neutral", color, background, dot = false, icon, style }: Props) {
  const fg = color ?? tones[tone].fg;
  const bg = background ?? (color != null ? colors.background : tones[tone].bg);
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon ?? (dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null)}
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  dot:  { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 11, fontWeight: "600" },
});

