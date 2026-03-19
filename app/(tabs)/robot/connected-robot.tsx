import { getSelectedRobot, setSelectedRobot } from "@/src/connections/robotState";
import { useRobots } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  ArrowLeftRight,
  CodeXml,
  Gamepad2,
  Info,
  Move3d,
} from "lucide-react-native";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const robotImages: Record<string, any> = {
  TBot: require("@/assets/images/TBot.png"),
};

const defaultRobotImage = require("@/assets/images/no-robot.png");

function changeRobot(){
    robotClient.disconnect();
    setSelectedRobot(null);
    router.back();
  }

export default function ConnectedRobot() {
  const selectedRobot = getSelectedRobot();
  const { robots } = useRobots();

  const robot =
    robots.find(r => r.serialNumber === selectedRobot?.serialNumber) ??
    selectedRobot;

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text>No robot selected</Text>
      </View>
    );
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;

  const menuItems = [
    {
      label: "Monitor Program",
      icon: <CodeXml size={30} color="#111" />,
      onPress: () => router.push("/program"),
    },
    {
      label: "Jog and Teach",
      icon: <Gamepad2 size={30} color="#111" />,
      onPress: () => router.push("/control"),
    },
    {
      label: "Points, Tools and Locals",
      icon: <Move3d size={30} color="#111" />,
      onPress: () => router.push("/space"),
    },
    {
      label: "Inputs and Outputs",
      icon: <ArrowLeftRight size={30} color="#111" />,
      onPress: () => router.push("/io"),
    },
    {
      label: "About Robot",
      icon: <Info size={30} color="#111" />,
      onPress: () => router.push("/robot/info"),
    },
  ];

  return (
    <View style={styles.container}>
      {/* Top Row */}
      <View style={styles.headerRow}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="contain"
        />

        <View style={styles.info}>
          <Text style={styles.title}>{robot.robotName}</Text>
          <Text style={styles.subtext}>
            {robot.ipAddress}:{robot.port}
          </Text>
        </View>

        <Pressable style={styles.backButton} onPress={changeRobot}>
          <Text style={styles.backButtonText}>Change</Text>
        </Pressable>
      </View>

      {/* Options */}
      <View style={styles.menu}>
        {menuItems.map((item, i) => (
          <Pressable
            key={i}
            style={styles.menuItem}
            onPress={item.onPress}
          >
            <View style={styles.menuIcon}>{item.icon}</View>
            <Text style={styles.menuText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },
  image: {
    width: 120,
    height: 120,
    marginRight: 16,
  },
  info: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
  },
  subtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  backButton: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: "center",
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  menu: {
    marginTop: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  menuIcon: {
    width: 30,
  },
  menuText: {
    paddingLeft: 16,
    fontSize: 16,
    color: "#111",
  },
  pressed: {
    opacity: 0.6,
  },
});
