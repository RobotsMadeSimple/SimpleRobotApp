import { Stack } from "expo-router";

export default function ProgramLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="monitor-program" options={{ headerShown: false }} />
      <Stack.Screen name="builder"  options={{ headerShown: false }} />
      <Stack.Screen name="routines"        options={{ headerShown: false }} />
      <Stack.Screen name="robot-programs"  options={{ headerShown: false }} />
      <Stack.Screen name="phone-programs"  options={{ headerShown: false }} />
    </Stack>
  );
}
