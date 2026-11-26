import { usePaneLayout, useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { accents, Button, colors, EmptyState, InfoTip, ListRow, PageHeader, SectionHeader, spacing } from "@/src/components/ui/kit";
import { RobotStack } from "@/src/models/robotModels";
import { useStacks, usePoints } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { usePushOnce } from "@/src/hooks/usePushOnce";
import { Layers, Plus } from "lucide-react-native";
import { FlatList, StyleSheet, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { pointIdsByName, Space3DToggle, SpaceList3DLayout, stackSet, useRememberedFlag } from "@/src/components/space/space3d";
import type { Cell3DSet, Cell3DTarget } from "@/src/components/ui/cell3d/bridge";
import { useCallback, useMemo, useState } from "react";
import { ArrayCellSheet } from "@/src/components/space/ArrayCellSheet";
import { usePointPick } from "@/src/components/space/PointActionSheet";

export default function StacksPage() {
  const pushOnce = usePushOnce();
  const stacks = useStacks();
  const points = usePoints();
  const wideContent = useWideContent();
  // Desktop-tier only: two columns of stack cards, one on tablets/phones.
  const desktop = usePaneLayout() === "desktop";

  // Optional live 3D (hidden by default, remembered on this device): each stack's positions as the
  // controller steps them, with the base points they step from. The stack last opened from the
  // list stays highlighted (by stable id); tapping one of its cells in 3D opens the cell's move sheet.
  const [show3d, setShow3d] = useRememberedFlag("space.stacks.view3d", false);
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const sets = useMemo(
    () => stacks.map(x => stackSet(x, points)).filter((x): x is Cell3DSet => !!x),
    [stacks, points],
  );
  const view3dOptions = useMemo(
    () => ({ points: true, pointIds: pointIdsByName(stacks.map(x => x.basePointName), points), locals: false, sets: true, toggles: ["sets", "points"] as ("sets" | "points")[], fit: "items" as const }),
    [stacks, points],
  );
  const highlightId = lastOpened && stacks.some(x => x.id === lastOpened) ? lastOpened : null;
  // A tapped stack cell opens its move sheet (that cell highlighted while open); "Edit stack" there opens the editor.
  const pick = usePointPick();
  const listHighlight = useMemo<Cell3DTarget | null>(() => (highlightId ? { kind: "stack", id: highlightId } : null), [highlightId]);
  const highlight = pick.highlight ?? listHighlight;
  const openStack = useCallback((id: string) => {
    setLastOpened(id);
    pushOnce(`/space/stack-edit?id=${encodeURIComponent(id)}`);
  }, [pushOnce]);
  const pickCell = pick.onPick;
  const onPick = useCallback((t: Cell3DTarget | null) => pickCell(t?.kind === "stack" ? t : null), [pickCell]);
  // The list pane is half the page beside the 3D view: one column then.
  const twoCol = desktop && !show3d;

  function handleDelete(item: RobotStack) {
    appAlert(
      "Delete Stack",
      `Delete "${item.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => robotClient.deleteStack(item.id).catch(() => {}),
        },
      ]
    );
  }

  const renderItem = ({ item }: { item: RobotStack }) => (
    <ListRow
      title={item.name}
      subtitle={
        `Base: ${item.basePointName || "—"}\n` +
        `Offset (${item.offsetX}, ${item.offsetY}, ${item.offsetZ})` +
        (item.maxCount != null ? `  ·  max ${item.maxCount}` : "")
      }
      subtitleLines={2}
      icon={<Layers size={20} color={accents.purple} />}
      iconColor={accents.purpleSoft}
      onPress={() => openStack(item.id)}
      chevron
      right={<DeleteIconButton size={15} style={gs.deleteBtn} onPress={() => handleDelete(item)} />}
      style={[twoCol && gs.stackCard, show3d && item.id === highlightId && gs.highlighted]}
    />
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <PageHeader title="Stacks" subtitle="1D position arrays with optional round-robin indexing" right={<Space3DToggle on={show3d} onChange={setShow3d} />} />

      <SpaceList3DLayout show={show3d} persistKey="space-stacks" options={view3dOptions} sets={sets} highlight={highlight} onPick={onPick}>
      <FlatList
        key={twoCol ? "2col" : "1col"}
        data={stacks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        numColumns={twoCol ? 2 : 1}
        columnWrapperStyle={twoCol ? gs.columnWrapper : undefined}
        contentContainerStyle={[gs.listContent, wideContent]}
        ListHeaderComponent={
          <SectionHeader
            title="Stacks"
            style={gs.hint}
            right={<InfoTip text="A stack steps from a base point along one offset: each index multiplies the step offset. Set a max count to make the index wrap around (round-robin) instead of growing without bound." />}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Layers size={40} color={colors.textFaint} />}
            title="No Stacks"
            subtitle="Add one, then teach it from the robot's position or enter the step by hand."
          />
        }
        ListFooterComponent={
          <Button
            variant="dashed"
            label="New Stack"
            icon={<Plus size={16} color={accents.purple} />}
            style={gs.addCard}
            textStyle={gs.addCardText}
            onPress={() => pushOnce("/space/stack-edit")}
          />
        }
      />
      </SpaceList3DLayout>
      <ArrayCellSheet cell={pick.cell} onClose={pick.close} onEdit={c => { pick.close(); openStack(c.id); }} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },

  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm + 2 },
  hint: { marginBottom: spacing.sm },

  columnWrapper: { gap: spacing.sm + 2 },
  stackCard: { flex: 1 },

  deleteBtn: { padding: spacing.xs },
  highlighted: { borderColor: accents.purple, backgroundColor: accents.purpleSoft },

  addCard: { marginTop: 2, borderColor: accents.purple },
  addCardText: { color: accents.purple },
});
