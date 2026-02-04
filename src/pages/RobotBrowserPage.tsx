import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { robotDiscovery, RobotService } from '../connections/RobotDiscoveryService';
import { RobotCard } from '../components/RobotCards';

export function RobotBrowserScreen() {
  const [robots, setRobots] = useState<RobotService[]>([]);

  useEffect(() => {
    const unsub = robotDiscovery.subscribe(setRobots);

    return () => {
      unsub();
      robotDiscovery.stop();
    };
  }, []);

  return (
    <View style={{ padding: 16 }}>
      <FlatList
        data={robots}
        keyExtractor={r => r.name}
        renderItem={({ item }) => <RobotCard robot={item} />}
      />
    </View>
  );
}
