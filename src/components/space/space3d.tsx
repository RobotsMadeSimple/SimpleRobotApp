import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { Box, ChevronDown, ChevronRight } from "lucide-react-native";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { Cell3DOptions, Cell3DPreview, Cell3DSet, Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import { Cell3DView } from "@/src/components/ui/cell3d/Cell3DView";
import { Button, Card, colors, spacing, type } from "@/src/components/ui/kit";
import { useIsWide, usePaneLayout } from "@/src/components/ui/responsive";
import type { Grid, Point, RobotStack } from "@/src/models/robotModels";
import { useGrids, usePoints, useStacks } from "@/src/providers/RobotProvider";

import { gridCellPose, stackSlotPose } from "./arrayTargets";

/**
 * The Space tab's optional 3D: grid / stack positions as the controller computes them
 * (MoveTargetResolver.GridCell / StackSlot), a per-device remembered on/off flag, the list
 * pages' "3D" header toggle + layout, and the collapsible "3D preview" card the editor pages
 * show under their setup card.
 */

/** Rows / columns / items drawn for a direction with no count (the array itself is unlimited). */
export const UNLIMITED_GRID_PREVIEW = 4;
export const UNLIMITED_STACK_PREVIEW = 6;

/** A grid's cell positions (row-major), or null without its base point. */
export function gridSet(grid: Grid, points: Point[]): Cell3DSet | null {
  const base = points.find(p => p.name === grid.basePointName);
  if (!base) return null;
  const rows = grid.rowCount && grid.rowCount > 0 ? Math.min(grid.rowCount, 50) : UNLIMITED_GRID_PREVIEW;
  const cols = grid.colCount && grid.colCount > 0 ? Math.min(grid.colCount, 50) : UNLIMITED_GRID_PREVIEW;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const p = gridCellPose(grid, base, r, k);
      positions.push({ x: p.x, y: p.y, z: p.z });
    }
  }
  return { kind: "grid", id: grid.id || "draft", name: grid.name, positions, rows, cols };
}

/** A stack's slot positions in index order, or null without its base point. */
export function stackSet(stack: RobotStack, points: Point[]): Cell3DSet | null {
  const base = points.find(p => p.name === stack.basePointName);
  if (!base) return null;
  const count = stack.maxCount && stack.maxCount > 0 ? Math.min(stack.maxCount, 500) : UNLIMITED_STACK_PREVIEW;
  const positions = Array.from({ length: count }, (_, i) => {
    const p = stackSlotPose(stack, base, i);
    return { x: p.x, y: p.y, z: p.z };
  });
  return { kind: "stack", id: stack.id || "draft", name: stack.name, positions };
}

/** The stable ids of the saved points with these names (base points are stored by name). */
export function pointIdsByName(names: (string | undefined)[], points: Point[]): string[] {
  const out = new Set<string>();
  for (const nm of names) {
    const p = nm ? points.find(q => q.name === nm) : undefined;
    if (p?.id) out.add(p.id);
  }
  return [...out];
}

/** Every saved grid and stack that has its base point. */
export function spaceSets(grids: Grid[], stacks: RobotStack[], points: Point[]): Cell3DSet[] {
  const out: Cell3DSet[] = [];
  for (const g of grids) { const s = gridSet(g, points); if (s) out.push(s); }
  for (const st of stacks) { const s = stackSet(st, points); if (s) out.push(s); }
  return out;
}

/** Every saved grid and stack as 3D sets (live), for views that show them behind the Arrays chip. */
export function useSpaceSets(): Cell3DSet[] {
  const grids = useGrids();
  const stacks = useStacks();
  const points = usePoints();
  return useMemo(() => spaceSets(grids, stacks, points), [grids, stacks, points]);
}

/** True while this screen is focused (an unfocused stack screen stops its 3D feed). */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return focused;
}

/** A boolean remembered on this device (AsyncStorage), e.g. whether a 3D panel is shown. */
export function useRememberedFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then(raw => { if (!cancelled && (raw === "1" || raw === "0")) setValue(raw === "1"); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);
  const set = useCallback((v: boolean) => {
    setValue(v);
    AsyncStorage.setItem(key, v ? "1" : "0").catch(() => {});
  }, [key]);
  return [value, set];
}

/**
 * The editor pages' collapsible live 3D: the cell with the item being edited drawn from its unsaved
 * values (`preview`). Open / closed is remembered on this device for every editor at once; the
 * viewer only mounts while open and while the screen is focused.
 */
