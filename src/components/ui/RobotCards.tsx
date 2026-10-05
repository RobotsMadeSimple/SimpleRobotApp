import { Card, colors, radii, spacing, StatusPill, type } from "@/src/components/ui/kit";
import { setSelectedRobot } from "@/src/connections/robotState";
import { RobotInfo } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

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
    <Card onPress={setRobot} style={styles.card}>
      <View style={styles.row}>
        {/* Robot image */}
        <View style={styles.imageWrapper}>
          <Image source={imageSource} style={styles.image} resizeMode="contain" />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={[type.title, styles.title]} numberOfLines={1}>{robot.robotName}</Text>
          <Text style={styles.type} numberOfLines={1}>{robot.robotType}</Text>
          <Text style={[type.mono, styles.subtext]} numberOfLines={1}>
            {robot.ipAddress}:{robot.port}
          </Text>
        </View>

        {/* Connect badge */}
        <StatusPill label="Connect" tone="accent" style={styles.connectBadge} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  imageWrapper: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
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
  title: { fontSize: 16 },
  type: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.accent,
  },
  subtext: { color: colors.textFaint },
  connectBadge: {
    alignSelf: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
