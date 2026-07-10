import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { useBuiltPrograms } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Plus, Repeat2, Trash2 } from "lucide-react-native";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function RoutinesScreen() {
  const allPrograms = useBuiltPrograms();
  const routines = allPrograms.filter(p => p.isRoutine);

  function handleDelete(name: string) {
    Alert.alert("Delete Routine", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => robotClient.deleteBuiltProgram(name).catch(() => {}),
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <NotConnectedOverlay />
      <SubPageHeader
        title="Routines"
        right={
          <TouchableOpacity
            onPress={() => router.push("/program/builder?isRoutine=1")}
            style={styles.addBtn}
          >
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {routines.length === 0 ? (
          <View style={styles.empty}>
            <Box size={44} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Routines</Text>
            <Text style={styles.emptySubtitle}>
              Routines are reusable step sequences that can be called from any program.
            </Text>
          </View>
        ) : (
          routines.map(r => (
            <TouchableOpacity
              key={r.name}
              style={styles.card}
              onPress={() => router.push(`/program/builder?name=${encodeURIComponent(r.name)}`)}
              activeOpacity={0.75}
            >
              <View style={styles.cardIcon}>
                <Repeat2 size={20} color="#7c3aed" />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{r.name}</Text>
                {!!r.description && (
                  <Text style={styles.cardDesc} numberOfLines={2}>{r.description}</Text>
                )}
                <Text style={styles.cardMeta}>{r.steps.length} step{r.steps.length !== 1 ? "s" : ""}</Text>
              </View>
              <DeleteIconButton onPress={() => handleDelete(r.name)} style={styles.deleteBtn} />
            </TouchableOpacity>
          ))
        )}

        {/* New Routine button */}
        <TouchableOpacity
          style={styles.addCard}
          onPress={() => router.push("/program/builder?isRoutine=1")}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#7c3aed" />
          <Text style={styles.addCardText}>New Routine</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: "#f3f4f6" },
  content:  { padding: 16, paddingBottom: 32, gap: 12 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f5f3ff",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  cardMeta: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  deleteBtn: { padding: 6 },

  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#7c3aed", justifyContent: "center", alignItems: "center",
  },

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
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: "#7c3aed" },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingBottom: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
