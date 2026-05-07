import { Tabs, router } from "expo-router";
import {
  ArrowLeftRight,
  CodeXml,
  Gamepad2,
  Move3d,
  Router,
} from "lucide-react-native";
import { useEffect } from "react";
import { BackHandler } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import { ConnectionStatus } from "@/src/components/ui/ConnectedStatus";
import { RobotProvider } from "@/src/providers/RobotProvider";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ActionSheetProvider>
        <GluestackUIProvider mode="light">
          <SafeAreaProvider>
            <RobotProvider>
              <StatusBar style="dark" translucent={false} />
              <TabLayout />
            </RobotProvider>
          </SafeAreaProvider>
        </GluestackUIProvider>
      </ActionSheetProvider>
    </GestureHandlerRootView>
  );
}

// Block the Android hardware back button / swipe-to-exit at the navigation root.
// When there is nothing left to go back to, swallow the event instead of closing the app.
function usePreventBackExit() {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!router.canGoBack()) {
        return true; // swallow — stay in the app
      }
      return false; // let Expo Router handle it normally
    });
    return () => sub.remove();
  }, []);
}

export function TabLayout() {
  const insets = useSafeAreaInsets();
  usePreventBackExit();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true,
        headerTitleAlign: "left",
        headerTitleStyle: { fontWeight: "bold", fontSize: 25 },
        headerRight: () => <ConnectionStatus />,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, any> = {
            robot: Router,
            program: CodeXml,
            control: Gamepad2,
            io: ArrowLeftRight,
            space: Move3d,
          };
          const IconComponent = icons[route.name] ?? Router;
          return <IconComponent size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="robot"   options={{ title: "Robot" }} />
      <Tabs.Screen name="program" options={{ title: "Program" }} />
      <Tabs.Screen name="control" options={{ title: "Control" }} />
      <Tabs.Screen name="io"      options={{ title: "I/O" }} />
      <Tabs.Screen name="space"   options={{ title: "Space" }} />
    </Tabs>
  );
}
