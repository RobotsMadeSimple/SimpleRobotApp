import { Stack } from "expo-router";

export default function SpaceLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"  options={{ headerShown: false }} />
      <Stack.Screen name="points" options={{ headerShown: false }} />
      <Stack.Screen name="tools"  options={{ headerShown: false }} />
      <Stack.Screen name="locals" options={{ headerShown: false }} />
    </Stack>
  );
}
