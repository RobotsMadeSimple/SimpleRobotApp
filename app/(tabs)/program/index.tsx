import { wide } from "@/src/components/ui/responsive";
﻿import { ActionButton } from "@/src/components/ui/ActionButton";
import { SpeedOverrideModal } from "@/src/components/ui/SpeedOverrideModal";
import { ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useBuiltPrograms, useProgramSummaries, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { AlertTriangle, ChevronRight, Cpu, Gauge, Repeat2, ScanSearch, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// â”€â”€ Status theming â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Action buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Running Program Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function RunningCard({ p, isBuilt, anotherBuiltRunning, speedOverridePercent, onSpeedPress }: {
  p: ProgramSummary;
  isBuilt: boolean;
  anotherBuiltRunning: boolean;
  speedOverridePercent: number;
  onSpeedPress: () => void;
}) {
  const theme = STATUS_THEME[p.status] ?? STATUS_THEME.Ready;
  const pct = p.maxStepCount > 0 ? Math.round((p.currentStepNumber / p.maxStepCount) * 100) : 0;
  const buttons = getButtons(p, isBuilt);

  // Spinner while an action is being applied — cleared when the status changes
  // (the action took effect) or after a short fallback timeout.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { setPending(null); }, [p.status]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(t);
  }, [pending]);

  const progressAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => { progressAnim.setValue(pct); }, [pct]);

  const hasAlert = !!(p.errorDescription || p.warningDescription);
  const isError  = !!p.errorDescription;
  const alertColor        = isError ? '#dc2626' : '#d97706';
  const alertText         = p.errorDescription || p.warningDescription || '';

  return (
    <View style={styles.runningCardWrapper}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(p.name)}`)}
        style={styles.runningCard}
      >
        {/* Status bar â€” shows run state only */}
        <View style={[styles.statusBar, { backgroundColor: hasAlert ? alertColor : theme.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: hasAlert ? '#fff' : theme.dot }]} />
          <Text style={[styles.statusText, { color: hasAlert ? '#fff' : theme.text }]} numberOfLines={1}>
            {p.status}
          </Text>
          {isBuilt && (
            <View style={[styles.builtBadge, hasAlert && styles.builtBadgeAlert]}>
              <Cpu size={10} color={hasAlert ? '#fff' : '#2563eb'} />
              <Text style={[styles.builtBadgeText, hasAlert && { color: '#fff' }]}>BUILT</Text>
            </View>
          )}
        </View>

        {/* Alert strip â€” separate row below status bar, always fully visible */}
        {hasAlert && (
          <View style={[styles.alertStripe, { backgroundColor: alertColor }]}>
            {isError
              ? <XCircle size={13} color="#fff" />
              : <AlertTriangle size={13} color="#fff" />
            }
            <Text style={styles.alertStripeText} numberOfLines={2}>{alertText}</Text>
          </View>
        )}

        <View style={styles.runningCardBody}>
          <View style={styles.runningNameRow}>
            <Text style={styles.runningName} numberOfLines={1}>{p.name}</Text>
            <TouchableOpacity
              style={styles.speedPill}
              onPress={e => { e.stopPropagation?.(); onSpeedPress(); }}
              activeOpacity={0.7}
            >
              <Gauge size={11} color={speedOverridePercent !== 100 ? (speedOverridePercent > 100 ? "#dc2626" : "#d97706") : "#6b7280"} />
              <Text style={[styles.speedPillText, speedOverridePercent !== 100 && {
                color: speedOverridePercent > 100 ? "#dc2626" : "#d97706",
              }]}>{Math.round(speedOverridePercent)}%</Text>
            </TouchableOpacity>
          </View>

          {!!p.currentStepDescription && (
            <View style={styles.stepRow}>
              <Text style={styles.stepLabel}>STEP</Text>
              <Text style={styles.stepText} numberOfLines={2}>{p.currentStepDescription}</Text>
            </View>
          )}

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
                  <ActionButton
                    key={btn.label}
                    label={blocked ? "Another Program Running" : btn.label}
                    loading={pending === btn.label}
                    disabled={blocked || (pending !== null && pending !== btn.label)}
                    style={[styles.actionBtn, { backgroundColor: blocked ? "#9ca3af" : btn.bg }]}
                    textStyle={styles.actionBtnText}
                    onPress={(e) => { e.stopPropagation?.(); setPending(btn.label); btn.onPress(); }}
                  />
                );
              })}
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Alert border overlay */}
      {hasAlert && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.runningCardAlertBorder, { borderColor: alertColor }]}
        />
      )}
    </View>
  );
}

// â”€â”€ Nav Tile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function NavTile({
  icon,
  label,
  count,
  countLabel,
  color,
  bg,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  countLabel: string;
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navTile} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.navTileIcon, { backgroundColor: bg }]}>
        {icon}
      </View>
      <View style={styles.navTileBody}>
        <Text style={styles.navTileLabel}>{label}</Text>
        <Text style={styles.navTileCount}>{count} {countLabel}</Text>
      </View>
      <ChevronRight size={18} color="#9ca3af" />
    </TouchableOpacity>
  );
}

// â”€â”€ Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function ProgramScreen() {
  const programSummaries = useProgramSummaries();
  const builtPrograms    = useBuiltPrograms();
  const robotStatus      = useRobotStatus();
  const [visionCount,    setVisionCount]    = useState(0);
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [showVision,     setShowVision]     = useState(false);

  useFocusEffect(
    useCallback(() => {
      robotClient.getRobotConfig()
        .then(cfg => setShowVision(cfg.enableCameras ?? false))
        .catch(() => {});
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      robotClient.getVisionPrograms()
        .then(({ programs }) => setVisionCount(programs.length))
        .catch(() => {});
    }, [])
  );

  const builtNames = new Set(builtPrograms.map(p => p.name));

  const isActiveStatus = (s: ProgramStatus) => s !== "Ready";
  const activePrograms = programSummaries.filter(p => isActiveStatus(p.status));

  // Track the last program that was in a non-Ready state so it stays visible
  const lastRanNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (activePrograms.length > 0) {
      lastRanNameRef.current = activePrograms[0].name;
    }
  }, [activePrograms]);

  const displayedProgram: ProgramSummary | null =
    activePrograms.length > 0
      ? activePrograms[0]
      : lastRanNameRef.current
        ? (programSummaries.find(p => p.name === lastRanNameRef.current) ?? null)
        : null;

  function anotherBuiltRunning(forName: string) {
    return programSummaries.some(
      p => p.name !== forName && builtNames.has(p.name) &&
        (p.status === "Running" || p.status === "Starting" || p.status === "Finishing")
    );
  }

  const robotProgramCount = builtPrograms.filter(p => !p.isRoutine).length +
    programSummaries.filter(p => !builtNames.has(p.name)).length;
  const routineCount      = builtPrograms.filter(p => p.isRoutine).length;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, wide.content]}
      showsVerticalScrollIndicator={false}
    >
      {/* Now Running / Last Ran */}
      <Text style={styles.sectionLabel}>
        {displayedProgram && displayedProgram.status === "Ready" ? "LAST RAN" : "NOW RUNNING"}
      </Text>
      {displayedProgram ? (
        <RunningCard
          key={displayedProgram.name}
          p={displayedProgram}
          isBuilt={builtNames.has(displayedProgram.name)}
          anotherBuiltRunning={anotherBuiltRunning(displayedProgram.name)}
          speedOverridePercent={robotStatus?.speedOverridePercent ?? 100}
          onSpeedPress={() => setSpeedModalOpen(true)}
        />
      ) : (
        <View style={styles.nothingRunning}>
          <Text style={styles.nothingRunningText}>No program has been run yet</Text>
        </View>
      )}

      {/* Nav tiles */}
      <Text style={[styles.sectionLabel, { marginTop: 8 }]}>PROGRAMS</Text>

      <NavTile
        icon={<Cpu size={20} color="#2563eb" />}
        label="Programs"
        count={robotProgramCount}
        countLabel={robotProgramCount === 1 ? "program" : "programs"}
        color="#2563eb"
        bg="#eff6ff"
        onPress={() => router.navigate("/(tabs)/program/robot-programs")}
      />

      <NavTile
        icon={<Repeat2 size={20} color="#7c3aed" />}
        label="Routines"
        count={routineCount}
        countLabel={routineCount === 1 ? "routine" : "routines"}
        color="#7c3aed"
        bg="#f5f3ff"
        onPress={() => router.navigate("/program/routines")}
      />

      {showVision && (
        <NavTile
          icon={<ScanSearch size={20} color="#0891b2" />}
          label="Vision Programs"
          count={visionCount}
          countLabel={visionCount === 1 ? "program" : "programs"}
          color="#0891b2"
          bg="#ecfeff"
          onPress={() => router.navigate("/(tabs)/program/vision")}
        />
      )}
    </ScrollView>

    <SpeedOverrideModal
      visible={speedModalOpen}
      overridePercent={robotStatus?.speedOverridePercent ?? 100}
      onClose={() => setSpeedModalOpen(false)}
    />
    </View>
  );
}

// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: "#f3f4f6" },
  content:  { padding: 16, paddingBottom: 32, gap: 10 },

  nothingRunning: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  nothingRunningText: { fontSize: 13, color: "#9ca3af" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
    marginBottom: 2,
  },

  // Running program card
  runningCardWrapper: {
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  runningCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
  },
  runningCardAlertBorder: {
    borderWidth: 2.5,
    borderRadius: 16,
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
  builtBadgeAlert: { backgroundColor: "rgba(255,255,255,0.2)" },
  builtBadgeText: { fontSize: 10, fontWeight: "700", color: "#2563eb", letterSpacing: 0.4 },
  alertStripe: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 7, gap: 7,
  },
  alertStripeText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#fff", lineHeight: 17 },

  runningCardBody: { padding: 14, gap: 10 },
  runningNameRow:  { flexDirection: "row", alignItems: "center", gap: 8 },
  runningName:     { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" },
  speedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f3f4f6", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: "#e5e7eb",
  },
  speedPillText: { fontSize: 11, fontWeight: "700", color: "#6b7280" },

  stepRow:   { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.6, paddingTop: 2 },
  stepText:  { flex: 1, fontSize: 13, color: "#374151", lineHeight: 18 },

  progressRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: { flex: 1, height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, overflow: "hidden" },
  progressFill:  { height: 6, borderRadius: 3 },
  percentText:   { width: 38, textAlign: "right", fontSize: 12, fontWeight: "600", color: "#6b7280" },

  buttonsRow: { flexDirection: "row", gap: 8 },
  actionBtn:  { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Nav tiles
  navTile: {
    backgroundColor: "#fff",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  navTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  navTileBody:  { flex: 1 },
  navTileLabel: { fontSize: 15, fontWeight: "700", color: "#111827" },
  navTileCount: { fontSize: 12, color: "#6b7280", marginTop: 1 },
});
