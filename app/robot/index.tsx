import { RobotCard } from '@/src/components/RobotCards';
import { robotDiscovery } from '@/src/connections/RobotDiscoveryService';
import { RobotInfo } from '@/src/models/robotModels';
import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

export default function RobotSelection() {
  const [robots, setRobots] = useState<RobotInfo[]>([]);

  useEffect(() => {
    const unsubscribe = robotDiscovery.subscribe(setRobots);

    return () => {
      unsubscribe();
      robotDiscovery.stop();
    };
  }, []);

  return (
    <View style={{ padding: 16 }}>
      <FlatList
        data={robots}
        keyExtractor={r => r.serialNumber}
        renderItem={({ item }) => <RobotCard robot={item} />}
      />
    </View>
  );
}