export function SpacePreview3D({
  preview, sets, highlight, hint, persistKey = "space-edit", pointIds, onPick,
}: {
  /** A tap on a marker (e.g. a grid cell / stack slot → its move sheet). */
  onPick?: (t: Cell3DTarget | null) => void;
  preview?: Cell3DPreview | null;
  sets?: Cell3DSet[];
  highlight?: Cell3DTarget | null;
  /** A short note beside the title, e.g. why nothing is drawn yet. */
  hint?: string;
  persistKey?: string;
  /** The saved points that belong to the item (e.g. its base point), shown while the rest stay
   *  hidden. Without it saved points start hidden (the Points chip shows them all). */
  pointIds?: string[];
}) {
  const [open, setOpen] = useRememberedFlag("space.preview3d.open", true);
  const focused = useScreenFocused();
  const pane = usePaneLayout();
  const { height } = useWindowDimensions();
  const h = pane === "desktop"
    ? Math.round(Math.max(340, Math.min(460, height * 0.44)))
    : pane === "split"
      ? Math.round(Math.max(300, Math.min(420, height * 0.36)))
      : Math.round(Math.max(240, Math.min(320, height * 0.34)));

  return (
    <Card padded={false} style={s.card}>
      <Pressable
        style={[s.header, open && s.headerOpen]}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        {open ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
        <Text style={s.title}>3D preview</Text>
        {!!hint && <Text style={s.hint} numberOfLines={1}>{hint}</Text>}
      </Pressable>
      {open && focused && (
        <Cell3DView
          style={{ height: h }}
          persistKey={persistKey}
          options={{ trail: false, points: !!pointIds, pointIds: pointIds ?? null, locals: false, sets: true, toggles: ["points", "locals", "sets"], controls: pane === "single" ? "views" : "full", fit: "items" }}
          sets={sets}
          highlight={highlight}
          preview={preview ?? null}
          onPick={onPick}
        />
      )}
      {open && !focused && <View style={{ height: h }} />}
    </Card>
  );
}

/**
 * A Space list page's header switch for its optional 3D view: "3D" shows it, "Hide 3D" hides it.
 * (Points has a 2D map too, so it uses a 2D | 3D | Hide switch instead.)
 */
export function Space3DToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Button
      size="sm"
      variant={on ? "ghost" : "secondary"}
      label={on ? "Hide 3D" : "3D"}
      icon={<Box size={15} color={on ? colors.accent : colors.textSecondary} />}
      onPress={() => onChange(!on)}
    />
  );
}

/** The 3D strip's height on phones (matches the Points map). */
export const SPACE_LIST_3D_HEIGHT = 300;

/**
 * A Space list page with its optional 3D view: beside the list (half and half) on wide screens,
 * a fixed strip above it on phones. The viewer mounts only while shown and while the screen is
 * focused (a screen under the one on top keeps an empty box, so nothing jumps on return).
 */
export function SpaceList3DLayout({
  show, persistKey, options, sets, highlight, preview, onPick, children,
}: {
  show: boolean;
  persistKey: string;
  options: Cell3DOptions;
  sets?: Cell3DSet[];
  highlight?: Cell3DTarget | null;
  preview?: Cell3DPreview | null;
  onPick?: (t: Cell3DTarget | null) => void;
  /** The page's list (its own ScrollView / FlatList, flex: 1). */
  children: ReactNode;
}) {
  const isWide = useIsWide();
  const focused = useScreenFocused();
  if (!show) return <>{children}</>;
  const viewer = focused ? (
    <Cell3DView
      style={isWide ? s.fill : s.strip}
      persistKey={persistKey}
      options={{ trail: false, ...options }}
      sets={sets}
      highlight={highlight}
      focusHighlight
      preview={preview}
      onPick={onPick}
    />
  ) : <View style={isWide ? s.fill : s.strip} />;
  if (!isWide) return <>{viewer}<View style={s.fill}>{children}</View></>;
  return (
    <View style={s.wideRow}>
      <View style={s.viewerPane}>{viewer}</View>
      <View style={s.fill}>{children}</View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  strip: { height: SPACE_LIST_3D_HEIGHT },
  wideRow: { flex: 1, flexDirection: "row" },
  viewerPane: { flex: 1, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  card: { overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md,
  },
  headerOpen: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  hint: { ...type.caption, fontSize: 12, flex: 1, textAlign: "right" },
});
