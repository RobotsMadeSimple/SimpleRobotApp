import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { VisionProgram } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { useCameras } from "@/src/providers/RobotProvider";
import { router, useFocusEffect } from "expo-router";
import { ScanSearch } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Card, IconTile, colors, spacing } from "@/src/components/ui/kit";

export default function VisionListScreen() {
  const [programs, setPrograms] = useState<VisionProgram[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [sort, setSort]         = useState<SortState>(defaultSort());
  const cameras                 = useCameras();

  const refresh = useCallback(async () => {
    // Cameras drive the new-program default below; pull a fresh list on focus so a
    // camera added since connect is available to pick.
    robotClient.getCameras().catch(() => {});
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
      // Default to the first available camera so the editor opens on a live feed
      // instead of an empty picker; "" if none are connected yet.
      description: "", cameraId: cameras[0]?.id ?? "", zones: [], inspections: [], lastUpdatedUnixMs: 0,
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
      accentColor={colors.accent}
      addLabel="New Vision Program"
      onAdd={createNew}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={!loading && programs.length === 0}
      hasResults={loading || filtered.length > 0}
      emptyIcon={<ScanSearch size={32} color={colors.textFaint} />}
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
    <Card
      onPress={() => router.navigate({
        pathname: "/(tabs)/program/vision-editor",
        params: { program: JSON.stringify(prog) },
      })}
      padded={false}
      style={s.card}
    >
      <IconTile size={40}>
        <ScanSearch size={20} color={colors.accent} />
      </IconTile>
      <View style={s.cardBody}>
        <Text style={s.cardName}>{prog.name}</Text>
        {!!prog.description && <Text style={s.cardDesc} numberOfLines={1}>{prog.description}</Text>}
        <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>
      </View>
      <DeleteIconButton onPress={onDelete} style={s.iconBtn} />
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md + 2, gap: spacing.md,
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "700", color: colors.text },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardMeta: { fontSize: 11, color: colors.textFaint, marginTop: 4 },
  iconBtn:  { padding: 4 },
});
