import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { colors, spacing } from "./theme";

type Props = {
  /** Indent the line past a leading IconTile inside a Card. */
  inset?: boolean;
  /** Vertical hairline between side-by-side items (stretches to row height). */
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Hairline separator between flat rows inside a Card (or columns, with `vertical`). */
export function Divider({ inset = false, vertical = false, style }: Props) {
  return (
    <View style={[vertical ? styles.vline : styles.line, inset && !vertical && styles.inset, style]} />
  );
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs / 2,
  },
  vline: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs / 2,
  },
  inset: { marginLeft: 44 + spacing.md }, // IconTile width + row gap
});

