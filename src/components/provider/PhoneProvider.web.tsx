import { View, Text, StyleSheet } from "react-native";

import { Card, colors, spacing, type } from "@/src/components/ui/kit";

/**
 * The phone provider turns a device's camera + sensors into a controller data source.
 * It depends on native camera/sensor modules, so on web/Electron it's just a notice.
 */
export function PhoneProvider({ deviceName }: { deviceId?: string; deviceName?: string }) {
  return (
    <View style={styles.wrap}>
      <Card style={styles.card}>
        <Text style={type.title}>Streaming is mobile-only</Text>
        <Text style={type.body}>
          {deviceName ? `“${deviceName}” is set up. ` : ""}
          Open Simple Robot on an Android or iOS device and link that phone to this device to stream
          its camera and sensors. There&apos;s nothing to stream from a desktop browser.
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, gap: spacing.md },
  card: { gap: spacing.sm, backgroundColor: colors.surface },
});
