import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { colors, spacing, type } from "./theme";

type Props = {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  /** Trailing accessory (chip, edit/delete buttons). */
  right?: ReactNode;
  /** Optional custom subtitle node in place of `subtitle` (e.g. mono coordinates). */
  subtitleNode?: ReactNode;
  /** Selected-state color when the page's identity isn't the accent blue (e.g. accents.purple). */
  tint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Flat selectable row with a radio indicator — active tool/local pickers,
 * base-point pickers. Stack inside a Card with Dividers.
 */
export function RadioRow({ title, subtitle, subtitleNode, selected, onPress, right, tint, style }: Props) {
  const activeColor = tint ?? colors.accent;
  return (
    <AnimatedPressable
      style={[styles.row, style]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.radio, selected && { borderColor: activeColor }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: activeColor }]} />}
      </View>
      <View style={styles.body}>
        <Text style={[type.title, selected && { color: activeColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitleNode ??
          (!!subtitle && <Text style={[type.subtitle, styles.sub]} numberOfLines={1}>{subtitle}</Text>)}
      </View>
      {right}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  body: { flex: 1 },
  sub:  { marginTop: 2 },
});
