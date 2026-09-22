import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { spacing, type } from "./theme";

type Props = {
  /** Rendered uppercase; pass normal casing ("Discovered robots"). */
  title: string;
  /** Optional accessory on the right edge (spinner, count, "See all" link). */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Uppercase micro-label that introduces a group of cards. */
export function SectionHeader({ title, right, style }: Props) {
  return (
    <View style={[styles.row, style]}>
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
});

