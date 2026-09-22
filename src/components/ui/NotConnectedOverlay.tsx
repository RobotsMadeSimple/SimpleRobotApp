import { colors } from "@/src/components/ui/kit";
import { setSelectedRobot } from "@/src/connections/robotState";
import { useConnected } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { WifiOff } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function NotConnectedOverlay() {
  const connected = useConnected();

  if (connected) return null;

  function connectToRobot() {
    robotClient.disconnect();
    setSelectedRobot(null);
    router.navigate("/(tabs)/robot");
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <WifiOff size={36} color={colors.textMuted} />
        </View>

        <Text style={styles.title}>Not Connected</Text>
        <Text style={styles.subtitle}>
          Connect to a robot to use this feature.
        </Text>

        <Pressable style={styles.button} onPress={connectToRobot}>
          <Text style={styles.buttonText}>Connect To Robot</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255,255,255,0.88)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },

  card: {
    width: 260,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.background,
  },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },

  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
  },

  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 4,
  },

  buttonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: "600",
  },
});
