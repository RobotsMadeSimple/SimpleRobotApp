import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { VisionProgram } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useFocusEffect } from "expo-router";
import { ScanSearch } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

export default function VisionListScreen() {
  const [programs, setPrograms] = useState<VisionProgram[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<SortState>(defaultSort());

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

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function createNew() {
    const newProg: VisionProgram = {
      id: "", name: "New Vision Program",
      description: "", cameraId: "", zones: [], inspections: [], lastUpdatedUnixMs: 0,
    };
    router.navigate({ pathname: "/(tabs)/program/vision-editor", params: { program: JSON.stringify(newProg) } });
  }

  function confirmDelete(prog: VisionProgram) {
    appAlert("Delete Vision Program", `Delete "${prog.name}"?`, [
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

  const q = search.trim().toLowerCase();

  const filtered = programs
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    .sort(bySort<VisionProgram>(sort, p => p.name, p => p.lastUpdatedUnixMs ?? 0));

  return (
    <ProgramListLayout
      title="Vision Programs"
      accentColor="#2563eb"
      addLabel="New Vision Program"
      onAdd={createNew}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={!loading && programs.length === 0}
      hasResults={loading || filtered.length > 0}
      emptyIcon={<ScanSearch size={44} color="#d1d5db" />}
      emptyTitle="No Vision Programs"
      emptySubtitle="Create a vision program below to get started."
    >
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : filtered.map(prog => (
        <VisionRow key={prog.id} prog={prog} onDelete={() => confirmDelete(prog)} />
      ))}
    </ProgramListLayout>
  );
}

function VisionRow({ prog, onDelete }: { prog: VisionProgram; onDelete: () => void }) {
  const metaParts: string[] = [];
  metaParts.push(prog.cameraId || "No camera");
  metaParts.push(`${prog.zones.length} zone${prog.zones.length !== 1 ? "s" : ""}`);
  if (prog.lastUpdatedUnixMs) metaParts.push(`saved ${relativeTime(prog.lastUpdatedUnixMs)}`);

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.8}
      onPress={() => router.navigate({
        pathname: "/(tabs)/program/vision-editor",
        params: { program: JSON.stringify(prog) },
      })}
    >
      <View style={s.cardIcon}>
        <ScanSearch size={20} color="#2563eb" />
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardName}>{prog.name}</Text>
        {!!prog.description && <Text style={s.cardDesc} numberOfLines={1}>{prog.description}</Text>}
        <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>
      </View>
      <DeleteIconButton onPress={onDelete} style={s.iconBtn} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    flexDirection: "row", alignItems: "center",
    padding: 14, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center",
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardDesc: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  cardMeta: { fontSize: 11, color: "#9ca3af", marginTop: 4 },
  iconBtn:  { padding: 4 },
});
