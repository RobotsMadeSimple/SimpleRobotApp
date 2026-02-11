import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { RobotCard } from '../components/ui/RobotCards';
import { RobotInfo } from '../models/robotModels';
import { robotDiscovery } from '../services/RobotDiscoveryService';

export function RobotBrowserScreen() {
  const [robots, setRobots] = useState<RobotInfo[]>([]);

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
        keyExtractor={r => r.robotName}
        renderItem={({ item }) => <RobotCard robot={item} />}
      />
    </View>
  );
}
