import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, radii, shadows, spacing } from "./theme";

type Option<T extends string> = { label: string; value: T };

type Props<T extends string> = {
  /** Segments, in order. Plain strings use the string as both label and value. */
  options: readonly (Option<T> | T)[];
  value: T;
  onChange: (value: T) => void;
  /** md (default) for page controls, sm for inline/toolbar use. */
  size?: "md" | "sm";
  style?: StyleProp<ViewStyle>;
};

/**
 * Equal-width segmented switch on a muted track — jog modes, speed tiers,
 * ± direction toggles. The selected segment lifts onto a white pill.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, size = "md", style,
}: Props<T>) {
  return (
    <View style={[styles.track, style]}>
      {options.map((opt) => {
        const o = typeof opt === "string" ? { label: opt, value: opt } : opt;
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.segment, size === "sm" && styles.segmentSm, selected && styles.selected]}
            onPress={() => { if (!selected) onChange(o.value); }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[styles.label, size === "sm" && styles.labelSm, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  segmentSm: { paddingVertical: spacing.xs + 2 },
  selected: {
    backgroundColor: colors.surface,
    ...shadows.soft,
  },
  label:         { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  labelSm:       { fontSize: 12 },
  labelSelected: { color: colors.accent },
});
