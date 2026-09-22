
import { colors } from "@/src/components/ui/kit";
import { useConnected, useSelectedRobot } from "@/src/providers/RobotProvider";
import { Text, View } from "react-native";

export function ConnectionStatus() {
  const connected    = useConnected();
  const selectedRobot = useSelectedRobot();
  const robotName    = selectedRobot?.robotName;

  return (
    <View style={{ alignItems: "flex-end", marginRight: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            marginRight: 6,
            backgroundColor: connected ? colors.success : colors.danger,
          }}
        />
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: connected ? colors.success : colors.danger,
          }}
        >
          {connected ? "Connected" : "Disconnected"}
        </Text>
      </View>
      {robotName ? (
        <Text style={{ fontSize: 11, color: colors.textFaint, marginTop: 1 }}>
          {robotName}
        </Text>
      ) : null}
    </View>
  );
}