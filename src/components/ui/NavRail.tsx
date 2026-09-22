import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, spacing } from "@/src/components/ui/kit";
import { useConnected, useSelectedRobot } from "@/src/providers/RobotProvider";

// Loose local typing for the react-navigation tabBar props — expo-router vendors
// @react-navigation/bottom-tabs, so its prop types aren't importable directly.
type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string; params?: object }[];
  };
  descriptors: Record<
    string,
    {
      options: {
        title?: string;
        tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => React.ReactNode;
      };
    }
  >;
  navigation: {
    emit: (e: { type: string; target?: string; canPreventDefault?: boolean }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
};

const RAIL_WIDTH = 216;

/**
 * Wide-screen left navigation rail: brand header, pill nav items, and the
 * robot connection status pinned to the bottom. Rendered as a custom `tabBar`
 * with tabBarPosition "left"; narrow screens keep the stock bottom tab bar.
 */
export function NavRail({ state, descriptors, navigation }: TabBarProps) {
  const insets        = useSafeAreaInsets();
  const connected     = useConnected();
  const selectedRobot = useSelectedRobot();

  return (
    <View style={[styles.rail, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      {/* Brand */}
      <View style={styles.brand}>
        <Image source={require("@/assets/images/icon.png")} style={styles.brandIcon} />
        <View>
          <Text style={styles.brandName}>Simple Robot</Text>
          <Text style={styles.brandSub}>Robots Made Simple</Text>
        </View>
      </View>

      {/* Nav items */}
      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const tint = focused ? colors.accent : colors.textMuted;

          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed, hovered }: any) => [
                styles.item,
                focused && styles.itemActive,
                !focused && (hovered || pressed) && styles.itemHover,
              ]}
            >
              {options.tabBarIcon?.({ focused, color: tint, size: 20 })}
              <Text style={[styles.itemLabel, { color: focused ? colors.accent : colors.textSecondary }, focused && styles.itemLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Connection status */}
      <View style={styles.statusWell}>
        <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.danger }]} />
        <View style={styles.statusBody}>
          <Text style={[styles.statusText, { color: connected ? colors.success : colors.danger }]} numberOfLines={1}>
            {connected ? "Connected" : "Disconnected"}
          </Text>
          {!!selectedRobot?.robotName && (
            <Text style={styles.statusRobot} numberOfLines={1}>{selectedRobot.robotName}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xl,
  },
  brandIcon: { width: 34, height: 34, borderRadius: 9 },
  brandName: { fontSize: 15, fontWeight: "700", color: colors.text },
  brandSub:  { fontSize: 10, color: colors.textFaint, marginTop: 1 },

  items: { flex: 1, gap: spacing.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  itemActive: { backgroundColor: colors.accentSoft },
  itemHover:  { backgroundColor: colors.surfaceHover },
  itemLabel:  { fontSize: 14, fontWeight: "500" },
  itemLabelActive: { fontWeight: "600" },

  statusWell: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  statusDot:  { width: 10, height: 10, borderRadius: 5 },
  statusBody: { flex: 1 },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusRobot: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
});

