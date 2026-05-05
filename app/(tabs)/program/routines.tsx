import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
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

  function deleteRoutine(name: string) {
    Alert.alert("Delete Routine", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: () => {
          robotClient.deleteBuiltProgram(name).catch(() => {});
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <NotConnectedOverlay />
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
            <View key={r.name} style={styles.card}>
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
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push(`/program/builder?name=${encodeURIComponent(r.name)}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => deleteRoutine(r.name)}
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="#dc2626" />
              </TouchableOpacity>
            </View>
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

  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
  },
  editBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },

  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
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
