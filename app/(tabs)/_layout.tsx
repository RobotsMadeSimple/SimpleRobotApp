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
import { useIsWide } from "@/src/components/ui/responsive";
import { colors } from "@/src/components/ui/kit";
import { NavRail } from "@/src/components/ui/NavRail";
import { AppAlertHost } from "@/src/components/ui/AppAlert";
import { FaultRecoveryOverlay } from "@/src/components/ui/FaultRecoveryOverlay";
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
              <StatusBar style="dark" />
              <TabLayout />
              <AppAlertHost />
              <FaultRecoveryOverlay />
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
  const isWide = useIsWide();
  usePreventBackExit();

  return (
    <Tabs
      // Wide screens (tablet/desktop/web): custom branded navigation rail down
      // the left edge (see NavRail). Narrow screens keep the stock bottom bar.
      {...(isWide ? { tabBar: (props: any) => <NavRail {...props} /> } : {})}
      screenOptions={({ route }) => ({
        // Navigation chrome is owned by each page's <PageHeader> (breadcrumbs on
        // wide, named back affordance + connection status on narrow) — the stock
        // navigator header is disabled app-wide.
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarPosition: isWide ? "left" : "bottom",
        // Wide renders the custom NavRail as the tab bar (above): it styles itself and
        // owns its own safe-area insets, so the built-in-bar options below don't apply.
        // Setting tabBarVariant:"material" here routed Android through the Material bar's
        // layout path and rendered the rail unstyled — so these stay narrow-only.
        ...(isWide ? {} : {
          tabBarVariant: "uikit" as const,
          tabBarStyle: { height: 60 + insets.bottom, paddingBottom: insets.bottom },
          tabBarLabelStyle: { fontSize: 12 },
        }),
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
