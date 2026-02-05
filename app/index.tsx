import { robotClient } from "@/src/connections/RobotWebSocketClient";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { RobotCard } from '@/src/components/RobotCards';
import { robotDiscovery } from '@/src/connections/RobotDiscoveryService';
import { RobotInfo } from "@/src/models/robotModels";
import React, { useState } from 'react';
import { FlatList } from 'react-native';

export default function Home() {
  const [robots, setRobots] = useState<RobotInfo[]>([]);

  useEffect(() => {
    const unsubscribe = robotDiscovery.subscribe(setRobots);
    robotDiscovery.start();
    robotClient.start();

    return () => {
      unsubscribe();
      robotDiscovery.stop();
      robotClient.disconnect();
    };
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: "Robot Selection" }} />
      <View style={{ padding: 16 }}>
        <FlatList
          data={robots}
          keyExtractor={r => r.serialNumber}
          renderItem={({ item }) => <RobotCard robot={item} />}
        />
      </View>
    </>
  );
}
