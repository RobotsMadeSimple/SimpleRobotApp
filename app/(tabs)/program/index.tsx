import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import { Box } from "lucide-react-native";
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
    case "Stopping":
    default:
      return [];
  }
}

// ── Program Card ──────────────────────────────────────────────────────────────

function ProgramCard({
  p,
  image,
}: {
  p: ProgramSummary;
  image: string | null;
}) {
  const theme = STATUS_THEME[p.status] ?? STATUS_THEME.Ready;
  const pct =
    p.maxStepCount > 0
      ? Math.round((p.currentStepNumber / p.maxStepCount) * 100)
      : 0;
  const buttons = getButtons(p);

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

  // Status bar label — append error/warning if present
  const alert = p.errorDescription || p.warningDescription;
  const statusLabel = alert ? `${p.status}  ·  ${alert}` : p.status;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push(
          `/(tabs)/program/monitor-program?name=${encodeURIComponent(p.name)}`
        )
      }
      style={styles.card}
    >
      {/* ── Status bar ────────────────────────────────── */}
      <View style={[styles.statusBar, { backgroundColor: theme.bg }]}>
        <View style={[styles.statusDot, { backgroundColor: theme.dot }]} />
        <Text
          style={[styles.statusText, { color: theme.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {statusLabel}
        </Text>
      </View>

      <View style={styles.cardBody}>
        {/* ── Header row: image + name / description ─── */}
        <View style={styles.headerRow}>
          <View style={styles.imageWrap}>
            {image ? (
              <Image
                source={{ uri: `data:image/png;base64,${image}` }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imageFallback}>
                <Box size={28} color="#9ca3af" />
              </View>
            )}
          </View>

          <View style={styles.infoCol}>
            <Text style={styles.programName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.programDesc} numberOfLines={2}>
              {p.description || "No description"}
            </Text>
          </View>
        </View>

        {/* ── Current step description ───────────────── */}
        <View style={styles.stepRow}>
          <Text style={styles.stepLabel}>STEP</Text>
          <Text style={styles.stepText} numberOfLines={2} ellipsizeMode="tail">
            {p.currentStepDescription || "—"}
          </Text>
        </View>

        {/* ── Progress bar ───────────────────────────── */}
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
          <Text style={styles.percentText}>{pct}%</Text>
        </View>

        {/* ── Action buttons ─────────────────────────── */}
        {buttons.length > 0 && (
          <View style={styles.buttonsRow}>
            {buttons.map((btn) => (
              <TouchableOpacity
                key={btn.label}
                style={[styles.actionBtn, { backgroundColor: btn.bg }]}
                onPress={(e) => {
                  e.stopPropagation?.();
                  btn.onPress();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnText}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ProgramScreen() {
  const status = useRobotStatus();
  const programs = status.programs;
  const [images, setImages] = useState<Record<string, string | null>>({});

  // Re-fetch images whenever the set of registered programs changes
  const programKeys = programs.map((p) => p.name).join(",");
  useEffect(() => {
    if (programs.length === 0) return;
    robotClient
      .getProgramImages()
      .then(setImages)
      .catch(() => {});
  }, [programKeys]);

  return (
    <View style={{ flex: 1 }}>
      <NotConnectedOverlay />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {programs.length === 0 ? (
          <View style={styles.empty}>
            <Box size={44} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Programs</Text>
            <Text style={styles.emptySubtitle}>
              Programs registered by the external controller will appear here.
            </Text>
          </View>
        ) : (
          programs.map((p) => (
            <ProgramCard key={p.name} p={p} image={images[p.name] ?? null} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 16, paddingBottom: 32, gap: 12 },

  // Card shell
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

  // Status bar (slim top strip)
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { flex: 1, fontSize: 12, fontWeight: "600", letterSpacing: 0.4 },

  // Card body
  cardBody: { padding: 14, gap: 12 },

  // Header row
  headerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  imageWrap: { width: 72, height: 72, borderRadius: 10, overflow: "hidden" },
  image: { width: 72, height: 72 },
  imageFallback: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  infoCol: { flex: 1, gap: 4, justifyContent: "center" },
  programName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  programDesc: { fontSize: 13, color: "#6b7280", lineHeight: 18 },

  // Step row
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.6,
    paddingTop: 2,
  },
  stepText: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 18 },

  // Progress
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3 },
  percentText: {
    width: 38,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },

  // Buttons
  buttonsRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Empty state
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151" },
  emptySubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
