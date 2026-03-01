
import { useRobots } from "@/src/providers/RobotProvider";
import { Text, View } from "react-native";

export function ConnectionStatus() {
  const { connected } = useRobots();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginRight: 12,
      }}
    >
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          marginRight: 6,
          backgroundColor: connected ? "#16a34a" : "#dc2626",
        }}
      />
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: connected ? "#16a34a" : "#dc2626",
        }}
      >
        {connected ? "Connected" : "Disconnected"}
      </Text>
    </View>
  );
}