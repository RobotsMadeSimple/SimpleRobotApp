import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { VisionProgram } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { useCameras } from "@/src/providers/RobotProvider";
import { router, useFocusEffect } from "expo-router";
import { Camera, Clock, LayoutGrid, ScanSearch, SearchCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Card, IconTile, InfoTip, SectionHeader, StatTile, StatusPill, accents, colors, spacing } from "@/src/components/ui/kit";

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

  // Counts come straight from the program payloads already fetched above.
  const zoneTotal       = programs.reduce((n, p) => n + p.zones.length, 0);
  const inspectionTotal = programs.reduce((n, p) => n + p.inspections.length, 0);
  const lastSaved       = programs.reduce((ms, p) => Math.max(ms, p.lastUpdatedUnixMs ?? 0), 0);

  const aside = programs.length > 0 ? (
    <>
      <SectionHeader title="Summary" icon={LayoutGrid} />
      <StatTile
        label="Programs"
        value={programs.length}
        icon={ScanSearch}
        tint={[accents.cyan, accents.cyanSoft]}
        hint={filtered.length !== programs.length ? `${filtered.length} shown` : undefined}
      />
      <StatTile label="Zones" value={zoneTotal} icon={LayoutGrid} />
      <StatTile label="Inspections" value={inspectionTotal} icon={SearchCheck} />
      {lastSaved > 0 && <StatTile label="Last saved" value={relativeTime(lastSaved)} icon={Clock} />}
      <SectionHeader title="Cameras" icon={Camera} />
      {cameras.length === 0 ? (
        <Card><Text style={s.asideNote}>No cameras are reporting yet.</Text></Card>
      ) : (
        <Card style={s.asideCard}>
          {cameras.map(cam => (
            <View key={cam.id} style={s.asideRow}>
              <Camera size={14} color={cam.connected ? colors.success : colors.textFaint} />
              <Text style={s.asideCamName} numberOfLines={1}>{cam.name || cam.id}</Text>
              <StatusPill
                label={`${programs.filter(p => p.cameraId === cam.id).length} prog`}
                tone={cam.connected ? "success" : "neutral"}
              />
            </View>
          ))}
        </Card>
      )}
    </>
  ) : null;

  return (
    <ProgramListLayout
      title="Vision Programs"
      subtitle="Camera zones and the inspections that run inside them"
      crumbs={[{ label: "Program", href: "/program" }, { label: "Vision" }]}
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
      aside={aside}
    >
      <SectionHeader
        title="Vision Programs"
        right={<InfoTip text="A vision program picks a camera, draws zones on its feed, and attaches inspections to those zones. Programs trigger one with a Run Vision step and read the result back into variables." />}
      />
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
  metaParts.push(`${prog.zones.length} zone${prog.zones.length !== 1 ? "s" : ""}`);
  metaParts.push(`${prog.inspections.length} inspection${prog.inspections.length !== 1 ? "s" : ""}`);
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
        <View style={s.nameRow}>
          <Text style={s.cardName} numberOfLines={1}>{prog.name}</Text>
          <StatusPill
            label={prog.cameraId || "No camera"}
            tone={prog.cameraId ? "accent" : "warning"}
            icon={<Camera size={10} color={prog.cameraId ? colors.accent : colors.warning} />}
          />
        </View>
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
  cardBody: { flex: 1, minWidth: 0 },
  nameRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  asideCard:    { paddingVertical: spacing.sm, gap: spacing.sm },
  asideRow:     { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  asideCamName: { flex: 1, fontSize: 13, color: colors.textSecondary, minWidth: 0 },
  asideNote:    { fontSize: 13, color: colors.textFaint },
  cardName: { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1 },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardMeta: { fontSize: 11, color: colors.textFaint, marginTop: 4 },
  iconBtn:  { padding: 4 },
});
