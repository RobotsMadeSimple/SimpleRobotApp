import { BuiltProgram, ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useBuiltPrograms, useConnected, useProgramSummaries } from "@/src/providers/RobotProvider";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box, Cpu, FileJson, Plus, Repeat2, Smartphone, Trash2, Upload, WifiOff } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Status theming ─────────────────────────────────────────────────────────────

type StatusTheme = { bg: string; text: string; bar: string; dot: string };

const STATUS_THEME: Record<ProgramStatus, StatusTheme> = {
  Ready:     { bg: "#f3f4f6", text: "#6b7280", bar: "#9ca3af", dot: "#9ca3af" },
  Starting:  { bg: "#eff6ff", text: "#2563eb", bar: "#3b82f6", dot: "#3b82f6" },
  Running:   { bg: "#f0fdf4", text: "#16a34a", bar: "#22c55e", dot: "#22c55e" },
  Finishing: { bg: "#f0fdf4", text: "#16a34a", bar: "#22c55e", dot: "#22c55e" },
  Stopping:  { bg: "#fff7ed", text: "#ea580c", bar: "#f97316", dot: "#f97316" },
  Stopped:   { bg: "#f3f4f6", text: "#6b7280", bar: "#9ca3af", dot: "#9ca3af" },
  Complete:  { bg: "#dcfce7", text: "#15803d", bar: "#22c55e", dot: "#22c55e" },
  Error:     { bg: "#fef2f2", text: "#dc2626", bar: "#ef4444", dot: "#ef4444" },
};

// ── Action buttons ─────────────────────────────────────────────────────────────

type ActionBtn = { label: string; bg: string; onPress: () => void };

function getButtons(p: ProgramSummary, isBuilt: boolean): ActionBtn[] {
  const { name, status } = p;
  switch (status) {
    case "Ready":
      return [{ label: "Start", bg: "#16a34a", onPress: () => robotClient.startProgram(name) }];
    case "Starting":
    case "Running":
    case "Finishing":
      return [{ label: "Stop", bg: "#dc2626", onPress: () => robotClient.stopProgram(name) }];
    case "Stopped":
      return [
        { label: "Continue", bg: "#2563eb", onPress: () => robotClient.startProgram(name) },
        { label: "Exit",     bg: "#374151", onPress: () => robotClient.abortProgram(name) },
      ];
    case "Complete":
      return [
        {
          label: "Run Again",
          bg: "#16a34a",
          onPress: () => {
            robotClient.resetProgram(name);
            if (isBuilt) robotClient.executeBuiltProgram(name).catch(() => {});
            else robotClient.startProgram(name);
          },
        },
        { label: "Exit", bg: "#374151", onPress: () => robotClient.abortProgram(name) },
      ];
    case "Error":
      return [{ label: "Exit", bg: "#dc2626", onPress: () => robotClient.abortProgram(name) }];
    case "Stopping":
    default:
      return [];
  }
}

// ── Robot Program Card ────────────────────────────────────────────────────────

