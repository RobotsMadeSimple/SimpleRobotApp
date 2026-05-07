import { setSelectedRobot } from "@/src/connections/robotState";
import { RobotInfo } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Router } from "lucide-react-native";
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const robotImages: Record<string, any> = {
  ASTRO: require("@/assets/images/ASTRO.png"),
};

const defaultRobotImage = require("@/assets/images/no-robot.png");

export function RobotCard({ robot }: { robot: RobotInfo }) {
  function setRobot() {
    setSelectedRobot(robot);
    robotClient.connectTo(robot);
    router.replace(`/robot/connected-robot`);
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;

  return (
    <TouchableOpacity onPress={setRobot} activeOpacity={0.75} style={styles.card}>
      <View style={styles.row}>
        {/* Robot image */}
        <View style={styles.imageWrapper}>
          <Image source={imageSource} style={styles.image} resizeMode="contain" />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{robot.robotName}</Text>
          <Text style={styles.type} numberOfLines={1}>{robot.robotType}</Text>
          <Text style={styles.subtext} numberOfLines={1}>
            {robot.ipAddress}:{robot.port}
          </Text>
        </View>

        {/* Connect button */}
        <View style={styles.connectBadge}>
          <Text style={styles.connectText}>Connect</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  imageWrapper: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: 96,
    height: 96,
  },
  info: {
    flex: 1,
    justifyContent: "center",
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  type: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2563eb",
  },
  subtext: {
    fontSize: 13,
    color: "#9ca3af",
  },
  connectBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "center",
  },
  connectText: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 13,
  },
});
