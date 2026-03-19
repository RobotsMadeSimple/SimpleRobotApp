import { Stack, usePathname } from "expo-router";

export default function ControlLayout() {
  const pathname = usePathname();
  const isScreenNested = pathname.includes("/control/");

  return (
    <Stack screenOptions={{ headerShown: isScreenNested }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="jog" options={{ title: "Jog" }} />
    </Stack>
  );
}