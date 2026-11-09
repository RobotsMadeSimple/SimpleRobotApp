import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { findBackgroundStatus } from "@/src/models/backgroundStatus";
import { BackgroundProgramStatus, BuiltProgram } from "@/src/models/robotModels";
import { useActionPending } from "@/src/hooks/useActionPending";
import { useBuiltPrograms, useConnected, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Clock, Layers, PlayCircle, Play, Square } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import {
  Button, Card, IconTile, InfoTip, SectionHeader, StatTile, StatusPill, accents, colors, spacing,
} from "@/src/components/ui/kit";

// Background programs' own tint, distinct from programs (blue), routines (purple),
// local drafts (orange) and vision (cyan).
const BG_TINT = accents.pink;
const BG_SOFT = accents.pinkSoft;

const STOP_NOTE =
  "A main program stops every running background program when it finishes, unless its " +
  "\"Stop Backgrounds on Finish\" setting is off.";

export default function BackgroundProgramsScreen() {
  const allPrograms = useBuiltPrograms();
  const robotStatus = useRobotStatus();
  const [search, setSearch] = useState("");
  const [sort, setSort]     = useState<SortState>(defaultSort());

  const programs = allPrograms.filter(p => p.isBackground && !p.isRoutine);
  const statuses = robotStatus.backgroundPrograms;
  const runningCount = programs.filter(p => findBackgroundStatus(statuses, p)).length;

  const q = search.trim().toLowerCase();
  const filtered = programs
    .filter(p => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    .sort(bySort<BuiltProgram>(sort, p => p.name, p => p.lastUpdatedUnixMs ?? 0));

  function handleDelete(name: string) {
    appAlert("Delete Background Program", `Delete "${name}" from the robot? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => robotClient.deleteBuiltProgram(name).catch(() => {}) },
    ]);
  }

  const lastSaved = programs.reduce((ms, p) => Math.max(ms, p.lastUpdatedUnixMs ?? 0), 0);

  const aside = programs.length > 0 ? (
    <>
      <SectionHeader title="Summary" icon={Layers} />
      <StatTile
        label="Background"
        value={programs.length}
        icon={Layers}
        tint={[BG_TINT, BG_SOFT]}
        hint={filtered.length !== programs.length ? `${filtered.length} shown` : undefined}
      />
      <StatTile
        label="Running now"
        value={runningCount}
        icon={PlayCircle}
        tint={runningCount > 0 ? [colors.success, colors.successSoft] : undefined}
      />
      {lastSaved > 0 && <StatTile label="Last saved" value={relativeTime(lastSaved)} icon={Clock} />}
    </>
  ) : null;

  return (
    <ProgramListLayout
      title="Background"
      subtitle="Programs that run beside the main program"
      crumbs={[{ label: "Program", href: "/program" }, { label: "Background" }]}
      accentColor={BG_TINT}
      addLabel="New Background Program"
      onAdd={() => router.push("/program/builder?isBackground=1")}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={programs.length === 0}
      hasResults={filtered.length > 0}
      emptyIcon={<Layers size={32} color={colors.textFaint} />}
      emptyTitle="No Background Programs"
      emptySubtitle={
        "A background program runs beside the main program — watching inputs, counting parts or " +
        "keeping a light in step. It can't move the arm, and it shares global variables with the main program."
      }
      topOverlay={<NotConnectedOverlay />}
      aside={aside}
    >
      <SectionHeader
        title="Background Programs"
        right={<InfoTip text={`Background programs run alongside the main program. They can't move the arm, and they share global variables with it. Start one here, from a Start Background step, or from a station tag. ${STOP_NOTE}`} />}
      />
      <Text style={s.note}>{STOP_NOTE}</Text>
      {filtered.map(p => (
        <BackgroundRow
          key={p.id ?? p.name}
          program={p}
          status={findBackgroundStatus(statuses, p)}
          onDelete={() => handleDelete(p.name)}
        />
      ))}
    </ProgramListLayout>
  );
}

function BackgroundRow({ program: p, status, onDelete }: {
  program: BuiltProgram; status: BackgroundProgramStatus | null; onDelete: () => void;
}) {
  const connected = useConnected();
  const running = status !== null;
  // Clears when the running flag flips (or after a timeout if the command was lost).
  const [pending, setPending] = useActionPending(null, running);

  const metaParts: string[] = [`${p.steps.length} step${p.steps.length !== 1 ? "s" : ""}`];
  if (p.lastUpdatedUnixMs) metaParts.push(`saved ${relativeTime(p.lastUpdatedUnixMs)}`);

  function toggle() {
    setPending(running ? "Stop" : "Start");
    const call = running
      ? robotClient.stopBackgroundProgram(p.name, p.id)
      : robotClient.startBackgroundProgram(p.name, p.id);
    call.catch(() => setPending(null));
  }

  return (
    <Card
      onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(p.name)}`)}
      padded={false}
      style={s.card}
    >
      <IconTile size={40} color={BG_SOFT}>
        <Layers size={20} color={BG_TINT} />
      </IconTile>
      <View style={s.cardBody}>
        <View style={s.nameRow}>
          <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
          {running && <StatusPill label="RUNNING" tone="success" dot />}
        </View>
        {!!p.description && <Text style={s.cardDesc} numberOfLines={2}>{p.description}</Text>}
        {running && (
          <Text style={s.step} numberOfLines={1}>
            <Text style={s.stepLabel}>NOW  </Text>{status.currentStep || "Starting…"}
          </Text>
        )}
        <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>
      </View>
      <Button
        size="sm"
        label={running ? "Stop" : "Start"}
        variant={running ? "destructive" : "primary"}
        loading={pending !== null}
        disabled={!connected}
        icon={running
          ? <Square size={12} color={colors.onAccent} fill={colors.onAccent} />
          : <Play size={13} color={colors.onAccent} />}
        style={running ? undefined : { backgroundColor: colors.success }}
        onPress={toggle}
      />
      <DeleteIconButton onPress={onDelete} style={s.deleteBtn} />
    </Card>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: -spacing.xs },
  card: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md + 2, gap: spacing.md,
  },
  cardBody:  { flex: 1, gap: 2, minWidth: 0 },
  nameRow:   { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  cardName:  { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1 },
  cardDesc:  { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  step:      { fontSize: 12, color: colors.success, fontWeight: "600" },
  stepLabel: { fontSize: 10, fontWeight: "800", color: colors.textFaint, letterSpacing: 0.5 },
  cardMeta:  { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  deleteBtn: { padding: 6 },
});
