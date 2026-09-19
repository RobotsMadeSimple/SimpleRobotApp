import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { BuiltProgram } from "@/src/models/robotModels";
import { useBuiltPrograms } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Repeat2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

export default function RoutinesScreen() {
  const allPrograms = useBuiltPrograms();
  const [search, setSearch] = useState("");
  const [sort, setSort]     = useState<SortState>(defaultSort());

  const routines = allPrograms.filter(p => p.isRoutine);

  const q = search.trim().toLowerCase();

  const filtered = routines
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    .sort(bySort<BuiltProgram>(sort, r => r.name, r => r.lastUpdatedUnixMs ?? 0));

  function handleDelete(name: string) {
    appAlert("Delete Routine", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => robotClient.deleteBuiltProgram(name).catch(() => {}) },
    ]);
  }

  return (
    <ProgramListLayout
      title="Routines"
      accentColor="#7c3aed"
      addLabel="New Routine"
      onAdd={() => router.push("/program/builder?isRoutine=1")}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={routines.length === 0}
      hasResults={filtered.length > 0}
      emptyIcon={<Box size={44} color="#d1d5db" />}
      emptyTitle="No Routines"
      emptySubtitle="Routines are reusable step sequences that can be called from any program."
      topOverlay={<NotConnectedOverlay />}
    >
      {filtered.map(r => (
        <RoutineRow key={r.name} routine={r} onDelete={() => handleDelete(r.name)} />
      ))}
    </ProgramListLayout>
  );
}

function RoutineRow({ routine: r, onDelete }: { routine: BuiltProgram; onDelete: () => void }) {
  const metaParts: string[] = [];
  metaParts.push(`${r.steps.length} step${r.steps.length !== 1 ? "s" : ""}`);
  if (r.lastUpdatedUnixMs) metaParts.push(`saved ${relativeTime(r.lastUpdatedUnixMs)}`);

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push(`/program/builder?name=${encodeURIComponent(r.name)}`)}
      activeOpacity={0.75}
    >
      <View style={s.cardIcon}>
        <Repeat2 size={20} color="#7c3aed" />
      </View>
      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={1}>{r.name}</Text>
        {!!r.description && <Text style={s.cardDesc} numberOfLines={2}>{r.description}</Text>}
        <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>
      </View>
      <DeleteIconButton onPress={onDelete} style={s.deleteBtn} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff", borderRadius: 14,
    flexDirection: "row", alignItems: "center",
    padding: 14, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "#f5f3ff", justifyContent: "center", alignItems: "center",
  },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  cardMeta: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  deleteBtn: { padding: 6 },
});
