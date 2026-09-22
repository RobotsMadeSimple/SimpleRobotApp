import { LucideIcon } from "lucide-react-native";
import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, spacing, type } from "./theme";

type Props = {
  /** Rendered uppercase; pass normal casing ("Discovered robots"). */
  title: string;
  /** Small leading icon to aid scanning down a long page. */
  icon?: LucideIcon;
  /** Optional accessory on the right edge (spinner, count, InfoTip, "See all" link). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Uppercase micro-label that introduces a group of cards. */
export function SectionHeader({ title, icon: Icon, right, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      {Icon && <Icon size={13} color={colors.textMuted} style={styles.icon} />}
      <Text style={type.sectionLabel}>{title}</Text>
      {right != null && <View style={styles.right}>{right}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: -spacing.xs, // Screen's gap provides the rest
  },
  right: { marginLeft: spacing.sm },
  icon:  { marginRight: spacing.xs + 2 },
});

