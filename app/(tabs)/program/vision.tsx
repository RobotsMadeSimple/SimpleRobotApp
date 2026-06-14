import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { VisionProgram } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Plus, ScanSearch, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function VisionListScreen() {
  const [programs, setPrograms] = useState<VisionProgram[]>([]);
  const [loading, setLoading]   = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { programs: progs } = await robotClient.getVisionPrograms();
      setPrograms(progs);
    } catch {
      /* not connected */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function createNew() {
    const newProg: VisionProgram = {
      id: "", name: "New Vision Program",
      description: "", cameraId: "", zones: [], inspections: [], lastUpdatedUnixMs: 0,
    };
    router.navigate({ pathname: "/(tabs)/program/vision-editor", params: { program: JSON.stringify(newProg) } });
  }

  function confirmDelete(prog: VisionProgram) {
    Alert.alert("Delete Vision Program", `Delete "${prog.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await robotClient.deleteVisionProgram(prog.id).catch(() => {});
          setPrograms(prev => prev.filter(p => p.id !== prog.id));
        },
      },
    ]);
  }

  return (
    <View style={styles.root}>
      <SubPageHeader
        title="Vision Programs"
        right={
          <TouchableOpacity onPress={createNew} style={styles.addBtn}>
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : programs.length === 0 ? (
        <View style={styles.center}>
          <ScanSearch size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>No vision programs yet</Text>
          <TouchableOpacity style={styles.createBtn} onPress={createNew}>
            <Text style={styles.createBtnText}>Create Vision Program</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
          {programs.map(prog => (
            <TouchableOpacity
              key={prog.id}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.navigate({
                pathname: "/(tabs)/program/vision-editor",
                params: { program: JSON.stringify(prog) },
              })}
            >
              <View style={styles.cardIcon}>
                <ScanSearch size={20} color="#2563eb" />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{prog.name}</Text>
                {!!prog.description && <Text style={styles.cardDesc} numberOfLines={1}>{prog.description}</Text>}
                <View style={styles.cardMeta}>
                  <Text style={styles.cardMetaText}>{prog.cameraId || "No camera"}</Text>
                  <Text style={styles.cardMetaText}>·</Text>
                  <Text style={styles.cardMetaText}>{prog.zones.length} zone{prog.zones.length !== 1 ? "s" : ""}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(prog)} style={styles.iconBtn} hitSlop={8}>
                <Trash2 size={16} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.addCard} onPress={createNew} activeOpacity={0.7}>
            <Plus size={16} color="#2563eb" />
            <Text style={styles.addCardText}>New Vision Program</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: "#f3f4f6" },

  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center",
  },

  center:        { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText:     { fontSize: 14, color: "#9ca3af", marginTop: 8 },
  createBtn:     { backgroundColor: "#2563eb", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  scroll: { flex: 1 },
  list:   { padding: 16, paddingBottom: 32, gap: 10 },

  addCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: "#2563eb", borderRadius: 14,
    paddingVertical: 14, backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },

  card: {
    backgroundColor: "#fff", borderRadius: 14,
    flexDirection: "row", alignItems: "center",
    padding: 14, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "#eff6ff",
    justifyContent: "center", alignItems: "center",
  },
  cardBody:        { flex: 1 },
  cardName:        { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardDesc:        { fontSize: 12, color: "#6b7280", marginTop: 2 },
  cardMeta:        { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  cardMetaText:    { fontSize: 12, color: "#9ca3af" },
  iconBtn: { padding: 4 },
});
