import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { BuiltProgram, ProgramSummary, imageDataUri } from "@/src/models/robotModels";
import { useBuiltPrograms, useProgramSummaries, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Clock, Cpu, Layers, PlayCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Card, IconTile, InfoTip, SectionHeader, StatTile, StatusPill, colors, spacing } from "@/src/components/ui/kit";

// ── Program Row ────────────────────────────────────────────────────────────────

function ProgramRow({
  name,
  description,
  stepCount,
  lastUpdatedUnixMs,
  image,
  isBuilt,
  isBackground,
  isRunning,
  onPress,
  onDelete,
}: {
  name: string;
  description: string;
  stepCount: number | null;
  lastUpdatedUnixMs?: number;
  image: string | null;
  isBuilt: boolean;
  isBackground?: boolean;
  isRunning?: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const metaParts: string[] = [];
  if (stepCount !== null) metaParts.push(`${stepCount} step${stepCount !== 1 ? "s" : ""}`);
  if (lastUpdatedUnixMs) metaParts.push(`saved ${relativeTime(lastUpdatedUnixMs)}`);

  return (
    <Card onPress={onPress} padded={false} style={s.card}>
      <IconTile size={44} color={colors.background} style={s.thumb}>
        {image ? (
          <Image
            source={{ uri: imageDataUri(image)! }}
            style={s.thumbImage}
            resizeMode="cover"
          />
        ) : (
          <Box size={22} color={colors.textFaint} />
        )}
      </IconTile>

      <View style={s.cardBody}>
        <View style={s.nameRow}>
          <Text style={s.cardName} numberOfLines={1}>{name}</Text>
          {isBackground ? (
            <StatusPill label="BACKGROUND" tone="success" icon={<Layers size={10} color={colors.success} />} />
          ) : isBuilt ? (
            <StatusPill label="BUILT" tone="accent" icon={<Cpu size={10} color={colors.accent} />} />
          ) : null}
          {isBackground && isRunning && (
            <StatusPill label="RUNNING" tone="success" dot />
          )}
        </View>
        {!!description && <Text style={s.cardDesc} numberOfLines={2}>{description}</Text>}
        {metaParts.length > 0 && <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>}
      </View>

      {onDelete && <DeleteIconButton onPress={onDelete} style={s.deleteBtn} />}
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RegularCard =
  | { summary: ProgramSummary; bp: BuiltProgram; isBuilt: true }
  | { summary: ProgramSummary; isBuilt: false };

function syntheticSummary(bp: BuiltProgram): ProgramSummary {
  return {
    name: bp.name, description: bp.description, status: "Ready",
    currentStepDescription: "", currentStepNumber: 0, maxStepCount: bp.steps.length,
    errorDescription: "", warningDescription: "", currentPointName: "",
    start: false, stop: false, reset: false, abort: false,
  };
}

function live(bp: BuiltProgram, summaries: ProgramSummary[]) {
  return summaries.find(p => p.name === bp.name) ?? null;
}

function matchesSearch(name: string, description: string, q: string) {
  if (!q) return true;
  return name.toLowerCase().includes(q) || description.toLowerCase().includes(q);
}

function sortRegular(cards: RegularCard[], sort: SortState): RegularCard[] {
  // A card that only exists on the robot has no saved timestamp, so it sorts as 0 —
  // last under "newest first", first under "oldest first". Same as before direction
  // was selectable, where it could only ever land at the bottom.
  return [...cards].sort(bySort<RegularCard>(
    sort,
    c => c.summary.name,
    c => (c.isBuilt ? (c.bp.lastUpdatedUnixMs ?? 0) : 0),
  ));
}

function sortBuilt(programs: BuiltProgram[], sort: SortState): BuiltProgram[] {
  return [...programs].sort(bySort<BuiltProgram>(sort, p => p.name, p => p.lastUpdatedUnixMs ?? 0));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RobotProgramsScreen() {
  const programSummaries = useProgramSummaries();
  const builtPrograms    = useBuiltPrograms();
  const robotStatus      = useRobotStatus();
  const [images, setImages] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort]     = useState<SortState>(defaultSort());

  useEffect(() => robotClient.onProgramImages(setImages), []);

  const builtNames = new Set(builtPrograms.map(p => p.name));
  const runningBackgroundNames = new Set(
    (robotStatus.backgroundPrograms ?? []).map(b => b.name)
  );

  const backgroundPrograms = builtPrograms.filter(bp => bp.isBackground);
  const regularPrograms    = builtPrograms.filter(bp => !bp.isRoutine && !bp.isBackground);

  const regularCards: RegularCard[] = regularPrograms.map(bp => ({
    summary: live(bp, programSummaries) ?? syntheticSummary(bp),
    bp, isBuilt: true,
  }));
  const externalCards: RegularCard[] = programSummaries
    .filter(p => !builtNames.has(p.name))
    .map(p => ({ summary: p, isBuilt: false }));

  const q = search.trim().toLowerCase();

  const filteredRegular  = sortRegular(
    regularCards.filter(c => matchesSearch(c.summary.name, c.summary.description, q)), sort
  );
  const filteredExternal = externalCards.filter(c =>
    matchesSearch(c.summary.name, c.summary.description, q)
  );
  const allRegularCards  = [...filteredRegular, ...filteredExternal];

  const filteredBackground = sortBuilt(
    backgroundPrograms.filter(bp => matchesSearch(bp.name, bp.description, q)), sort
  );

  const isEmpty    = regularCards.length === 0 && externalCards.length === 0 && backgroundPrograms.length === 0;
  const hasResults = allRegularCards.length > 0 || filteredBackground.length > 0;

  function handleDelete(name: string) {
    appAlert("Delete Program", `Delete "${name}" from the robot? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => robotClient.deleteBuiltProgram(name).catch(() => {}) },
    ]);
  }

  function handleDeleteBackground(name: string) {
    appAlert("Delete Background Program", `Delete "${name}" from the robot? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => robotClient.deleteBuiltProgram(name).catch(() => {}) },
    ]);
  }

  // Summary numbers, all from state already held by the provider.
  const runningNow = programSummaries.filter(
    p => p.status === "Running" || p.status === "Starting" || p.status === "Finishing"
  ).length;
  const stepTotal  = builtPrograms.filter(bp => !bp.isRoutine).reduce((n, bp) => n + bp.steps.length, 0);
  const lastSaved  = builtPrograms.reduce((ms, bp) => Math.max(ms, bp.lastUpdatedUnixMs ?? 0), 0);

  const aside = isEmpty ? null : (
    <>
      <SectionHeader title="Summary" icon={Layers} />
      <StatTile
        label="Programs"
        value={regularCards.length + externalCards.length}
        icon={Box}
        hint={externalCards.length > 0 ? `${externalCards.length} on robot only` : undefined}
      />
      <StatTile
        label="Running now"
        value={runningNow}
        icon={PlayCircle}
        tint={runningNow > 0 ? [colors.success, colors.successSoft] : undefined}
      />
      {backgroundPrograms.length > 0 && (
        <StatTile
          label="Background"
          value={backgroundPrograms.length}
          icon={Layers}
          hint={`${runningBackgroundNames.size} running`}
          tint={[colors.success, colors.successSoft]}
        />
      )}
      <StatTile label="Steps total" value={stepTotal} icon={Cpu} />
      {lastSaved > 0 && <StatTile label="Last saved" value={relativeTime(lastSaved)} icon={Clock} />}
    </>
  );

  return (
    <ProgramListLayout
      title="Programs"
      subtitle="Programs stored on the robot — tap one to monitor or run it"
      crumbs={[{ label: "Program", href: "/program" }, { label: "Programs" }]}
      accentColor={colors.accent}
      addLabel="New Program"
      onAdd={() => router.navigate("/program/builder")}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={isEmpty}
      hasResults={hasResults}
      emptyIcon={<Box size={32} color={colors.textFaint} />}
      emptyTitle="No Programs"
      emptySubtitle="Create a program below to get started."
      aside={aside}
    >
      <SectionHeader
        title="Programs"
        right={<InfoTip text="BUILT programs were made in the step builder and can be edited here. Programs without the badge exist only on the controller." />}
      />
      {allRegularCards.map(c => (
        <ProgramRow
          key={c.summary.name}
          name={c.summary.name}
          description={c.summary.description}
          stepCount={c.isBuilt ? c.bp.steps.length : null}
          lastUpdatedUnixMs={c.isBuilt ? c.bp.lastUpdatedUnixMs : undefined}
          image={images[c.summary.name] ?? null}
          isBuilt={c.isBuilt}
          onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(c.summary.name)}`)}
          onDelete={c.isBuilt ? () => handleDelete(c.summary.name) : undefined}
        />
      ))}

      {filteredBackground.length > 0 && (
        <>
          <SectionHeader
            title="Background Programs"
            icon={Layers}
            right={
              <View style={s.sectionHeaderRight}>
                <InfoTip text="Background programs run in parallel with the main program." />
                <StatusPill label={`${filteredBackground.length}`} tone="neutral" />
              </View>
            }
          />
          {filteredBackground.map(bp => (
            <ProgramRow
              key={bp.name}
              name={bp.name}
              description={bp.description}
              stepCount={bp.steps.length}
              lastUpdatedUnixMs={bp.lastUpdatedUnixMs}
              image={images[bp.name] ?? null}
              isBuilt
              isBackground
              isRunning={runningBackgroundNames.has(bp.name)}
              onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(bp.name)}`)}
              onDelete={() => handleDeleteBackground(bp.name)}
            />
          ))}
        </>
      )}
    </ProgramListLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sectionHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  card: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md + 2, gap: spacing.md,
  },
  thumb:      { overflow: "hidden" },
  thumbImage: { width: 44, height: 44 },
  cardBody:   { flex: 1, gap: 2 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  cardName:   { fontSize: 15, fontWeight: "700", color: colors.text, flexShrink: 1 },
  cardDesc:   { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  cardMeta:   { fontSize: 11, color: colors.textFaint, marginTop: 2 },

  deleteBtn: { padding: 4 },
});
