import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radii, spacing } from "@/src/components/ui/kit";
import { useIsShort } from "@/src/components/ui/responsive";
import { useConnected, useSelectedRobotName } from "@/src/providers/RobotProvider";

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
/** Short (landscape phone) rail: icons over small labels, so the content keeps the width. */
export const COMPACT_RAIL_WIDTH = 76;

/**
 * Wide-screen left navigation rail: brand header, pill nav items, and the
 * robot connection status pinned to the bottom. Rendered as a custom `tabBar`
 * with tabBarPosition "left"; narrow screens keep the stock bottom tab bar.
 */
export function NavRail(props: TabBarProps) {
  return useIsShort() ? <CompactNavRail {...props} /> : <FullNavRail {...props} />;
}

function FullNavRail({ state, descriptors, navigation }: TabBarProps) {
  const insets        = useSafeAreaInsets();
  const connected     = useConnected();
  const robotName     = useSelectedRobotName();

  return (
    <View style={[styles.rail, { width: RAIL_WIDTH + insets.left, paddingLeft: insets.left + spacing.md, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
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
              // Native uses a plain array style (matches the brand/status Views that
              // render correctly on Android — the Pressable style *function* form's
              // returned styles weren't landing there, leaving the buttons unstyled).
              // Web keeps the function form so it can add a hover highlight; press
              // feedback on Android uses the native ripple.
              android_ripple={{ color: colors.surfaceHover, borderless: false }}
              style={
                Platform.OS === "web"
                  ? ({ hovered }: any) => [styles.item, focused && styles.itemActive, !focused && hovered && styles.itemHover]
                  : [styles.item, focused && styles.itemActive]
              }
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
          {!!robotName && (
            <Text style={styles.statusRobot} numberOfLines={1}>{robotName}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The short-screen rail (a phone on its side): brand mark, icon-over-label items and a status dot in
 * a narrow strip. It pads past the left safe-area inset — in landscape the camera cutout or the
 * navigation bar sits on the side, not at the top/bottom.
 */
function CompactNavRail({ state, descriptors, navigation }: TabBarProps) {
  const insets    = useSafeAreaInsets();
  const connected = useConnected();
  const robotName = useSelectedRobotName();
  const status    = connected ? "Connected" : "Disconnected";

  return (
    <View
      style={[
        styles.rail, styles.railCompact,
        { width: COMPACT_RAIL_WIDTH + insets.left, paddingLeft: insets.left + spacing.xs, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm },
      ]}
    >
      <Image source={require("@/assets/images/icon.png")} style={styles.brandIconCompact} accessibilityLabel="Simple Robot" />

      <View style={styles.itemsCompact}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = options.title ?? route.name;
          const tint = focused ? colors.accent : colors.textMuted;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              android_ripple={{ color: colors.surfaceHover, borderless: false }}
              style={
                Platform.OS === "web"
                  ? ({ hovered }: any) => [styles.itemCompact, focused && styles.itemActive, !focused && hovered && styles.itemHover]
                  : [styles.itemCompact, focused && styles.itemActive]
              }
            >
              {options.tabBarIcon?.({ focused, color: tint, size: 20 })}
              <Text style={[styles.itemLabelCompact, { color: focused ? colors.accent : colors.textSecondary }, focused && styles.itemLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.statusCompact} accessibilityLabel={robotName ? `${status} · ${robotName}` : status}>
        <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.danger }]} />
        <Text style={[styles.statusTextCompact, { color: connected ? colors.success : colors.danger }]} numberOfLines={1}>
          {connected ? "Online" : "Offline"}
        </Text>
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

  // Compact (short-screen) rail.
  railCompact: { paddingHorizontal: spacing.xs, alignItems: "center" },
  brandIconCompact: { width: 28, height: 28, borderRadius: 7, marginBottom: spacing.sm },
  itemsCompact: { flex: 1, alignSelf: "stretch", gap: 2, justifyContent: "center" },
  itemCompact: {
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.md,
  },
  itemLabelCompact: { fontSize: 10.5, fontWeight: "500" },
  statusCompact: { alignItems: "center", gap: 3, paddingTop: spacing.xs },
  statusTextCompact: { fontSize: 10, fontWeight: "600" },
});

