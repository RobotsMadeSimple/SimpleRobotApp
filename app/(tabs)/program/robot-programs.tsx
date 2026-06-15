import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BuiltProgram, ProgramSummary } from "@/src/models/robotModels";
import { useBuiltPrograms, useProgramSummaries } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Cpu, Plus, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Program Row ────────────────────────────────────────────────────────────────

function ProgramRow({
  name,
  description,
  stepCount,
  image,
  isBuilt,
  onPress,
  onDelete,
}: {
  name: string;
  description: string;
  stepCount: number | null;
  image: string | null;
  isBuilt: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const cardContent = (
    <>
      <View style={styles.cardThumb}>
        {image ? (
          <Image
            source={{ uri: `data:image/png;base64,${image}` }}
            style={styles.thumbImage}
            resizeMode="cover"
          />
        ) : (
          <Box size={22} color="#9ca3af" />
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
          {isBuilt && (
            <View style={styles.builtBadge}>
              <Cpu size={10} color="#2563eb" />
              <Text style={styles.builtBadgeText}>BUILT</Text>
            </View>
          )}
        </View>
        {!!description && (
          <Text style={styles.cardDesc} numberOfLines={2}>{description}</Text>
        )}
        {stepCount !== null && (
          <Text style={styles.cardMeta}>{stepCount} step{stepCount !== 1 ? "s" : ""}</Text>
        )}
      </View>

      {onDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} hitSlop={8}>
          <Trash2 size={16} color="#ef4444" />
        </TouchableOpacity>
      )}
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]} onPress={onPress}>
        {cardContent}
      </Pressable>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {cardContent}
    </TouchableOpacity>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function syntheticSummary(bp: BuiltProgram): ProgramSummary {
  return {
    name: bp.name,
    description: bp.description,
    status: "Ready",
    currentStepDescription: "",
    currentStepNumber: 0,
    maxStepCount: bp.steps.length,
    errorDescription: "",
    warningDescription: "",
    start: false,
    stop: false,
    reset: false,
    abort: false,
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RobotProgramsScreen() {
  const programSummaries = useProgramSummaries();
  const builtPrograms    = useBuiltPrograms();
  const [images, setImages] = useState<Record<string, string | null>>({});

  useEffect(() => robotClient.onProgramImages(setImages), []);

  const builtNames = new Set(builtPrograms.map(p => p.name));

  const builtCards = builtPrograms
    .filter(bp => !bp.isRoutine)
    .map(bp => ({ summary: live(bp, programSummaries) ?? syntheticSummary(bp), bp, isBuilt: true as const }));

  const externalCards = programSummaries
    .filter(p => !builtNames.has(p.name))
    .map(p => ({ summary: p, isBuilt: false as const }));

  const allCards = [...builtCards, ...externalCards];

  function handleDelete(name: string) {
    Alert.alert("Delete Program", `Delete "${name}" from the robot? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => robotClient.deleteBuiltProgram(name).catch(() => {}),
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader
        title="Programs"
        right={
          <TouchableOpacity
            onPress={() => router.navigate("/program/builder")}
            style={styles.addBtn}
          >
            <Plus size={18} color="#fff" />
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {allCards.length === 0 ? (
          <View style={styles.empty}>
            <Box size={44} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Programs</Text>
            <Text style={styles.emptySubtitle}>
              Create a program below to get started.
            </Text>
          </View>
        ) : (
          allCards.map(c => (
            <ProgramRow
              key={c.summary.name}
              name={c.summary.name}
              description={c.summary.description}
              stepCount={c.isBuilt ? c.bp.steps.length : null}
              image={images[c.summary.name] ?? null}
              isBuilt={c.isBuilt}
              onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(c.summary.name)}`)}
              onDelete={c.isBuilt ? () => handleDelete(c.summary.name) : undefined}
            />
          ))
        )}

        <TouchableOpacity
          style={styles.addCard}
          onPress={() => router.navigate("/program/builder")}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#2563eb" />
          <Text style={styles.addCardText}>New Program</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function live(bp: BuiltProgram, summaries: ProgramSummary[]) {
  return summaries.find(p => p.name === bp.name) ?? null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:  { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 16, paddingBottom: 32, gap: 12 },

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
  cardPressed: {
    opacity: 0.75,
  },
  cardThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  thumbImage: { width: 48, height: 48 },
  cardBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  cardName: { fontSize: 15, fontWeight: "700", color: "#111827", flexShrink: 1 },
  cardDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  cardMeta: { fontSize: 11, color: "#9ca3af", marginTop: 2 },

  builtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  builtBadgeText: { fontSize: 10, fontWeight: "700", color: "#2563eb", letterSpacing: 0.4 },

  deleteBtn: { padding: 4 },

  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center",
  },
  addCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    paddingBottom: 24,
    gap: 12,
  },
  emptyTitle:    { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
});
