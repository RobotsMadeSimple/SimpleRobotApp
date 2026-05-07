import { Stack } from "expo-router";

export default function ControlLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />
      <Stack.Screen name="jog" options={{ headerShown: false }} />
    </Stack>
  );
}
