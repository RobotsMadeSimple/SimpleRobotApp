import { useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  Gamepad2,
  HomeIcon,
  OctagonX,
  RotateCcw,
} from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Control() {
  const robot = useSelectedRobot();
  const format = (v: number) => (v ?? 0).toFixed(1);

  return (
    <View style={styles.container}>
      {/* Position Display */}
      <View style={styles.row4}>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>X</Text>
          <Text style={styles.axisValue}>{format(robot?.status.x ?? 0)}</Text>
        </View>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>Y</Text>
          <Text style={styles.axisValue}>{format(robot?.status?.y ?? 0)}</Text>
        </View>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>Z</Text>
          <Text style={styles.axisValue}>{format(robot?.status?.z ?? 0)}</Text>
        </View>
        <View style={styles.axisBlock}>
          <Text style={styles.axisLabel}>RZ</Text>
          <Text style={styles.axisValue}>{format(robot?.status?.rz ?? 0)}</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.outlineButton}
          onPress={() => router.push("/control/jog")}
        >
          <Gamepad2 size={22} color="#222" />
          <Text style={styles.outlineButtonText}>Jog</Text>
        </Pressable>

        <Pressable
          style={styles.outlineButton}
          onPress={() => robotClient.sendCommand("Reset")}
        >
          <RotateCcw size={22} color="#222" />
          <Text style={styles.outlineButtonText}>Reset</Text>
        </Pressable>

        <Pressable
          style={styles.outlineButton}
          onPress={() => robotClient.sendCommand("Home")}
        >
          <HomeIcon size={22} color="#222" />
          <Text style={styles.outlineButtonText}>Home</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }} />

      {/* Stop Button */}
      <Pressable
        style={styles.stopButton}
        onPress={() => robotClient.sendCommand("HardStop")}
      >
        <OctagonX size={26} color="white" />
        <Text style={styles.stopText}>STOP</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },

  row4: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    marginTop: 20,
  },

  axisBlock: {
    alignItems: "center",
    flex: 1,
  },

  axisLabel: {
    color: "#666",
    fontSize: 18,
    marginBottom: 4,
  },

  axisValue: {
    color: "#000",
    fontSize: 22,
    fontFamily: "Courier",
    textAlign: "center",
    width: 90,
  },

  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 28,
  },

  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#444",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    backgroundColor: "transparent",
  },

  outlineButtonText: {
    color: "#222",
    fontSize: 17,
    fontWeight: "600",
  },

  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "red",
    borderRadius: 8,
    paddingVertical: 16,
    marginBottom: 16,
  },

  stopText: {
    color: "white",
    fontSize: 22,
    fontWeight: "bold",
    letterSpacing: 2,
  },
});
