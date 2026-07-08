import { Stack } from "expo-router";

export default function IOLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="stb" />
      <Stack.Screen name="nanos" />
      <Stack.Screen name="relay" />
      <Stack.Screen name="auxiliary" />
      <Stack.Screen name="cameras" />
      <Stack.Screen name="configure" />
      <Stack.Screen name="configure-relay" />
    </Stack>
  );
}
