import { Card, colors, radii, spacing, StatusPill, type } from "@/src/components/ui/kit";
import { setSelectedRobot } from "@/src/connections/robotState";
import { RobotInfo } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { isSaved, recordConnection, toggleSaved, useConnectionStore } from "@/src/services/connectionStore";
import { Star } from "lucide-react-native";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

const robotImages: Record<string, any> = {
  ASTRO: require("@/assets/images/ASTRO.png"),
};

const defaultRobotImage = require("@/assets/images/no-robot.png");

export function RobotCard({ robot }: { robot: RobotInfo }) {
  useConnectionStore(); // re-render when the saved/star state changes
  const saved = isSaved(robot);

  function setRobot() {
    recordConnection(robot);
    setSelectedRobot(robot);
    robotClient.connectTo(robot);
    // Selecting a robot flips the Robot tab's root screen to the connected
    // dashboard in place — no navigation (which would stack a duplicate route).
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

        <View style={styles.rightCol}>
          {/* Star — save/unsave this connection (own press, doesn't trigger connect) */}
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); toggleSaved(robot); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.star}
            accessibilityLabel={saved ? "Unsave connection" : "Save connection"}
          >
            {/* key flips with saved-state so the SVG remounts — react-native-svg keeps the old
                fill on an in-place color-only change (lucide paths are keyless) on native. */}
            <Star key={saved ? "on" : "off"} size={18} color={saved ? colors.warning : colors.textFaint} fill={saved ? colors.warning : "transparent"} />
          </Pressable>
          {/* Connect badge */}
          <StatusPill label="Connect" tone="accent" style={styles.connectBadge} />
        </View>
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
  rightCol: {
    alignItems: "center",
    gap: spacing.sm,
  },
  star: {
    padding: 2,
  },
  connectBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
