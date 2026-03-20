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
          <WifiOff size={36} color="#6b7280" />
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.88)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },

  card: {
    width: 260,
    backgroundColor: "#fff",
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
    borderColor: "#f3f4f6",
  },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
  },

  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 4,
  },

  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
