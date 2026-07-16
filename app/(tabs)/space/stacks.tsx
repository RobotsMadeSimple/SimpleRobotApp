import { wide } from "@/src/components/ui/responsive";
import {
  NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { RobotStack } from "@/src/models/robotModels";
import { useStacks } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { ChevronRight,
  Layers,
  Plus,
  Trash2 } from "lucide-react-native";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

export default function StacksPage() {
  const stacks = useStacks();

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
    <TouchableOpacity
      style={gs.row}
      onPress={() => router.push(`/space/stack-edit?id=${encodeURIComponent(item.id)}`)}
      activeOpacity={0.7}
    >
      <View style={gs.iconTile}>
        <Layers size={20} color="#7c3aed" />
      </View>
      <View style={gs.rowText}>
        <Text style={gs.rowName}>{item.name}</Text>
        <Text style={gs.rowDesc} numberOfLines={2}>
          Base: {item.basePointName || "—"}
          {"\n"}
          Offset ({item.offsetX}, {item.offsetY}, {item.offsetZ})
          {item.maxCount != null ? `  ·  max ${item.maxCount}` : ""}
        </Text>
      </View>
      <DeleteIconButton size={15} style={gs.deleteBtn} onPress={() => handleDelete(item)} />
      <ChevronRight size={16} color="#d1d5db" />
    </TouchableOpacity>
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <SubPageHeader title="Stacks" />

      <FlatList
        data={stacks}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={[gs.listContent, wide.content]}
        ListEmptyComponent={
          <View style={gs.emptyContainer}>
            <Layers size={40} color="#d1d5db" />
            <Text style={gs.emptyTitle}>No Stacks</Text>
            <Text style={gs.emptyBody}>
              Tap below to define a 1D position array.
            </Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={gs.addCard}
            onPress={() => router.push("/space/stack-edit")}
            activeOpacity={0.7}
          >
            <Plus size={16} color="#7c3aed" />
            <Text style={gs.addCardText}>New Stack</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6" },

  listContent: { padding: 16, paddingBottom: 32, gap: 10 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  iconTile: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: "#f3e8ff",
    justifyContent: "center", alignItems: "center",
  },
  rowText:  { flex: 1, gap: 4 },
  rowName:  { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowDesc:  { fontSize: 12, color: "#9ca3af", lineHeight: 17 },
  deleteBtn: { padding: 4 },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
    marginTop: 2,
  },
  addCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7c3aed",
  },

  emptyContainer: { alignItems: "center", marginTop: 60, marginBottom: 24, gap: 10 },
  emptyTitle:     { fontSize: 16, fontWeight: "700", color: "#374151" },
  emptyBody: {
    fontSize: 13, color: "#9ca3af",
    textAlign: "center", paddingHorizontal: 24,
  },
});
