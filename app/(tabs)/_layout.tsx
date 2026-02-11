import { GluestackUIProvider } from "@/components/ui/gluestack-ui-provider";
import "@/global.css";
import { RobotProvider } from "@/src/providers/RobotProvider";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeftRight,
  CodeXml,
  Gamepad2,
  Move3d,
  Router
} from "lucide-react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";


function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerTitleAlign: "left",
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 25
        },
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
          const icons: Record<string, any> = {
            index: Router,
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
        <RobotProvider>
          <StatusBar style="dark" translucent={false} />
          <TabsLayout />
        </RobotProvider>
      </SafeAreaProvider>
    </GluestackUIProvider>
  );
}
