import { ConnectionStatus } from "@/src/components/ui/ConnectedStatus";
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
      <ArrowLeft size={24} color="#111" />
    </Pressable>
  );
}

export default function ControlLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Control",
          headerShown: true,
          headerTitleAlign: "left",
          headerTitleStyle: { fontWeight: "bold", fontSize: 25 },
          headerRight: () => <ConnectionStatus />,
        }}
      />
      <Stack.Screen
        name="jog"
        options={{
          title: "Jog",
          headerShown: true,
          headerTitleAlign: "left",
          headerTitleStyle: { fontWeight: "bold", fontSize: 22 },
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  );
}
