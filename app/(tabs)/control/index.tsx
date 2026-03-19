import { useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  Gamepad2,
  HomeIcon,
  MousePointerClick,
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
          style={styles.jogButton}
          onPress={() => router.push("/control/jog")}
        >
          <Gamepad2 size={26} color="white" />
          <Text style={styles.jogButtonText}>Jog</Text>
        </Pressable>

        <Pressable
          style={styles.stopButton}
          onPress={() => robotClient.sendCommand("HardStop")}
        >
          <OctagonX size={26} color="white" />
          <Text style={styles.stopButtonText}>Stop</Text>
        </Pressable>

        <Pressable
          style={styles.resetButton}
          onPress={() => robotClient.sendCommand("Reset")}
        >
          <RotateCcw size={26} color="white" />
          <Text style={styles.resetButtonText}>Reset</Text>
        </Pressable>
      </View>

      {/* Bottom Left Home Button */}
      <Pressable style={styles.bottomLeft} onPress={() => robotClient.sendCommand("Home")}>
        <Text style={styles.grayText}>Home </Text>
        <HomeIcon size={25} color="#666" />
      </Pressable>

      {/* Bottom Right Teach */}
      <Pressable style={styles.bottomRight} onPress={() => robotClient.sendCommand("Teach")}>
        <Text style={styles.redText}>Teach </Text>
        <MousePointerClick size={25} color="red" />
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
    gap: 16,
    marginTop: 32,
  },

  jogButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },

  jogButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },

  stopButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "red",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },

  stopButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },

  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f59e0b",
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },

  resetButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },

  bottomLeft: {
    position: "absolute",
    bottom: 20,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#999",
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },

  bottomRight: {
    position: "absolute",
    bottom: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "red",
    borderRadius: 6,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },

  grayText: {
    color: "#666",
    fontSize: 18,
  },

  redText: {
    color: "red",
    fontSize: 18,
  },
});