function ProgramCard({
  p,
  image,
  isBuilt,
  anotherBuiltRunning,
  onSaveToPhone,
}: {
  p: ProgramSummary;
  image: string | null;
  isBuilt?: boolean;
  anotherBuiltRunning?: boolean;
  onSaveToPhone?: () => void;
}) {
  const theme = STATUS_THEME[p.status] ?? STATUS_THEME.Ready;
  const pct = p.maxStepCount > 0 ? Math.round((p.currentStepNumber / p.maxStepCount) * 100) : 0;
  const buttons = getButtons(p, isBuilt ?? false);

  const progressAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => { progressAnim.setValue(pct); }, [pct]);

  const alert = p.errorDescription || p.warningDescription;
  const statusLabel = alert ? `${p.status}  ·  ${alert}` : p.status;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(p.name)}`)}
      style={styles.card}
    >
      <View style={[styles.statusBar, { backgroundColor: theme.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: theme.dot }]} />
        <Text style={[styles.statusText, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
          {statusLabel}
        </Text>
        {isBuilt && (
          <View style={styles.builtBadge}>
            <Cpu size={10} color="#2563eb" />
            <Text style={styles.builtBadgeText}>BUILT</Text>
          </View>
        )}
        {isBuilt && onSaveToPhone && (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); onSaveToPhone(); }}
            style={styles.savePhoneBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Smartphone size={13} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.headerRow}>
          <View style={styles.imageWrap}>
            {image ? (
              <Image source={{ uri: `data:image/png;base64,${image}` }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imageFallback}><Box size={28} color="#9ca3af" /></View>
            )}
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.programName} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.programDesc} numberOfLines={2}>{p.description || "No description"}</Text>
          </View>
        </View>

        <View style={styles.stepRow}>
          <Text style={styles.stepLabel}>STEP</Text>
          <Text style={styles.stepText} numberOfLines={2} ellipsizeMode="tail">
            {p.currentStepDescription || "—"}
          </Text>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"], extrapolate: "clamp" }),
                  backgroundColor: theme.bar,
                },
              ]}
            />
          </View>
          <Text style={styles.percentText}>{pct}%</Text>
        </View>

        {buttons.length > 0 && (
          <View style={styles.buttonsRow}>
            {buttons.map((btn) => {
              const isStartAction = btn.label === "Start" || btn.label === "Continue" || btn.label === "Run Again";
              const blocked = !!(isBuilt && anotherBuiltRunning && isStartAction);
              return (
                <TouchableOpacity
                  key={btn.label}
                  style={[styles.actionBtn, { backgroundColor: blocked ? "#9ca3af" : btn.bg }]}
                  onPress={(e) => { e.stopPropagation?.(); if (!blocked) btn.onPress(); }}
                  disabled={blocked}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnText}>{blocked ? "Another Program Running" : btn.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Local Program Card ────────────────────────────────────────────────────────

function LocalProgramCard({
  program,
  connected,
  onRefresh,
}: {
  program: BuiltProgram;
  connected: boolean;
  onRefresh: () => void;
}) {
  async function handleSendToRobot() {
    try {
      await robotClient.saveBuiltProgram(program);
      Alert.alert("Saved to Robot", `"${program.name}" has been saved to the robot.`);
    } catch {
      Alert.alert("Error", "Failed to save program to robot.");
    }
  }

  async function handleExport() {
    try {
      await LocalProgramService.exportAsFile(program);
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Could not export program.");
    }
  }

  function handleDelete() {
    Alert.alert(
      "Delete Local Program",
      `Delete "${program.name}" from this device? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await LocalProgramService.delete(program.name);
            onRefresh();
          },
        },
      ]
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/program/builder?name=${encodeURIComponent(program.name)}&source=local`)}
      style={styles.localCard}
    >
      <View style={styles.localCardHeader}>
        <Smartphone size={10} color="#7c3aed" />
        <Text style={styles.localBadgeText}>ON DEVICE</Text>
        {program.isRoutine && (
          <View style={styles.routinePill}>
            <Text style={styles.routinePillText}>ROUTINE</Text>
          </View>
        )}
      </View>

      <View style={styles.localCardBody}>
        <View style={styles.infoCol}>
          <Text style={styles.programName} numberOfLines={1}>{program.name}</Text>
          <Text style={styles.programDesc} numberOfLines={2}>{program.description || "No description"}</Text>
          <Text style={styles.stepCountText}>{program.steps.length} step{program.steps.length !== 1 ? "s" : ""}</Text>
        </View>
      </View>

      <View style={styles.localCardActions}>
        {connected && (
          <TouchableOpacity
            style={[styles.localActionBtn, { borderColor: "#16a34a" }]}
            onPress={(e) => { e.stopPropagation?.(); handleSendToRobot(); }}
            activeOpacity={0.75}
          >
            <Upload size={13} color="#16a34a" />
            <Text style={[styles.localActionText, { color: "#16a34a" }]}>Send to Robot</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.localActionBtn, { borderColor: "#6b7280" }]}
          onPress={(e) => { e.stopPropagation?.(); handleExport(); }}
          activeOpacity={0.75}
        >
          <FileJson size={13} color="#6b7280" />
          <Text style={[styles.localActionText, { color: "#6b7280" }]}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.localActionBtn, { borderColor: "#dc2626" }]}
          onPress={(e) => { e.stopPropagation?.(); handleDelete(); }}
          activeOpacity={0.75}
        >
          <Trash2 size={13} color="#dc2626" />
          <Text style={[styles.localActionText, { color: "#dc2626" }]}>Delete</Text>
        </TouchableOpacity>
      </View>
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

export default function ProgramScreen() {
  const programSummaries = useProgramSummaries();
  const builtPrograms    = useBuiltPrograms();
  const connected        = useConnected();
  const [images, setImages] = useState<Record<string, string | null>>({});

  // ── Local programs ──────────────────────────────────────────────────────────
  const [localPrograms, setLocalPrograms] = useState<BuiltProgram[]>([]);
  const [localTick, setLocalTick] = useState(0);
  const refreshLocal = useCallback(() => setLocalTick(t => t + 1), []);

  useEffect(() => {
    LocalProgramService.getAll().then(setLocalPrograms);
  }, [localTick]);

  async function handleImport() {
    try {
      const prog = await LocalProgramService.importFromFile();
      if (!prog) return;
      // If a program with this name already exists locally, confirm overwrite
      const existing = localPrograms.find(p => p.name === prog.name);
      if (existing) {
        Alert.alert(
          "Program Already Exists",
          `A local program named "${prog.name}" already exists. Replace it?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Replace", style: "destructive", onPress: async () => {
              await LocalProgramService.save(prog);
              refreshLocal();
            }},
          ]
        );
      } else {
        await LocalProgramService.save(prog);
        refreshLocal();
      }
    } catch (e: any) {
      Alert.alert("Import Failed", e?.message ?? "Could not read the file.");
    }
  }

  async function handleSaveToPhone(bp: BuiltProgram) {
    await LocalProgramService.save({ ...bp, lastUpdatedUnixMs: Date.now() });
    refreshLocal();
    Alert.alert("Saved to Phone", `"${bp.name}" has been saved to this device.`);
  }

  // ── Robot programs ──────────────────────────────────────────────────────────
  const builtNames = new Set(builtPrograms.map(p => p.name));

  const builtCards: { summary: ProgramSummary; bp: BuiltProgram; isBuilt: true }[] =
    builtPrograms
      .filter(bp => !bp.isRoutine)
      .map(bp => {
        const live = programSummaries.find(p => p.name === bp.name);
        return { summary: live ?? syntheticSummary(bp), bp, isBuilt: true };
      });

  const externalCards: { summary: ProgramSummary; isBuilt: false }[] =
    programSummaries
      .filter(p => !builtNames.has(p.name))
      .map(p => ({ summary: p, isBuilt: false }));

  const allRobotCards = [...builtCards, ...externalCards];

  useEffect(() => robotClient.onProgramImages(setImages), []);

  const isActiveStatus = (s: ProgramStatus) => s === "Running" || s === "Starting" || s === "Finishing";

  function anotherBuiltRunning(forName: string) {
    return programSummaries.some(p => p.name !== forName && builtNames.has(p.name) && isActiveStatus(p.status));
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── On This Device section ── */}
        <View style={styles.sectionHeader}>
          <Smartphone size={13} color="#7c3aed" />
          <Text style={styles.sectionLabel}>ON THIS DEVICE</Text>
          <TouchableOpacity style={styles.importBtn} onPress={handleImport} activeOpacity={0.7}>
            <FileJson size={13} color="#7c3aed" />
            <Text style={styles.importBtnText}>Import .json</Text>
          </TouchableOpacity>
        </View>

        {localPrograms.filter(p => !p.isRoutine).length === 0 ? (
          <View style={styles.localEmpty}>
            <Text style={styles.localEmptyText}>No local programs — create one or import a .json file</Text>
          </View>
        ) : (
          localPrograms.filter(p => !p.isRoutine).map(p => (
            <LocalProgramCard key={p.name} program={p} connected={connected} onRefresh={refreshLocal} />
          ))
        )}

        <TouchableOpacity
          style={styles.addLocalCard}
          onPress={() => router.push("/program/builder?source=local")}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#7c3aed" />
          <Text style={styles.addLocalCardText}>New Local Program</Text>
        </TouchableOpacity>

        {/* ── On Robot section ── */}
        <View style={[styles.sectionHeader, { marginTop: 8 }]}>
          <Cpu size={13} color="#2563eb" />
          <Text style={[styles.sectionLabel, { color: "#2563eb" }]}>ON ROBOT</Text>
          {!connected && (
            <View style={styles.offlinePill}>
              <WifiOff size={11} color="#6b7280" />
              <Text style={styles.offlinePillText}>Not connected</Text>
            </View>
          )}
        </View>

        {allRobotCards.length === 0 ? (
          <View style={styles.empty}>
            <Box size={44} color="#d1d5db" />
            <Text style={styles.emptyTitle}>{connected ? "No Programs" : "Not Connected"}</Text>
            <Text style={styles.emptySubtitle}>
              {connected
                ? "Create a program below to get started."
                : "Connect to a robot to see its programs."}
            </Text>
          </View>
        ) : (
          allRobotCards.map(c => (
            <ProgramCard
              key={c.summary.name}
              p={c.summary}
              image={images[c.summary.name] ?? null}
              isBuilt={c.isBuilt}
              anotherBuiltRunning={c.isBuilt ? anotherBuiltRunning(c.summary.name) : false}
              onSaveToPhone={c.isBuilt ? () => handleSaveToPhone((c as any).bp) : undefined}
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

        <TouchableOpacity
          style={styles.routinesCard}
          onPress={() => router.navigate("/program/routines")}
          activeOpacity={0.7}
        >
          <Repeat2 size={16} color="#7c3aed" />
          <Text style={styles.routinesCardText}>Manage Routines</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: "#f3f4f6" },
  content:  { padding: 16, paddingBottom: 32, gap: 12 },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: -4,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#7c3aed",
    letterSpacing: 0.8,
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f5f3ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  importBtnText: { fontSize: 12, fontWeight: "600", color: "#7c3aed" },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  offlinePillText: { fontSize: 11, fontWeight: "600", color: "#6b7280" },

  // Robot program card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusText: { flex: 1, fontSize: 12, fontWeight: "600", letterSpacing: 0.4 },
  builtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  builtBadgeText: { fontSize: 10, fontWeight: "700", color: "#2563eb", letterSpacing: 0.4 },
  savePhoneBtn: { padding: 2 },

  cardBody: { padding: 14, gap: 12 },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  imageWrap: { width: 72, height: 72, borderRadius: 10, overflow: "hidden" },
  image:     { width: 72, height: 72 },
  imageFallback: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center",
  },
  infoCol:     { flex: 1, gap: 4, justifyContent: "center" },
  programName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  programDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },
  stepCountText: { fontSize: 12, color: "#9ca3af" },

  stepRow:   { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.6, paddingTop: 2 },
  stepText:  { flex: 1, fontSize: 13, color: "#374151", lineHeight: 18 },

  progressRow:  { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: {
    flex: 1, height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3 },
  percentText:  { width: 38, textAlign: "right", fontSize: 12, fontWeight: "600", color: "#6b7280" },

  buttonsRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Local program card
  localCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderLeftWidth: 3,
    borderLeftColor: "#7c3aed",
  },
  localCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#faf5ff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e9d5ff",
  },
  localBadgeText: { flex: 1, fontSize: 10, fontWeight: "700", color: "#7c3aed", letterSpacing: 0.4 },
  routinePill: {
    backgroundColor: "#ede9fe",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  routinePillText: { fontSize: 10, fontWeight: "700", color: "#7c3aed" },
  localCardBody: { padding: 14, paddingBottom: 10 },
  localCardActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  localActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  localActionText: { fontSize: 12, fontWeight: "600" },

  localEmpty: {
    backgroundColor: "#faf5ff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e9d5ff",
    borderStyle: "dashed",
  },
  localEmptyText: { fontSize: 13, color: "#9ca3af", textAlign: "center" },

  // New program buttons
  addLocalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  addLocalCardText: { fontSize: 14, fontWeight: "600", color: "#7c3aed" },
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
  routinesCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#7c3aed",
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "transparent",
  },
  routinesCardText: { fontSize: 14, fontWeight: "600", color: "#7c3aed" },

  // Empty state
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
    paddingBottom: 16,
    gap: 12,
  },
  emptyTitle:    { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
});
