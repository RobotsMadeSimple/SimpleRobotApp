import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { Grid } from "@/src/models/robotModels";
import { useGrids } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { ChevronRight, Grid3x3, Plus, Trash2 } from "lucide-react-native";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function GridsPage() {
  const grids = useGrids();

  function handleDelete(item: Grid) {
    Alert.alert(
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
    <TouchableOpacity
      style={gs.gridRow}
      onPress={() => router.push(`/space/grid-edit?id=${encodeURIComponent(item.id)}`)}
      activeOpacity={0.7}
    >
      <View style={gs.gridIconTile}>
        <Grid3x3 size={20} color="#d97706" />
      </View>
      <View style={gs.gridRowText}>
        <Text style={gs.gridRowName}>{item.name}</Text>
        <Text style={gs.gridRowDesc} numberOfLines={2}>
          Base: {item.basePointName || "—"}
          {"\n"}
          Row ({item.rowOffsetX}, {item.rowOffsetY}, {item.rowOffsetZ})
          {"  ·  "}
          Col ({item.colOffsetX}, {item.colOffsetY}, {item.colOffsetZ})
          {item.rowCount != null || item.colCount != null
            ? `  ·  ${item.rowCount ?? "∞"} × ${item.colCount ?? "∞"}`
            : ""}
        </Text>
      </View>
      <DeleteIconButton size={15} style={gs.deleteBtn} onPress={() => handleDelete(item)} />
      <ChevronRight size={16} color="#d1d5db" />
    </TouchableOpacity>
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <SubPageHeader title="Grids" />

      <FlatList
        data={grids}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={gs.listContent}
        ListEmptyComponent={
          <View style={gs.emptyContainer}>
            <Grid3x3 size={40} color="#d1d5db" />
            <Text style={gs.emptyTitle}>No Grids</Text>
            <Text style={gs.emptyBody}>
              Tap below to define a 2D position array.
            </Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={gs.addCard}
            onPress={() => router.push("/space/grid-edit")}
            activeOpacity={0.7}
          >
            <Plus size={16} color="#2563eb" />
            <Text style={gs.addCardText}>New Grid</Text>
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

  gridRow: {
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
  gridIconTile: {
    width: 42, height: 42, borderRadius: 11,
    backgroundColor: "#fef3c7",
    justifyContent: "center", alignItems: "center",
  },
  gridRowText: { flex: 1, gap: 4 },
  gridRowName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  gridRowDesc: { fontSize: 12, color: "#9ca3af", lineHeight: 17 },
  deleteBtn:   { padding: 4 },

  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
    marginTop: 2,
  },
  addCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },

  emptyContainer: { alignItems: "center", marginTop: 60, marginBottom: 24, gap: 10 },
  emptyTitle:     { fontSize: 16, fontWeight: "700", color: "#374151" },
  emptyBody: {
    fontSize: 13, color: "#9ca3af",
    textAlign: "center", paddingHorizontal: 24,
  },
});
