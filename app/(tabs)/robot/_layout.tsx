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

export default function RobotLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"          options={{ headerShown: false }} />
      <Stack.Screen name="connected-robot" options={{ headerShown: false }} />
      <Stack.Screen
        name="about"
        options={{
          title: "About Robot",
          headerShown: true,
          headerTitleAlign: "left",
          headerTitleStyle: { fontWeight: "bold", fontSize: 22 },

          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  );
}
