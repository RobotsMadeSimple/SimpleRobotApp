import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { BuiltProgram } from "@/src/models/robotModels";
import { useBuiltPrograms } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Clock, Layers, Repeat2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Card, IconTile, InfoTip, SectionHeader, StatTile, accents, colors, spacing } from "@/src/components/ui/kit";

// Routines' brand tint, via the kit's purple accent family (kept consistent
// with the same purple used for on-device/local programs elsewhere).
const ROUTINE_TINT = accents.purple;

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

  // Everything below is already in the built-program list the provider holds —
  // no extra controller queries.
  const totalSteps  = routines.reduce((n, r) => n + r.steps.length, 0);
  const lastTouched = routines.reduce((ms, r) => Math.max(ms, r.lastUpdatedUnixMs ?? 0), 0);

  const aside = routines.length > 0 ? (
    <>
      <SectionHeader title="Summary" icon={Layers} />
      <StatTile
        label="Routines"
        value={routines.length}
        icon={Repeat2}
        tint={[accents.purple, accents.purpleSoft]}
        hint={filtered.length !== routines.length ? `${filtered.length} shown` : undefined}
      />
      <StatTile label="Steps total" value={totalSteps} icon={Box} />
      {lastTouched > 0 && (
        <StatTile label="Last edited" value={relativeTime(lastTouched)} icon={Clock} />
      )}
    </>
  ) : null;

  return (
    <ProgramListLayout
      title="Routines"
      subtitle="Reusable step sequences any program can call"
      crumbs={[{ label: "Program", href: "/program" }, { label: "Routines" }]}
      accentColor={ROUTINE_TINT}
      addLabel="New Routine"
      onAdd={() => router.push("/program/builder?isRoutine=1")}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={routines.length === 0}
      hasResults={filtered.length > 0}
      emptyIcon={<Box size={32} color={colors.textFaint} />}
      emptyTitle="No Routines"
      emptySubtitle="Routines are reusable step sequences that can be called from any program."
      topOverlay={<NotConnectedOverlay />}
      aside={aside}
    >
      <SectionHeader
        title="Routines"
        right={<InfoTip text="A routine is a named block of steps stored on the robot. Programs run it with a Call Routine step, so editing the routine once updates every program that calls it." />}
      />
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
    <Card
      onPress={() => router.push(`/program/builder?name=${encodeURIComponent(r.name)}`)}
      padded={false}
      style={s.card}
    >
      <IconTile size={40} color={accents.purpleSoft}>
        <Repeat2 size={20} color={ROUTINE_TINT} />
      </IconTile>
      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={1}>{r.name}</Text>
        {!!r.description && <Text style={s.cardDesc} numberOfLines={2}>{r.description}</Text>}
        <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>
      </View>
      <DeleteIconButton onPress={onDelete} style={s.deleteBtn} />
    </Card>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md + 2, gap: spacing.md,
  },
  cardBody: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: "700", color: colors.text },
  cardDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  cardMeta: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  deleteBtn: { padding: 6 },
});
