import { router, Stack } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Pressable } from "react-native";

function BackButton() {
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={{ marginLeft: 4, padding: 4 }}
    >
      <ArrowLeft size={20} color="#111" />
    </Pressable>
  );
}

const SUB_OPTIONS = {
  headerShown: true,
  headerTitleAlign: "left" as const,
  headerTitleStyle: { fontWeight: "bold" as const, fontSize: 22 },
  headerLeft: () => <BackButton />,
};

export default function SpaceLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"  options={{ headerShown: false }} />
      <Stack.Screen name="points" options={{ title: "Points", ...SUB_OPTIONS }} />
      <Stack.Screen name="tools"  options={{ title: "Tools",  ...SUB_OPTIONS }} />
      <Stack.Screen name="locals" options={{ title: "Locals", ...SUB_OPTIONS }} />
    </Stack>
  );
}
