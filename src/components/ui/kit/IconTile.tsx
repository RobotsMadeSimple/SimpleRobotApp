import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { colors, radii } from "./theme";

type Props = {
  children: ReactNode; // usually a lucide icon sized ~18–22
  /** Tile fill. Defaults to the soft accent blue. */
  color?: string;
  /** Square edge length. 36 for compact rows, 44 for device cards. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Rounded square holding an icon — the standard row/card leading visual. */
export function IconTile({ children, color = colors.accentSoft, size = 40, style }: Props) {
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: color, borderRadius: size >= 44 ? radii.md : radii.sm },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { justifyContent: "center", alignItems: "center" },
});

