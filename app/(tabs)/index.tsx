import { robotClient } from "@/src/services/RobotConnectService";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";

import { RobotCard } from "@/src/components/ui/RobotCards";
import { RobotInfo } from "@/src/models/robotModels";
import { robotDiscovery } from "@/src/services/RobotDiscoveryService";

export default function Robot() {
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
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList
        data={robots}
        keyExtractor={(r) => r.serialNumber}
        renderItem={({ item }) => <RobotCard robot={item} />}
      />
    </View>
  );
}
