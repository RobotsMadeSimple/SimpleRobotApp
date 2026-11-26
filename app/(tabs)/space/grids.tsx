import { usePaneLayout, useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { Button, colors, EmptyState, InfoTip, ListRow, PageHeader, SectionHeader, spacing } from "@/src/components/ui/kit";
import { Grid } from "@/src/models/robotModels";
import { useGrids, usePoints } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { usePushOnce } from "@/src/hooks/usePushOnce";
import { Grid3x3, Plus } from "lucide-react-native";
import { FlatList, StyleSheet, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { pointIdsByName, Space3DToggle, SpaceList3DLayout, gridSet, useRememberedFlag } from "@/src/components/space/space3d";
import type { Cell3DSet, Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import { useCallback, useMemo, useState } from "react";
import { ArrayCellSheet } from "@/src/components/space/ArrayCellSheet";
import { usePointPick } from "@/src/components/space/PointActionSheet";

export default function GridsPage() {
  const pushOnce = usePushOnce();
  const grids = useGrids();
  const points = usePoints();
  const wideContent = useWideContent();
  // Desktop-tier only: two columns of grid cards, one on tablets/phones.
  const desktop = usePaneLayout() === "desktop";

  // Optional live 3D (hidden by default, remembered on this device): each grid's positions as the
  // controller steps them, with the base points they step from. The grid last opened from the
  // list stays highlighted (by stable id); tapping one of its cells in 3D opens the cell's move sheet.
  const [show3d, setShow3d] = useRememberedFlag("space.grids.view3d", false);
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const sets = useMemo(
    () => grids.map(x => gridSet(x, points)).filter((x): x is Cell3DSet => !!x),
    [grids, points],
  );
  const view3dOptions = useMemo(
    () => ({ points: true, pointIds: pointIdsByName(grids.map(x => x.basePointName), points), locals: false, sets: true, toggles: ["sets", "points"] as ("sets" | "points")[], fit: "items" as const }),
    [grids, points],
  );
  const highlightId = lastOpened && grids.some(x => x.id === lastOpened) ? lastOpened : null;
  // A tapped grid cell opens its move sheet (that cell highlighted while open); "Edit grid" there opens the editor.
  const pick = usePointPick();
  const listHighlight = useMemo<Cell3DTarget | null>(() => (highlightId ? { kind: "grid", id: highlightId } : null), [highlightId]);
  const highlight = pick.highlight ?? listHighlight;
  const openGrid = useCallback((id: string) => {
    setLastOpened(id);
    pushOnce(`/space/grid-edit?id=${encodeURIComponent(id)}`);
  }, [pushOnce]);
  const pickCell = pick.onPick;
  const onPick = useCallback((t: Cell3DTarget | null) => pickCell(t?.kind === "grid" ? t : null), [pickCell]);
  // The list pane is half the page beside the 3D view: one column then.
  const twoCol = desktop && !show3d;

  // New Grid offers the two setup flows: teach it by jogging to its corners, or enter values by hand.
  function newGrid() {
    appAlert(
      "New Grid",
      "Teach the grid by jogging to its corners (each corner is saved as a point you can re-teach), or set it up by hand.",
      [
        { text: "Teach by jogging", onPress: () => pushOnce("/space/grid-teach") },
        { text: "Set up manually", onPress: () => pushOnce("/space/grid-edit") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  }

  function handleDelete(item: Grid) {
    appAlert(
      "Delete Grid",
      `Delete "${item.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => robotClient.deleteGrid(item.id).catch(() => {}),
        },
      ]
    );
  }

  const renderItem = ({ item }: { item: Grid }) => (
    <ListRow
      title={item.name}
      subtitle={
        (item.description ? `${item.description}\n` : "") +
        `Base: ${item.basePointName || "—"}\n` +
        `Row (${item.rowOffsetX}, ${item.rowOffsetY}, ${item.rowOffsetZ})` +
        `  ·  Col (${item.colOffsetX}, ${item.colOffsetY}, ${item.colOffsetZ})` +
        (item.rowCount != null || item.colCount != null
          ? `  ·  ${item.rowCount ?? "∞"} × ${item.colCount ?? "∞"}`
          : "")
      }
      subtitleLines={item.description ? 3 : 2}
      icon={<Grid3x3 size={20} color={colors.warning} />}
      iconColor={colors.warningSoft}
      onPress={() => openGrid(item.id)}
      chevron
      right={<DeleteIconButton size={15} style={gs.deleteBtn} onPress={() => handleDelete(item)} />}
      style={[twoCol && gs.gridCard, show3d && item.id === highlightId && gs.highlighted]}
    />
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <PageHeader title="Grids" subtitle="2D position arrays for pick-and-place and pallet operations" right={<Space3DToggle on={show3d} onChange={setShow3d} />} />

      <SpaceList3DLayout show={show3d} persistKey="space-grids" options={view3dOptions} sets={sets} highlight={highlight} onPick={onPick}>
      <FlatList
        key={twoCol ? "2col" : "1col"}
        data={grids}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        numColumns={twoCol ? 2 : 1}
        columnWrapperStyle={twoCol ? gs.columnWrapper : undefined}
        contentContainerStyle={[gs.listContent, wideContent]}
        ListHeaderComponent={
          <SectionHeader
            title="Grids"
            style={gs.hint}
            right={<InfoTip text="A grid steps from a base point: each row and column index multiplies the row/column offset, then rotates around the base point. Leave row/column count blank for an unbounded grid." />}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Grid3x3 size={40} color={colors.textFaint} />}
            title="No Grids"
            subtitle="Add one, then teach it by jogging to its corners or enter the offsets by hand."
          />
        }
        ListFooterComponent={
          <Button
            variant="dashed"
            label="New Grid"
            icon={<Plus size={16} color={colors.accent} />}
            style={gs.addCard}
            onPress={newGrid}
          />
        }
      />
      </SpaceList3DLayout>
      <ArrayCellSheet cell={pick.cell} onClose={pick.close} onEdit={c => { pick.close(); openGrid(c.id); }} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },

  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm + 2 },
  hint: { marginBottom: spacing.sm },

  columnWrapper: { gap: spacing.sm + 2 },
  gridCard: { flex: 1 },

  deleteBtn: { padding: spacing.xs },
  highlighted: { borderColor: colors.warning, backgroundColor: colors.warningSoft },

  addCard: { marginTop: 2 },
});
