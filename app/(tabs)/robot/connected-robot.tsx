import { setSelectedRobot } from "@/src/connections/robotState";
import { useRobots, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  ArrowLeftRight,
  ChevronRight,
  CodeXml,
  Gamepad2,
  Info,
  Move3d,
  Settings2,
} from "lucide-react-native";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const robotImages: Record<string, any> = {
  ASTRO: require("@/assets/images/ASTRO.png"),
};

const defaultRobotImage = require("@/assets/images/no-robot.png");

function changeRobot() {
  robotClient.disconnect();
  setSelectedRobot(null);
  router.replace("/robot");
}

const MENU_ITEMS = [
  {
    label: "Monitor Program",
    description: "View and manage running programs",
    icon: CodeXml,
    tileColor: "#eff6ff",
    iconColor: "#2563eb",
    onPress: () => router.navigate("/program"),
  },
  {
    label: "Jog and Teach",
    description: "Manually move the robot and save points",
    icon: Gamepad2,
    tileColor: "#f0fdf4",
    iconColor: "#16a34a",
    onPress: () => router.navigate("/control"),
  },
  {
    label: "Points, Tools & Locals",
    description: "Manage saved positions and tool frames",
    icon: Move3d,
    tileColor: "#f5f3ff",
    iconColor: "#7c3aed",
    onPress: () => router.navigate("/space"),
  },
  {
    label: "Inputs and Outputs",
    description: "Monitor and control digital I/O",
    icon: ArrowLeftRight,
    tileColor: "#fff7ed",
    iconColor: "#ea580c",
    onPress: () => router.navigate("/io"),
  },
  {
    label: "Configure",
    description: "Homing offsets, speeds and motion settings",
    icon: Settings2,
    tileColor: "#fdf4ff",
    iconColor: "#9333ea",
    onPress: () => router.navigate("/robot/config"),
  },
  {
    label: "About Robot",
    description: "Serial number, firmware and diagnostics",
    icon: Info,
    tileColor: "#f9fafb",
    iconColor: "#6b7280",
    onPress: () => router.navigate("/robot/about"),
  },
];

export default function ConnectedRobot() {
  const selectedRobot = useSelectedRobot();
  const robots = useRobots();

  const robot =
    robots.find((r) => r.serialNumber === selectedRobot?.serialNumber) ??
    selectedRobot;

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No robot selected</Text>
        <TouchableOpacity style={styles.disconnectBtn} onPress={changeRobot} activeOpacity={0.8}>
          <Text style={styles.disconnectBtnText}>Back to Robot Selection</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Robot info card */}
      <Text style={styles.sectionLabel}>CONNECTED ROBOT</Text>
      <View style={styles.card}>
        <View style={styles.robotRow}>
          <View style={styles.imageWrapper}>
            <Image source={imageSource} style={styles.robotImage} resizeMode="contain" />
          </View>

          <View style={styles.robotInfo}>
            <Text style={styles.robotName} numberOfLines={1}>{robot.robotName}</Text>
            {!!robot.robotType && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{robot.robotType}</Text>
              </View>
            )}
            <Text style={styles.robotIp} numberOfLines={1}>
              {robot.ipAddress}:{robot.port}
            </Text>
          </View>
        </View>

        <View style={styles.cardSeparator} />

        <TouchableOpacity style={styles.changeBtn} onPress={changeRobot} activeOpacity={0.8}>
          <Text style={styles.changeBtnText}>Change Robot</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation menu */}
      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>NAVIGATE TO</Text>
      <View style={styles.card}>
        {MENU_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const isLast = i === MENU_ITEMS.length - 1;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.menuRow, !isLast && styles.menuRowBorder]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.iconTile, { backgroundColor: item.tileColor }]}>
                <Icon size={20} color={item.iconColor} />
              </View>

              <View style={styles.menuText}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuDesc} numberOfLines={1}>{item.description}</Text>
              </View>

              <ChevronRight size={18} color="#d1d5db" />
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    gap: 16,
  },
  centerText: {
    fontSize: 15,
    color: "#6b7280",
  },
  disconnectBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  disconnectBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },

  // ── Robot info ─────────────────────────────────────────────────────────────
  robotRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  imageWrapper: {
    width: 120,
    height: 120,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  robotImage: {
    width: 120,
    height: 120,
  },
  robotInfo: {
    flex: 1,
    gap: 4,
  },
  robotName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },
  robotIp: {
    fontSize: 13,
    color: "#9ca3af",
  },
  cardSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
  },
  changeBtn: {
    paddingVertical: 13,
    alignItems: "center",
  },
  changeBtnText: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 14,
  },

  // ── Menu rows ──────────────────────────────────────────────────────────────
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  menuDesc: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
