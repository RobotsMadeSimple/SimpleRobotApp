import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerTitleAlign: "center",

        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",

        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
        },

        tabBarLabelStyle: {
          fontSize: 12,
        },

        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            index: "hardware-chip-outline",
            program: "code-slash-outline",
            control: "game-controller-outline",
            io: "swap-horizontal-outline",
            space: "cube-outline",
          };

          return (
            <Ionicons
              name={icons[route.name] ?? "ellipse-outline"}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Robot" }} />
      <Tabs.Screen name="program" options={{ title: "Program" }} />
      <Tabs.Screen name="control" options={{ title: "Control" }} />
      <Tabs.Screen name="io" options={{ title: "I/O" }} />
      <Tabs.Screen name="space" options={{ title: "Space" }} />
    </Tabs>
  );
}

export default function Layout() {
  return (
    <GluestackUIProvider mode="light">
      <SafeAreaProvider>
        <TabsLayout />
      </SafeAreaProvider>
    </GluestackUIProvider>
  );
}
