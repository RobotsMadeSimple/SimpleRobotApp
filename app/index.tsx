import { View } from "react-native";
import { Button, ButtonText } from "@/components/ui/button"
import { router, Stack } from "expo-router";


import { useEffect } from "react";
import { robotClient } from "@/src/connections/RobotWebSocketClient";
import { robotDiscovery } from "@/src/connections/RobotDiscoveryService";



export default function Index() {
  useEffect(() => {
    robotClient.start();
    robotDiscovery.start();
    return () => robotClient.disconnect();
  }, []);

  return (
    <>
      <Stack.Screen options={{ title: "Home" }} />
      <View>
        <Button onPress={() => router.push("./robot/JogScreen")}>
          <ButtonText>Click me</ButtonText>
        </Button>
      </View>
    </>
    
  );
}
