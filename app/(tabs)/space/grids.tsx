import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
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
        <Grid3x3 size={18} color="#d97706" />
      </View>
      <View style={gs.gridRowText}>
        <Text style={gs.gridRowName}>{item.name}</Text>
        <Text style={gs.gridRowDesc} numberOfLines={1}>
          Base: {item.basePointName || "—"}
          {"  ·  "}
          Row ({item.rowOffsetX}, {item.rowOffsetY}, {item.rowOffsetZ})
          {"  ·  "}
          Col ({item.colOffsetX}, {item.colOffsetY}, {item.colOffsetZ})
          {item.rowCount != null || item.colCount != null
            ? `  ·  ${item.rowCount ?? "∞"} × ${item.colCount ?? "∞"}`
            : ""}
        </Text>
      </View>
      <TouchableOpacity
        style={gs.deleteBtn}
        onPress={() => handleDelete(item)}
        hitSlop={8}
        activeOpacity={0.7}
      >
        <Trash2 size={15} color="#ef4444" />
      </TouchableOpacity>
      <ChevronRight size={16} color="#d1d5db" />
    </TouchableOpacity>
  );

  return (
    <View style={gs.page}>
      <NotConnectedOverlay />
      <SubPageHeader
        title="Grids"
        right={
          <TouchableOpacity
            onPress={() => router.push("/space/grid-edit")}
            hitSlop={8}
            activeOpacity={0.7}
            style={gs.addBtn}
          >
            <Plus size={20} color="#2563eb" />
          </TouchableOpacity>
        }
      />

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
              Tap the + button to define a 2D position array.
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={gs.separator} />}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f3f4f6" },
  addBtn: { padding: 4 },

  listContent: { padding: 16, paddingBottom: 40 },
  separator:   { height: 1, backgroundColor: "#e5e7eb" },

  gridRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    marginBottom: 10,
  },
  gridIconTile: {
    width: 36, height: 36, borderRadius: 9,
    backgroundColor: "#fef3c7",
    justifyContent: "center", alignItems: "center",
  },
  gridRowText: { flex: 1, gap: 2 },
  gridRowName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  gridRowDesc: { fontSize: 11, color: "#9ca3af" },
  deleteBtn:   { padding: 4 },

  emptyContainer: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyTitle:     { fontSize: 16, fontWeight: "700", color: "#374151" },
  emptyBody: {
    fontSize: 13, color: "#9ca3af",
    textAlign: "center", paddingHorizontal: 24,
  },
});
