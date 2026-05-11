import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BuiltProgram, ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useBuiltPrograms, useBuiltProgramsLoaded, useProgramSummaries, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { useFocusEffect } from "@react-navigation/native";
import { router, Tabs, useLocalSearchParams } from "expo-router";
import { AlertTriangle, Box, Cpu, Edit2, Play, Trash2, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Status theming ────────────────────────────────────────────────────────────

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

function getButtons(p: ProgramSummary, isBuilt: boolean): ActionBtn[] {
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
        { label: "Exit",     bg: "#374151", onPress: () => robotClient.abortProgram(name) },
      ];
    case "Complete":
      return [
        {
          label: "Run Again",
          bg: "#16a34a",
          onPress: () => {
            robotClient.resetProgram(name);
            if (isBuilt) {
              robotClient.executeBuiltProgram(name).catch(() => {});
            } else {
              robotClient.startProgram(name);
            }
          },
        },
        { label: "Exit",     bg: "#374151", onPress: () => robotClient.abortProgram(name) },
      ];
    case "Error":
      return [
        { label: "Exit",     bg: "#dc2626", onPress: () => robotClient.abortProgram(name) },
      ];
    default:
      return [];
  }
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

export default function MonitorProgramScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const programName = name ? decodeURIComponent(name) : "";
  const programSummaries    = useProgramSummaries();
  const builtPrograms       = useBuiltPrograms();
  const builtProgramsLoaded = useBuiltProgramsLoaded();

  const robot  = useSelectedRobot();
  const s      = robot?.status;
  const fmt    = (v?: number) => (v ?? 0).toFixed(1);

  const builtProgram = builtPrograms.find((p) => p.name === programName) ?? null;
  const isBuilt      = builtProgram !== null;

  const liveProgram = programSummaries.find((p) => p.name === programName) ?? null;
  const program: ProgramSummary | null =
    liveProgram ?? (builtProgram ? syntheticSummary(builtProgram) : null);

  // Image — fetched once on mount
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!programName) return;
    robotClient
      .getProgramImages()
      .then((imgs) => setImage(imgs[programName] ?? null))
      .catch(() => {});
  }, [programName]);

  // ── Log polling ────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (atBottomRef.current && logs.length > 0) {
      setTimeout(() => logsScrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [logs]);

  // ── Loading / not-found states ─────────────────────────────────────────────

  if (!program && !builtProgramsLoaded) {
    return (
      <View style={styles.root}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <SubPageHeader title={programName} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.centerTitle}>{programName}</Text>
          <Text style={styles.centerSub}>Loading from controller…</Text>
        </View>
      </View>
    );
  }

  if (!program) {
    return (
      <View style={styles.root}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <SubPageHeader title={programName} />
        <View style={styles.centerState}>
          <Box size={40} color="#d1d5db" />
          <Text style={styles.centerTitle}>Program not found</Text>
          <Text style={styles.centerSub}>"{programName}" is not registered in the controller.</Text>
        </View>
      </View>
    );
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const isRunnable = isBuilt && program.status === "Ready";
  const isActivelyRunning =
    program.status === "Running" ||
    program.status === "Starting" ||
    program.status === "Finishing";

  const builtProgramNames = new Set(builtPrograms.map((p) => p.name));
  const anotherBuiltRunning = programSummaries.some(
    (p) =>
      p.name !== programName &&
      builtProgramNames.has(p.name) &&
      (p.status === "Running" || p.status === "Starting" || p.status === "Finishing")
  );

  const theme = STATUS_THEME[program.status] ?? STATUS_THEME.Ready;
  const pct =
    program.maxStepCount > 0
      ? Math.round((program.currentStepNumber / program.maxStepCount) * 100)
      : 0;
  const buttons = isRunnable ? [] : getButtons(program, isBuilt);
  const showActions = buttons.length > 0 || isRunnable;

  // Progress bar — set directly so it always matches the text, no animation lag
  const progressAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    progressAnim.setValue(pct);
  }, [pct]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <SubPageHeader title={programName} />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero: full-width status banner ── */}
        <View style={[styles.hero, { backgroundColor: theme.bg }]}>
          {/* Status + built chip */}
          <View style={styles.heroTopRow}>
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

          {/* Image + name/description */}
          <View style={styles.heroIdentity}>
            <View style={[styles.imageWrap, { borderColor: theme.bar + "33" }]}>
              {image ? (
                <Image
                  source={{ uri: `data:image/png;base64,${image}` }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.imageFallback, { backgroundColor: theme.bar + "22" }]}>
                  <Box size={28} color={theme.bar} />
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
        </View>

        {/* ── Alerts (inline, no card) ── */}
        {(!!program.errorDescription || !!program.warningDescription) && (
          <View style={styles.alertsSection}>
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
          </View>
        )}

        {/* ── Progress section ── */}
        <View style={styles.section}>
          <View style={styles.progressHeader}>
            <Text style={styles.sectionLabel}>PROGRESS</Text>
            <Text style={styles.progressMeta}>
              <Text style={[styles.progressMetaBold, { color: theme.text }]}>
                {program.currentStepNumber}
              </Text>
              <Text style={styles.progressMetaMuted}> / {program.maxStepCount} steps</Text>
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange:  [0, 100],
                    outputRange: ["0%", "100%"],
                    extrapolate: "clamp",
                  }),
                  backgroundColor: theme.bar,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressPct, { color: theme.text }]}>{pct}%</Text>

          <View style={[styles.stepDescRow, { borderLeftColor: theme.bar }]}>
            <Text style={styles.stepDescLabel}>CURRENT STEP</Text>
            <Text style={[styles.stepDescText, !program.currentStepDescription && styles.stepDescPlaceholder]}>
              {program.currentStepDescription || "—"}
            </Text>
          </View>
        </View>

        {/* ── Position ── */}
        <View style={styles.gapBand} />
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>POSITION</Text>

          {/* Current coords */}
          <View style={styles.coordRow}>
            {(["X", "Y", "Z", "RZ"] as const).map((axis) => (
              <View key={axis} style={styles.coordCell}>
                <Text style={styles.coordLabel}>{axis}</Text>
                <Text style={styles.coordValue}>
                  {fmt(s?.[axis.toLowerCase() as "x" | "y" | "z" | "rz"])}
                </Text>
              </View>
            ))}
          </View>

          {/* Target coords */}
          <View style={[styles.coordRow, styles.coordRowTarget]}>
            {(["X", "Y", "Z", "RZ"] as const).map((axis) => (
              <View key={axis} style={styles.coordCell}>
                <Text style={styles.coordLabelTarget}>{axis}</Text>
                <Text style={styles.coordValueTarget}>
                  {fmt(s?.[`target${axis[0]}${axis.slice(1).toLowerCase()}` as "targetX" | "targetY" | "targetZ" | "targetRz"])}
                </Text>
              </View>
            ))}
          </View>

          {/* Point name */}
          <View style={styles.posSubRow}>
            <Text style={styles.posSubLabel}>POINT</Text>
            <Text style={[styles.posSubValue, !program.currentPointName && styles.posSubPlaceholder]}>
              {program.currentPointName || "—"}
            </Text>
          </View>

          {/* Speeds */}
          <View style={styles.posSubRow}>
            <Text style={styles.posSubLabel}>SPEED</Text>
            <Text style={styles.posSubValue}>{fmt(s?.speedS)} mm/s</Text>
            <Text style={styles.posSubDot}>·</Text>
            <Text style={styles.posSubLabel}>ACCEL</Text>
            <Text style={styles.posSubValue}>{fmt(s?.accelS)} mm/s²</Text>
            <Text style={styles.posSubDot}>·</Text>
            <Text style={styles.posSubLabel}>DECEL</Text>
            <Text style={styles.posSubValue}>{fmt(s?.decelS)} mm/s²</Text>
          </View>

          {/* Position offset */}
          <View style={styles.posSubRow}>
            <Text style={styles.posSubLabel}>OFFSET</Text>
            {(["X", "Y", "Z", "RX", "RY", "RZ"] as const).map((lbl) => {
              const v = program[`currentOffset${lbl}` as keyof typeof program] as number | undefined;
              return (
                <Text key={lbl} style={[styles.posSubValue, v == null && styles.posSubPlaceholder]}>
                  {lbl} {v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—"}{"  "}
                </Text>
              );
            })}
          </View>

          {/* Tool offset */}
          <View style={styles.posSubRow}>
            <Text style={styles.posSubLabel}>TOOL</Text>
            {(["X", "Y", "Z", "RX", "RY", "RZ"] as const).map((lbl) => {
              const v = program[`currentToolOffset${lbl}` as keyof typeof program] as number | undefined;
              return (
                <Text key={lbl} style={[styles.posSubValue, v == null && styles.posSubPlaceholder]}>
                  {lbl} {v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—"}{"  "}
                </Text>
              );
            })}
          </View>
        </View>

        {/* ── Action buttons ── */}
        {showActions && (
          <>
            <View style={styles.sectionDivider} />
            <View style={styles.actionsSection}>
              {isRunnable ? (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: anotherBuiltRunning ? "#9ca3af" : "#16a34a" }]}
                  onPress={() => { if (!anotherBuiltRunning) robotClient.executeBuiltProgram(programName).catch(() => {}); }}
                  disabled={anotherBuiltRunning}
                  activeOpacity={0.8}
                >
                  <Play size={15} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    {anotherBuiltRunning ? "Another Program Running" : "Run Program"}
                  </Text>
                </TouchableOpacity>
              ) : (
                buttons.map((btn) => {
                  const isStartAction = isBuilt && (btn.label === "Continue" || btn.label === "Run Again");
                  const blocked = isStartAction && anotherBuiltRunning;
                  return (
                    <TouchableOpacity
                      key={btn.label}
                      style={[styles.actionBtn, { backgroundColor: blocked ? "#9ca3af" : btn.bg }]}
                      onPress={blocked ? undefined : btn.onPress}
                      disabled={blocked}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.actionBtnText}>
                        {blocked ? "Another Program Running" : btn.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}

        {/* ── Program management (built only) ── */}
        {isBuilt && (
          <>
            <View style={styles.gapBand} />
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PROGRAM</Text>
              <View style={styles.managementRow}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() =>
                    router.push(`/program/builder?name=${encodeURIComponent(programName)}`)
                  }
                  activeOpacity={0.8}
                >
                  <Edit2 size={15} color="#2563eb" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.deleteBtn, isActivelyRunning && styles.deleteBtnDisabled]}
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
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── Logs ── */}
        <View style={styles.gapBand} />
        <View style={styles.logsSection}>
          <View style={styles.logHeader}>
            <Text style={styles.logSectionLabel}>PROGRAM LOG</Text>
            <View style={styles.logCountBadge}>
              <Text style={styles.logCountText}>{totalLogCount} entries</Text>
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

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1 },

  // ── Center states (loading / not-found) ───────────────────────────────────
  centerState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 12, padding: 32,
  },
  centerTitle: { fontSize: 17, fontWeight: "700", color: "#111827", textAlign: "center" },
  centerSub:   { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 20 },

  // ── Hero ───────────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 16,
  },
  heroTopRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
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

  heroIdentity: { flexDirection: "row", gap: 16, alignItems: "center" },
  imageWrap: {
    width: 72, height: 72, borderRadius: 14,
    overflow: "hidden", borderWidth: 1.5,
  },
  image:        { width: 72, height: 72 },
  imageFallback: {
    width: 72, height: 72,
    justifyContent: "center", alignItems: "center",
  },
  heroInfo:  { flex: 1, gap: 4 },
  heroName:  { fontSize: 20, fontWeight: "700", color: "#111827", lineHeight: 26 },
  heroDesc:  { fontSize: 13, color: "#6b7280", lineHeight: 18 },

  // ── Alerts section ─────────────────────────────────────────────────────────
  alertsSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 20, paddingVertical: 14,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  alertRow:  { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { flex: 1, fontSize: 13, color: "#dc2626", lineHeight: 18 },
  warnText:  { flex: 1, fontSize: 13, color: "#ea580c", lineHeight: 18 },

  // ── Generic section (white bg) ─────────────────────────────────────────────
  section: {
    backgroundColor: "#fff",
    paddingHorizontal: 20, paddingVertical: 18,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#9ca3af",
    letterSpacing: 1, textTransform: "uppercase",
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 20,
  },

  // ── Gap band (gray strip between major sections) ───────────────────────────
  gapBand: { height: 10, backgroundColor: "#f3f4f6" },

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
  stepDescText:        { fontSize: 14, color: "#1f2937", lineHeight: 20 },
  stepDescPlaceholder: { color: "#d1d5db" },

  // ── Actions section ────────────────────────────────────────────────────────
  actionsSection: {
    backgroundColor: "#fff",
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: "row", gap: 10,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", paddingVertical: 13,
    borderRadius: 11, alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // ── Management (edit / delete) ─────────────────────────────────────────────
  managementRow: { flexDirection: "row", gap: 10 },
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
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText:         { color: "#dc2626", fontSize: 14, fontWeight: "700" },
  deleteBtnTextDisabled: { color: "#fca5a5" },

  // ── Position ───────────────────────────────────────────────────────────────
  coordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  coordCell: {
    alignItems: "center",
    flex: 1,
  },
  coordLabel: {
    fontSize: 11, fontWeight: "600", color: "#9ca3af",
    letterSpacing: 0.5, marginBottom: 4,
  },
  coordValue: {
    fontSize: 20, fontWeight: "700", color: "#111827",
    fontFamily: "monospace",
  },

  // ── Position ───────────────────────────────────────────────────────────────
  coordRowTarget:   { marginTop: 6 },
  coordLabelTarget: { fontSize: 11, fontWeight: "600", color: "#c4b5fd", letterSpacing: 0.5, marginBottom: 4 },
  coordValueTarget: { fontSize: 16, fontWeight: "600", color: "#7c3aed", fontFamily: "monospace" },

  posSubRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 4, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  posSubLabel: {
    fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.5,
  },
  posSubValue: {
    fontSize: 12, fontWeight: "600", color: "#374151",
  },
  posSubPlaceholder: { color: "#d1d5db" },
  posSubDot: { fontSize: 10, color: "#d1d5db" },

  // ── Logs ───────────────────────────────────────────────────────────────────
  logsSection: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16,
    gap: 10,
  },
  logHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  logSectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#475569",
    letterSpacing: 1, textTransform: "uppercase",
  },
  logCountBadge: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  logCountText: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  logsScroll: {
    height: 260, borderRadius: 8,
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
