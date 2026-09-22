import { usePaneLayout, useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { Button, colors, EmptyState, InfoTip, ListRow, PageHeader, SectionHeader, spacing } from "@/src/components/ui/kit";
import { Grid } from "@/src/models/robotModels";
import { useGrids } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Grid3x3, Plus } from "lucide-react-native";
import { FlatList, StyleSheet, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

export default function GridsPage() {
  const grids = useGrids();
  const wideContent = useWideContent();
  // Desktop-tier only: two columns of grid cards, one on tablets/phones.
  const twoCol = usePaneLayout() === "desktop";

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
        `Base: ${item.basePointName || "—"}\n` +
        `Row (${item.rowOffsetX}, ${item.rowOffsetY}, ${item.rowOffsetZ})` +
        `  ·  Col (${item.colOffsetX}, ${item.colOffsetY}, ${item.colOffsetZ})` +
        (item.rowCount != null || item.colCount != null
          ? `  ·  ${item.rowCount ?? "∞"} × ${item.colCount ?? "∞"}`
          : "")
      }
      subtitleLines={2}
      icon={<Grid3x3 size={20} color={colors.warning} />}
      iconColor={colors.warningSoft}
      onPress={() => router.push(`/space/grid-edit?id=${encodeURIComponent(item.id)}`)}
      chevron
      right={<DeleteIconButton size={15} style={gs.deleteBtn} onPress={() => handleDelete(item)} />}
      style={twoCol && gs.gridCard}
    />
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <PageHeader title="Grids" subtitle="2D position arrays for pick-and-place and pallet operations" />

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
            subtitle="Tap below to define a 2D position array."
          />
        }
        ListFooterComponent={
          <Button
            variant="dashed"
            label="New Grid"
            icon={<Plus size={16} color={colors.accent} />}
            style={gs.addCard}
            onPress={() => router.push("/space/grid-edit")}
          />
        }
      />
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

  addCard: { marginTop: 2 },
});
