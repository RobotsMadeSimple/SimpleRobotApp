// app/(tabs)/program/_layout.tsx
import { Stack } from "expo-router";

export default function SpaceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}