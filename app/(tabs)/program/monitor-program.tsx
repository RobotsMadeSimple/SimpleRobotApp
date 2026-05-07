import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BuiltProgram, ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useBuiltPrograms, useBuiltProgramsLoaded, useProgramSummaries } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { useFocusEffect } from "@react-navigation/native";
import { router, Tabs, useLocalSearchParams } from "expo-router";
import { AlertTriangle, Box, Cpu, Edit2, Play, Trash2, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Status theming (mirrors index.tsx) ────────────────────────────────────────

type StatusTheme = { bg: string; text: string; bar: string };

const STATUS_THEME: Record<ProgramStatus, StatusTheme> = {
  Ready:     { bg: "#f3f4f6", text: "#6b7280", bar: "#9ca3af" },
  Starting:  { bg: "#eff6ff", text: "#2563eb", bar: "#3b82f6" },
  Running:   { bg: "#f0fdf4", text: "#16a34a", bar: "#22c55e" },
  Finishing: { bg: "#f0fdf4", text: "#16a34a", bar: "#22c55e" },
  Stopping:  { bg: "#fff7ed", text: "#ea580c", bar: "#f97316" },
  Stopped:   { bg: "#f3f4f6", text: "#6b7280", bar: "#9ca3af" },
  Complete:  { bg: "#dcfce7", text: "#15803d", bar: "#22c55e" },
  Error:     { bg: "#fef2f2", text: "#dc2626", bar: "#ef4444" },
};

// ── Action buttons ────────────────────────────────────────────────────────────

type ActionBtn = { label: string; bg: string; onPress: () => void };

function getButtons(p: ProgramSummary): ActionBtn[] {
  const { name, status } = p;
  switch (status) {
    case "Ready":
      return [
        { label: "Start",    bg: "#16a34a", onPress: () => robotClient.startProgram(name) },
      ];
    case "Starting":
    case "Running":
    case "Finishing":
      return [
        { label: "Stop",     bg: "#dc2626", onPress: () => robotClient.stopProgram(name) },
      ];
    case "Stopped":
      return [
        { label: "Continue", bg: "#2563eb", onPress: () => robotClient.startProgram(name) },
        { label: "Reset",    bg: "#6b7280", onPress: () => robotClient.resetProgram(name) },
        { label: "Exit",     bg: "#374151", onPress: () => robotClient.abortProgram(name) },
      ];
    case "Complete":
      return [
        { label: "Reset",    bg: "#6b7280", onPress: () => robotClient.resetProgram(name) },
        { label: "Exit",     bg: "#374151", onPress: () => robotClient.abortProgram(name) },
      ];
    case "Error":
      return [
        { label: "Reset",    bg: "#6b7280", onPress: () => robotClient.resetProgram(name) },
        { label: "Exit",     bg: "#dc2626", onPress: () => robotClient.abortProgram(name) },
      ];
    default:
      return [];
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

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

export default function MonitorProgramScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const programName = name ? decodeURIComponent(name) : "";
  const programSummaries    = useProgramSummaries();
  const builtPrograms       = useBuiltPrograms();
  const builtProgramsLoaded = useBuiltProgramsLoaded();

  // Is this a controller-built program?
  const builtProgram = builtPrograms.find((p) => p.name === programName) ?? null;
  const isBuilt      = builtProgram !== null;

  // Find this program in the live summaries; fall back to synthetic if built but idle
  const liveProgram = programSummaries.find((p) => p.name === programName) ?? null;
  const program: ProgramSummary | null =
    liveProgram ?? (builtProgram ? syntheticSummary(builtProgram) : null);

  // Image fetched once on mount (or when program first appears)
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!programName) return;
    robotClient
      .getProgramImages()
      .then((imgs) => setImage(imgs[programName] ?? null))
      .catch(() => {});
  }, [programName]);

  // ── Log polling — only while this screen is focused ────────────────────────
  const [logs, setLogs] = useState<string[]>([]);
  const [totalLogCount, setTotalLogCount] = useState(0);
  const logsScrollRef = useRef<ScrollView>(null);
  const atBottomRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!programName) return;
      let fetchedUntil = 0;
      let cancelled = false;

      const fetchLogs = async () => {
        if (cancelled) return;
        try {
          const result = await robotClient.getProgramLogs(programName, fetchedUntil);
          if (cancelled) return;
          setTotalLogCount(result.totalCount);
          if (result.logs.length > 0) {
            setLogs((prev) => [...prev, ...result.logs]);
            fetchedUntil = result.totalCount;
          }
        } catch {}
      };

      setLogs([]);
      setTotalLogCount(0);
      fetchedUntil = 0;

      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [programName])
  );

  // Auto-scroll when new logs arrive (only if user was already at the bottom)
  useEffect(() => {
    if (atBottomRef.current && logs.length > 0) {
      setTimeout(() => logsScrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [logs]);

  // Still waiting for the controller to send the programs list
  if (!program && !builtProgramsLoaded) {
    return (
      <View style={styles.loading}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <SubPageHeader title={programName} />
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingTitle}>{programName}</Text>
          <Text style={styles.loadingSub}>Loading from controller…</Text>
        </View>
      </View>
    );
  }

  if (!program) {
    return (
      <View style={styles.notFound}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <SubPageHeader title={programName} />
        <Box size={40} color="#d1d5db" />
        <Text style={styles.notFoundText}>Program not found</Text>
        <Text style={styles.notFoundSub}>"{programName}" is not registered in the controller.</Text>
      </View>
    );
  }

  // Built programs should always use executeBuiltProgram, not startProgram.
  // Show "Run" whenever a built program is in a runnable-ready state.
  const isRunnable = isBuilt && program.status === "Ready";

  const theme = STATUS_THEME[program.status] ?? STATUS_THEME.Ready;
  const pct =
    program.maxStepCount > 0
      ? Math.round((program.currentStepNumber / program.maxStepCount) * 100)
      : 0;
  // For built programs in Ready state, we override with the Run button below
  const buttons = isRunnable ? [] : getButtons(program);

  // Animated progress bar — use measured pixel width to avoid % interpolation issues
  const [trackWidth, setTrackWidth] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (trackWidth === 0) return;
    Animated.timing(progressAnim, {
      toValue: (pct / 100) * trackWidth,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, trackWidth]);

  const isActivelyRunning =
    program.status === "Running" ||
    program.status === "Starting" ||
    program.status === "Finishing";

  return (
    <View style={styles.root}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <SubPageHeader title={programName} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Main card: identity + progress + live controls ── */}
        <View style={[styles.mainCard, { borderColor: theme.bar + "40" }]}>

          {/* Status badge + built chip */}
          <View style={[styles.mainCardHeader, { backgroundColor: theme.bg }]}>
            <View style={[styles.statusBadge, { borderColor: theme.bar + "55" }]}>
              <View style={[styles.statusDot, { backgroundColor: theme.bar }]} />
              <Text style={[styles.statusBadgeText, { color: theme.text }]}>
                {program.status}
              </Text>
            </View>
            {isBuilt && (
              <View style={styles.builtChip}>
                <Cpu size={11} color="#2563eb" />
                <Text style={styles.builtChipText}>BUILT</Text>
              </View>
            )}
          </View>

          <View style={styles.mainCardBody}>
            {/* Image + name / description */}
            <View style={styles.heroBody}>
              <View style={[styles.imageWrap, { borderColor: theme.bar + "33" }]}>
                {image ? (
                  <Image
                    source={{ uri: `data:image/png;base64,${image}` }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.imageFallback, { backgroundColor: theme.bar + "18" }]}>
                    <Box size={32} color={theme.bar} />
                  </View>
                )}
              </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{program.name}</Text>
                <Text style={styles.heroDesc} numberOfLines={2}>
                  {program.description || "No description"}
                </Text>
              </View>
            </View>

            {/* Alerts */}
            {!!program.errorDescription && (
              <View style={styles.alertRow}>
                <XCircle size={14} color="#dc2626" />
                <Text style={styles.errorText} numberOfLines={2}>{program.errorDescription}</Text>
              </View>
            )}
            {!!program.warningDescription && (
              <View style={styles.alertRow}>
                <AlertTriangle size={14} color="#ea580c" />
                <Text style={styles.warnText} numberOfLines={2}>{program.warningDescription}</Text>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider} />

            {/* Progress */}
            <View style={styles.progressHeader}>
              <Text style={styles.sectionLabel}>PROGRESS</Text>
              <Text style={styles.progressMeta}>
                <Text style={[styles.progressMetaBold, { color: theme.text }]}>
                  {program.currentStepNumber}
                </Text>
                <Text style={styles.progressMetaMuted}> / {program.maxStepCount} steps</Text>
              </Text>
            </View>

            <View
              style={styles.progressTrack}
              onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
            >
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: progressAnim, backgroundColor: theme.bar },
                ]}
              />
            </View>
            <Text style={[styles.progressPct, { color: theme.text }]}>{pct}%</Text>

            {!!program.currentStepDescription && (
              <View style={[styles.stepDescRow, { borderLeftColor: theme.bar }]}>
                <Text style={styles.stepDescLabel}>CURRENT STEP</Text>
                <Text style={styles.stepDescText}>{program.currentStepDescription}</Text>
              </View>
            )}

            {/* Live control buttons */}
            {(buttons.length > 0 || isRunnable) && (
              <>
                <View style={styles.divider} />
                <View style={styles.liveButtons}>
                  {isRunnable ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: "#16a34a" }]}
                      onPress={() => robotClient.executeBuiltProgram(programName).catch(() => {})}
                      activeOpacity={0.8}
                    >
                      <Play size={15} color="#fff" />
                      <Text style={styles.actionBtnText}>Run</Text>
                    </TouchableOpacity>
                  ) : (
                    buttons.map((btn) => (
                      <TouchableOpacity
                        key={btn.label}
                        style={[styles.actionBtn, { backgroundColor: btn.bg }]}
                        onPress={btn.onPress}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.actionBtnText}>{btn.label}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── Controller program actions (built only) ──── */}
        {isBuilt && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>CONTROLLER PROGRAM</Text>
            <View style={styles.controllerActions}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() =>
                  router.push(`/program/builder?name=${encodeURIComponent(programName)}`)
                }
                activeOpacity={0.8}
              >
                <Edit2 size={15} color="#2563eb" />
                <Text style={styles.editBtnText}>Edit Program</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                disabled={isActivelyRunning}
                onPress={() =>
                  Alert.alert(
                    "Delete Program",
                    `Delete "${programName}"? This cannot be undone.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          await robotClient.deleteBuiltProgram(programName).catch(() => {});
                          robotClient.getBuiltPrograms().catch(() => {});
                          router.back();
                        },
                      },
                    ]
                  )
                }
                activeOpacity={0.8}
              >
                <Trash2 size={15} color={isActivelyRunning ? "#fca5a5" : "#dc2626"} />
                <Text style={[styles.deleteBtnText, isActivelyRunning && styles.deleteBtnTextDisabled]}>
                  Delete Program
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Logs card ────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.logHeader}>
            <Text style={styles.sectionLabel}>PROGRAM LOG</Text>
            <View style={styles.logCountBadge}>
              <Text style={styles.logCountText}>{totalLogCount}</Text>
            </View>
          </View>

          <ScrollView
            ref={logsScrollRef}
            style={styles.logsScroll}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            onScrollEndDrag={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              atBottomRef.current =
                contentOffset.y + layoutMeasurement.height >= contentSize.height - 20;
            }}
          >
            {logs.length === 0 ? (
              <Text style={styles.logsEmpty}>No log entries yet.</Text>
            ) : (
              logs.map((entry, i) => (
                <View key={i} style={[styles.logEntry, i % 2 === 0 && styles.logEntryAlt]}>
                  <Text style={styles.logIndex}>{String(i + 1).padStart(4, " ")}</Text>
                  <Text style={styles.logText}>{entry}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
} as const;

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#f3f4f6" },
  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },

  // ── Loading ────────────────────────────────────────────────────────────────
  loading: {
    flex: 1, backgroundColor: "#f3f4f6",
    alignItems: "center", justifyContent: "center",
    padding: 32,
  },
  loadingCard: {
    backgroundColor: "#fff", borderRadius: 20,
    paddingVertical: 36, paddingHorizontal: 32,
    alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOpacity: 0.08,
    shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    minWidth: 240,
  },
  loadingTitle: { fontSize: 17, fontWeight: "700", color: "#111827", textAlign: "center" },
  loadingSub:   { fontSize: 13, color: "#9ca3af" },

  // ── Not-found ──────────────────────────────────────────────────────────────
  notFound: {
    flex: 1, backgroundColor: "#f3f4f6",
    alignItems: "center", justifyContent: "center",
    gap: 10, padding: 32,
  },
  notFoundText: { fontSize: 18, fontWeight: "700", color: "#374151" },
  notFoundSub:  { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 20 },

  statusBadge: {
    flexDirection: "row", alignItems: "center",
    gap: 7, borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  statusDot:       { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  builtChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#dbeafe", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  builtChipText: { fontSize: 11, fontWeight: "700", color: "#2563eb", letterSpacing: 0.5 },

  heroBody: { flexDirection: "row", gap: 14, alignItems: "center" },
  imageWrap: {
    width: 80, height: 80, borderRadius: 14,
    overflow: "hidden", borderWidth: 1.5,
  },
  image: { width: 80, height: 80 },
  imageFallback: {
    width: 80, height: 80, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
  },
  heroInfo:  { flex: 1, gap: 5 },
  heroName:  { fontSize: 20, fontWeight: "700", color: "#111827", lineHeight: 26 },
  heroDesc:  { fontSize: 13, color: "#6b7280", lineHeight: 18 },

  alertRow:  { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { flex: 1, fontSize: 13, color: "#dc2626", lineHeight: 18 },
  warnText:  { flex: 1, fontSize: 13, color: "#ea580c", lineHeight: 18 },

  // ── White card (shared) ────────────────────────────────────────────────────
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 10,
    ...SHADOW,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 1, textTransform: "uppercase",
  },

  // ── Main card ──────────────────────────────────────────────────────────────
  mainCard: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1.5, overflow: "hidden",
    ...SHADOW,
  },
  mainCardHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  mainCardBody: { padding: 16, gap: 12 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#e5e7eb" },

  // ── Progress ───────────────────────────────────────────────────────────────
  progressHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  progressMeta:     { fontSize: 13, color: "#9ca3af" },
  progressMetaBold: { fontWeight: "700" },
  progressMetaMuted:{},
  progressTrack: {
    height: 10, backgroundColor: "#e5e7eb", borderRadius: 5, overflow: "hidden",
  },
  progressFill:  { height: 10, borderRadius: 5 },
  progressPct:   { fontSize: 13, fontWeight: "700", textAlign: "right" },

  stepDescRow: {
    borderLeftWidth: 3, borderRadius: 2,
    paddingLeft: 10, paddingVertical: 6,
    backgroundColor: "#f9fafb", gap: 3,
  },
  stepDescLabel: {
    fontSize: 9, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  stepDescText: { fontSize: 14, color: "#1f2937", lineHeight: 20 },

  // ── Live control buttons (inside main card) ────────────────────────────────
  liveButtons: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1, flexDirection: "row", paddingVertical: 12,
    borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // ── Controller program card ────────────────────────────────────────────────
  controllerActions: { flexDirection: "row", gap: 10 },
  editBtn: {
    flex: 1, flexDirection: "row", paddingVertical: 12,
    borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#93c5fd", backgroundColor: "#eff6ff",
  },
  editBtnText: { color: "#2563eb", fontSize: 14, fontWeight: "700" },
  deleteBtn: {
    flex: 1, flexDirection: "row", paddingVertical: 12,
    borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#fca5a5", backgroundColor: "#fef2f2",
  },
  deleteBtnText:         { color: "#dc2626", fontSize: 14, fontWeight: "700" },
  deleteBtnTextDisabled: { color: "#fca5a5" },

  // ── Logs card ──────────────────────────────────────────────────────────────
  logHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  logCountBadge: {
    backgroundColor: "#f3f4f6", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  logCountText:  { fontSize: 11, fontWeight: "600", color: "#6b7280" },
  logsScroll: {
    height: 260, backgroundColor: "#0f172a", borderRadius: 10, padding: 10,
  },
  logsEmpty:    { color: "#64748b", fontSize: 13, fontStyle: "italic" },
  logEntry:     { flexDirection: "row", gap: 10, paddingVertical: 3, paddingHorizontal: 2 },
  logEntryAlt:  { backgroundColor: "rgba(255,255,255,0.04)" },
  logIndex: {
    fontSize: 11, color: "#475569",
    fontVariant: ["tabular-nums"], lineHeight: 18,
  },
  logText: { flex: 1, fontSize: 12, color: "#cbd5e1", lineHeight: 18 },
});
