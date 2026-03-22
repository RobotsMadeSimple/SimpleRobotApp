import { ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Tabs, Stack, useLocalSearchParams } from "expo-router";
import { AlertTriangle, Box, XCircle } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
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

export default function MonitorProgramScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const programName = name ? decodeURIComponent(name) : "";
  const status = useRobotStatus();

  // Find this program in the live status list
  const program = status.programs.find((p) => p.name === programName) ?? null;

  // Image fetched once on mount (or when program first appears)
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
  const atBottomRef = useRef(true); // track whether the user is at the bottom

  useEffect(() => {
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

    // Reset state when navigating to a different program
    setLogs([]);
    setTotalLogCount(0);
    fetchedUntil = 0;

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [programName]);

  // Auto-scroll when new logs arrive (only if user was already at the bottom)
  useEffect(() => {
    if (atBottomRef.current && logs.length > 0) {
      setTimeout(() => logsScrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [logs]);

  if (!program) {
    return (
      <View style={styles.notFound}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <Box size={40} color="#d1d5db" />
        <Text style={styles.notFoundText}>Program not found</Text>
        <Text style={styles.notFoundSub}>"{programName}" is not loaded in the controller.</Text>
      </View>
    );
  }

  const theme = STATUS_THEME[program.status] ?? STATUS_THEME.Ready;
  const pct =
    program.maxStepCount > 0
      ? Math.round((program.currentStepNumber / program.maxStepCount) * 100)
      : 0;
  const buttons = getButtons(program);

  // Animated progress bar
  const progressAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct]);

  return (
    <View style={styles.root}>
      {/* Hide tab bar; Stack header from _layout.tsx shows title + back arrow */}
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      {/* Dynamically update the Stack header title to the program name */}
      <Stack.Screen options={{ title: programName }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status header card ───────────────────────── */}
        <View style={[styles.statusCard, { backgroundColor: theme.bg }]}>
          <View style={[styles.statusBadge, { borderColor: theme.text + "40" }]}>
            <View style={[styles.statusDot, { backgroundColor: theme.bar }]} />
            <Text style={[styles.statusBadgeText, { color: theme.text }]}>
              {program.status}
            </Text>
          </View>

          {program.errorDescription ? (
            <View style={styles.alertRow}>
              <XCircle size={14} color="#dc2626" />
              <Text style={styles.errorText} numberOfLines={2}>
                {program.errorDescription}
              </Text>
            </View>
          ) : null}

          {program.warningDescription ? (
            <View style={styles.alertRow}>
              <AlertTriangle size={14} color="#ea580c" />
              <Text style={styles.warnText} numberOfLines={2}>
                {program.warningDescription}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Info card: image + name / description ───── */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.imageWrap}>
              {image ? (
                <Image
                  source={{ uri: `data:image/png;base64,${image}` }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.imageFallback}>
                  <Box size={36} color="#9ca3af" />
                </View>
              )}
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.programName}>{program.name}</Text>
              <Text style={styles.programDesc}>
                {program.description || "No description"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Progress card ────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Progress</Text>

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ["0%", "100%"],
                      extrapolate: "clamp",
                    }),
                    backgroundColor: theme.bar,
                  },
                ]}
              />
            </View>
            <Text style={[styles.percentText, { color: theme.text }]}>{pct}%</Text>
          </View>

          <Text style={styles.stepCountText}>
            Step {program.currentStepNumber} of {program.maxStepCount}
          </Text>

          {program.currentStepDescription ? (
            <View style={styles.stepDescRow}>
              <Text style={styles.stepDescLabel}>Current Step</Text>
              <Text style={styles.stepDescText}>{program.currentStepDescription}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Action buttons ───────────────────────────── */}
        {buttons.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Actions</Text>
            <View style={styles.buttonsRow}>
              {buttons.map((btn) => (
                <TouchableOpacity
                  key={btn.label}
                  style={[styles.actionBtn, { backgroundColor: btn.bg }]}
                  onPress={btn.onPress}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnText}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Logs card ────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.logHeader}>
            <Text style={styles.sectionLabel}>Program Log</Text>
            <Text style={styles.logCount}>{totalLogCount} entries</Text>
          </View>

          <ScrollView
            ref={logsScrollRef}
            style={styles.logsScroll}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            onScrollEndDrag={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } =
                e.nativeEvent;
              atBottomRef.current =
                contentOffset.y + layoutMeasurement.height >= contentSize.height - 20;
            }}
          >
            {logs.length === 0 ? (
              <Text style={styles.logsEmpty}>No log entries yet.</Text>
            ) : (
              logs.map((entry, i) => (
                <View
                  key={i}
                  style={[styles.logEntry, i % 2 === 0 && styles.logEntryAlt]}
                >
                  <Text style={styles.logIndex}>
                    {String(i + 1).padStart(4, " ")}
                  </Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },

  // Not-found state
  notFound: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
  },
  notFoundText: { fontSize: 18, fontWeight: "700", color: "#374151" },
  notFoundSub: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },

  // Status header
  statusCard: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  alertRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  errorText: { flex: 1, fontSize: 13, color: "#dc2626", lineHeight: 18 },
  warnText:  { flex: 1, fontSize: 13, color: "#ea580c", lineHeight: 18 },

  // White cards
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Info card
  infoRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  imageWrap: { width: 88, height: 88, borderRadius: 12, overflow: "hidden" },
  image: { width: 88, height: 88 },
  imageFallback: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  infoCol: { flex: 1, gap: 6 },
  programName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  programDesc: { fontSize: 13, color: "#6b7280", lineHeight: 19 },

  // Progress card
  progressRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: 8, borderRadius: 4 },
  percentText: { width: 42, textAlign: "right", fontSize: 14, fontWeight: "700" },
  stepCountText: { fontSize: 13, color: "#6b7280" },
  stepDescRow: { gap: 4 },
  stepDescLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  stepDescText: { fontSize: 14, color: "#374151", lineHeight: 20 },

  // Actions
  buttonsRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Logs
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logCount: { fontSize: 12, color: "#9ca3af" },
  logsScroll: {
    height: 260,
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 10,
  },
  logsEmpty: { color: "#64748b", fontSize: 13, fontStyle: "italic" },
  logEntry: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  logEntryAlt: { backgroundColor: "rgba(255,255,255,0.04)" },
  logIndex: {
    fontSize: 11,
    color: "#475569",
    fontVariant: ["tabular-nums"],
    lineHeight: 18,
  },
  logText: { flex: 1, fontSize: 12, color: "#cbd5e1", lineHeight: 18 },
});
