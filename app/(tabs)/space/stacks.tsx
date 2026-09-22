import { useWideContent } from "@/src/components/ui/responsive";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { accents, Button, colors, EmptyState, ListRow, spacing } from "@/src/components/ui/kit";
import { RobotStack } from "@/src/models/robotModels";
import { useStacks } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Layers, Plus } from "lucide-react-native";
import { FlatList, StyleSheet, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

export default function StacksPage() {
  const stacks = useStacks();
  const wideContent = useWideContent();

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
      onPress={() => router.push(`/space/stack-edit?id=${encodeURIComponent(item.id)}`)}
      chevron
      right={<DeleteIconButton size={15} style={gs.deleteBtn} onPress={() => handleDelete(item)} />}
    />
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <SubPageHeader title="Stacks" />

      <FlatList
        data={stacks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={[gs.listContent, wideContent]}
        ListEmptyComponent={
          <EmptyState
            icon={<Layers size={40} color={colors.textFaint} />}
            title="No Stacks"
            subtitle="Tap below to define a 1D position array."
          />
        }
        ListFooterComponent={
          <Button
            variant="dashed"
            label="New Stack"
            icon={<Plus size={16} color={accents.purple} />}
            style={gs.addCard}
            textStyle={gs.addCardText}
            onPress={() => router.push("/space/stack-edit")}
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

  addCard: { marginTop: 2, borderColor: accents.purple },
  addCardText: { color: accents.purple },
});
