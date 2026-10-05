import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, radii, spacing } from "./theme";

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /**
   * Selected-state color family: [text/border, fill] — e.g.
   * [accents.purple, accents.purpleSoft]. Defaults to the blue accent.
   */
  tint?: readonly [string, string];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Toggle chip for compact pickers: speed steps, steps-per-rev presets,
 * filter tags. Use several inside a ChipGroup.
 */
export function Chip({ label, selected = false, onPress, tint, disabled, style }: ChipProps) {
  const [fg, bg] = tint ?? [colors.accent, colors.accentSoft];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={[
        styles.chip,
        selected && { backgroundColor: bg, borderColor: fg },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, selected && { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

type ChipGroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Wrapping row layout for a set of Chips. */
export function ChipGroup({ children, style }: ChipGroupProps) {
  return <View style={[styles.group, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  label:    { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  disabled: { opacity: 0.5 },
  group:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
