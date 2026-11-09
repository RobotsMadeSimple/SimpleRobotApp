import React from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { colors, radii, spacing } from "./theme";

/** Road-sign caution colours: yellow fill, black outline and "!". */
const CAUTION_FILL = "#facc15";
const CAUTION_INK  = "#000000";

/** Yellow caution triangle with a black outline — marks a required choice that is still missing. */
export function CautionTriangle({ size = 16 }: { size?: number }) {
  return <AlertTriangle size={size} color={CAUTION_INK} fill={CAUTION_FILL} strokeWidth={2} />;
}

/** Warning tint for a row whose required value is not set yet (spread into the row's style). */
export const cautionRowStyle: ViewStyle = {
  backgroundColor: colors.warningSoft,
  borderWidth: 1,
  borderColor: colors.warningBorder,
};

/** One-line caution note (triangle + text), e.g. under a field label when nothing is chosen. */
export function CautionNote({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[{
        flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs,
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.sm,
      }, cautionRowStyle, style]}
    >
      <CautionTriangle size={15} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.textSecondary }}>{children}</Text>
    </View>
  );
}
