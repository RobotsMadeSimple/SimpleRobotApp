// app/(tabs)/program/_layout.tsx
import { Stack, usePathname } from "expo-router";

export default function ProgramLayout() {
  const pathname = usePathname();
  const isScreenNested = (pathname.includes("/program/"));
  
  return (
    <Stack screenOptions={{ headerShown: isScreenNested }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="monitor-program" />
    </Stack>
  );
}