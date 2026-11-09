import QRCode from "react-native-qrcode-svg";
import { StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "@/src/components/ui/kit";

// A station link rendered as a scannable QR code (SVG, so it works on web and native alike).
// White quiet-zone padding on a rounded card keeps it readable when printed or shown on screen.
export function StationQr({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <View style={[styles.frame, { padding: spacing.md }]}>
      <QRCode value={value} size={size} color="#000000" backgroundColor="#ffffff" ecl="M" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
