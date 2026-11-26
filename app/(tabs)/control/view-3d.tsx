import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Cell3DView } from "@/src/components/ui/cell3d/Cell3DView";
import { ArrayCellSheet } from "@/src/components/space/ArrayCellSheet";
import { PointActionSheet, usePointPick } from "@/src/components/space/PointActionSheet";
import { useSpaceSets } from "@/src/components/space/space3d";
import type { Cell3DOptions } from "@/src/components/ui/cell3d/bridge";
import { colors, PageHeader, PositionReadout, radii, spacing } from "@/src/components/ui/kit";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { useConnected, useRobotStatus } from "@/src/providers/RobotProvider";

/**
 * Full-screen live 3D view of the robot and its cell (the controller's active cell package, or the
 * built-in model): orbit / pan / zoom, preset views, the TCP, taught points, locals and a tool-path
 * trail, plus the saved grids / stacks behind the Arrays chip. The position readout underneath is the same world TCP the view draws.
 */
const VIEW_OPTIONS: Cell3DOptions = { trail: true, locals: false, sets: false, toggles: ["points", "locals", "sets", "trail"] };

export default function View3DScreen() {
  const s = useRobotStatus();
  const connected = useConnected();
  const pane = usePaneLayout();
  const fmt = (v?: number) => (v ?? 0).toFixed(1);
  // Tap a point marker to move to it (the shared point action sheet).
  const pick = usePointPick();
  const sets = useSpaceSets();

  return (
    <View style={styles.root}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <PageHeader title="3D View" subtitle="Watch the robot and its cell move, live" backTo="/control" />
      <View style={[styles.body, pane === "single" ? styles.bodyNarrow : styles.bodyWide]}>
        <Cell3DView style={styles.viewer} persistKey="screen" options={VIEW_OPTIONS} sets={sets} highlight={pick.highlight} onPick={pick.onPick} />
        <PositionReadout
          inline
          axes={[
            { label: "X", value: fmt(s?.x), unit: "mm" },
            { label: "Y", value: fmt(s?.y), unit: "mm" },
            { label: "Z", value: fmt(s?.z), unit: "mm" },
            { label: "RZ", value: fmt(s?.rz), unit: "°" },
          ]}
        />
      </View>
      <PointActionSheet point={pick.point} onClose={pick.close} />
      <ArrayCellSheet cell={pick.cell} onClose={pick.close} />
      {!connected && <NotConnectedOverlay />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, gap: spacing.md },
  bodyNarrow: { paddingHorizontal: spacing.sm + 2, paddingTop: spacing.sm, paddingBottom: spacing.md },
  bodyWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  viewer: {
    flex: 1,
    minHeight: 240,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
