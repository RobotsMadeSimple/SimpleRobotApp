import { Card } from '@/components/ui/card';
import { setSelectedRobot } from '@/src/connections/robotState';
import { RobotInfo } from '@/src/models/robotModels';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function RobotCard({ robot }: { robot: RobotInfo }) {
  function setRobot(){
    setSelectedRobot(robot);
    router.push(`/robot/${robot.serialNumber}`)
  }

  return (
    <Pressable
      onPress={() => setRobot()}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card style={styles.card}>
        <Text style={styles.name}>{robot.robotName}</Text>

        <Text>Type: {robot.robotType}</Text>
        <Text>
          Address: {robot.ipAddress}:{robot.port}
        </Text>
        <Text>Serial: {robot.serialNumber}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
});
