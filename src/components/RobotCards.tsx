import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RobotService } from '../connections/RobotDiscoveryService';

export function RobotCard({ robot }: { robot: RobotService }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{robot.name}</Text>

      <Text>Type: {robot.txt.RobotType ?? 'Unknown'}</Text>
      <Text>Host: {robot.host}:{robot.port}</Text>
      <Text>Endpoint: {robot.txt.ControlEndpoint ?? '/'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e1e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#fff',
  },
});
