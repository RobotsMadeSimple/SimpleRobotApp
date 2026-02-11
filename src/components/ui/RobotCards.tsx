import { Card } from "@/components/ui/card";
import { setSelectedRobot } from "@/src/connections/robotState";
import { RobotInfo } from "@/src/models/robotModels";
import { router } from "expo-router";
import React from "react";
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

export function RobotCard({ robot }: { robot: RobotInfo }) {
  function setRobot() {
    setSelectedRobot(robot);
    router.push(`/robot/${robot.serialNumber}`);
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;

  return (
    <Pressable
      onPress={setRobot}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.imageWrapper}>
            <Image
              source={imageSource}
              style={styles.image}
              resizeMode="contain"
            />
          </View>

          <View style={styles.info}>
            <Text style={styles.title}>{robot.robotName}</Text>
            <Text style={styles.subtext}>
              {robot.ipAddress}:{robot.port}
            </Text>
          </View>

          <Pressable style={styles.button} onPress={setRobot}>
            <Text style={styles.buttonText}>Connect</Text>
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  imageWrapper: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  image: {
    width: 100,
    height: 100,
  },
  info: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  button: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
