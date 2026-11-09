import { Stack } from "expo-router";

export default function RobotLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"          options={{ headerShown: false }} />
      <Stack.Screen name="connected-robot" options={{ headerShown: false }} />
      <Stack.Screen name="about" options={{ headerShown: false }} />
      <Stack.Screen
        name="config"
        options={{ headerShown: false }}
      />
      <Stack.Screen name="scan-station"   options={{ headerShown: false }} />
      <Stack.Screen name="create-station" options={{ headerShown: false }} />
    </Stack>
  );
}
