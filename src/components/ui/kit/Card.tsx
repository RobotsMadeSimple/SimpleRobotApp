import { ReactNode } from "react";
import { GestureResponderEvent, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { colors, radii, shadows, spacing } from "./theme";

type Props = {
  children: ReactNode;
  /** When set, the card is pressable with the standard scale animation. */
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  /** Remove default padding (e.g. card containing edge-to-edge rows). */
  padded?: boolean;
};

/** White rounded surface with the standard soft shadow. */
export function Card({ children, onPress, onLongPress, style, padded = true }: Props) {
  const base = [styles.card, padded && styles.padded, style];
  if (onPress || onLongPress) {
    return (
      <AnimatedPressable style={base} onPress={onPress} onLongPress={onLongPress}>
        {children}
      </AnimatedPressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    ...shadows.soft,
  },
  padded: { padding: spacing.lg - 2 },
});

