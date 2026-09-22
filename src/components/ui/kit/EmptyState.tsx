import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, spacing } from "./theme";

type Props = {
  /** Large icon (lucide, ~32, color colors.textFaint reads best). */
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  /** Optional call to action (a kit Button). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Centered placeholder for empty lists and scanning/waiting states. */
export function EmptyState({ icon, title, subtitle, action, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {icon != null && <View style={styles.iconCircle}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action != null && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingTop: spacing.xxl + spacing.sm,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm + 2,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  title:    { fontSize: 16, fontWeight: "600", color: colors.textSecondary },
  subtitle: { fontSize: 13, color: colors.textFaint, textAlign: "center", lineHeight: 19 },
  action:   { marginTop: spacing.sm },
});

