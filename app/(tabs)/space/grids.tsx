import { useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { Button, colors, EmptyState, ListRow, spacing } from "@/src/components/ui/kit";
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
    />
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <SubPageHeader title="Grids" />

      <FlatList
        data={grids}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={[gs.listContent, wideContent]}
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

  deleteBtn: { padding: spacing.xs },

  addCard: { marginTop: 2 },
});
