import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { ProgramListLayout, SortState, bySort, defaultSort, relativeTime } from "@/src/components/ui/ProgramListLayout";
import { BuiltProgram, ProgramSummary, imageDataUri } from "@/src/models/robotModels";
import { useBuiltPrograms, useProgramSummaries, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Cpu, Layers } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";

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

  const cardContent = (
    <>
      <View style={s.cardThumb}>
        {image ? (
          <Image
            source={{ uri: imageDataUri(image)! }}
            style={s.thumbImage}
            resizeMode="cover"
          />
        ) : (
          <Box size={22} color="#9ca3af" />
        )}
      </View>

      <View style={s.cardBody}>
        <View style={s.nameRow}>
          <Text style={s.cardName} numberOfLines={1}>{name}</Text>
          {isBackground ? (
            <View style={[s.builtBadge, s.backgroundBadge]}>
              <Layers size={10} color="#16a34a" />
              <Text style={[s.builtBadgeText, { color: "#16a34a" }]}>BACKGROUND</Text>
            </View>
          ) : isBuilt ? (
            <View style={s.builtBadge}>
              <Cpu size={10} color="#2563eb" />
              <Text style={s.builtBadgeText}>BUILT</Text>
            </View>
          ) : null}
          {isBackground && isRunning && (
            <View style={[s.builtBadge, { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0" }]}>
              <Text style={[s.builtBadgeText, { color: "#16a34a" }]}>RUNNING</Text>
            </View>
          )}
        </View>
        {!!description && <Text style={s.cardDesc} numberOfLines={2}>{description}</Text>}
        {metaParts.length > 0 && <Text style={s.cardMeta}>{metaParts.join("  ·  ")}</Text>}
      </View>

      {onDelete && <DeleteIconButton onPress={onDelete} style={s.deleteBtn} />}
    </>
  );

  if (Platform.OS === "web") {
    return (
      <Pressable style={({ pressed }) => [s.card, pressed && s.cardPressed]} onPress={onPress}>
        {cardContent}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      {cardContent}
    </TouchableOpacity>
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

  return (
    <ProgramListLayout
      title="Programs"
      accentColor="#2563eb"
      addLabel="New Program"
      onAdd={() => router.navigate("/program/builder")}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      isEmpty={isEmpty}
      hasResults={hasResults}
      emptyIcon={<Box size={44} color="#d1d5db" />}
      emptyTitle="No Programs"
      emptySubtitle="Create a program below to get started."
    >
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
          <Text style={s.sectionLabel}>BACKGROUND PROGRAMS</Text>
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
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 0.8, marginTop: 4, marginBottom: -4,
  },

  card: {
    backgroundColor: "#fff", borderRadius: 14,
    flexDirection: "row", alignItems: "center",
    padding: 14, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardPressed: { opacity: 0.75 },
  cardThumb: {
    width: 48, height: 48, borderRadius: 10,
    backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  thumbImage: { width: 48, height: 48 },
  cardBody:   { flex: 1, gap: 2 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  cardName:   { fontSize: 15, fontWeight: "700", color: "#111827", flexShrink: 1 },
  cardDesc:   { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  cardMeta:   { fontSize: 11, color: "#9ca3af", marginTop: 2 },

  builtBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#eff6ff", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2,
  },
  backgroundBadge: { backgroundColor: "#f0fdf4" },
  builtBadgeText:  { fontSize: 10, fontWeight: "700", color: "#2563eb", letterSpacing: 0.4 },

  deleteBtn: { padding: 4 },
});
