import { useIsWide } from "@/src/components/ui/responsive";
import { SpeedOverrideModal } from "@/src/components/ui/SpeedOverrideModal";
import { ProgramStatus, ProgramSummary } from "@/src/models/robotModels";
import { useBuiltPrograms, useProgramSummaries, useRobotStatus } from "@/src/providers/RobotProvider";
import { useActionPending } from "@/src/hooks/useActionPending";
import { robotClient } from "@/src/services/RobotConnectService";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { router, useFocusEffect } from "expo-router";
import { AlertTriangle, Box, Cpu, Gauge, PlayCircle, Repeat2, ScanSearch, Smartphone, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Button,
  ButtonVariant,
  EmptyState,
  InfoTip,
  ListRow,
  PageHeader,
  Screen,
  SectionHeader,
  StatTile,
  accents,
  colors,
  radii,
  shadows,
  spacing,
} from "@/src/components/ui/kit";

// Feature-tint colors, mapped onto the kit's secondary accent families. They
// differentiate the four program-list categories from each other (kit only
// defines a single "accent" blue).
const ROUTINE_TINT = { color: accents.purple, bg: accents.purpleSoft };
const LOCAL_TINT    = { color: accents.orange, bg: accents.orangeSoft };
const VISION_TINT   = { color: accents.cyan,   bg: accents.cyanSoft };

// ── Status theming ─────────────────────────────────────────────────────────────
// Collapsed onto the same handful of tones StatusPill uses (success/accent/
// warning/danger/neutral) instead of the eight bespoke shades the old screen had.

type StatusTheme = { bg: string; text: string; bar: string; dot: string };

const STATUS_THEME: Record<ProgramStatus, StatusTheme> = {
  Ready:     { bg: colors.background,  text: colors.textMuted, bar: colors.textFaint, dot: colors.textFaint },
  Starting:  { bg: colors.accentSoft,  text: colors.accent,    bar: colors.accentBright, dot: colors.accentBright },
  Running:   { bg: colors.successSoft, text: colors.success,   bar: colors.success,   dot: colors.success },
  Finishing: { bg: colors.successSoft, text: colors.success,   bar: colors.success,   dot: colors.success },
  Stopping:  { bg: colors.warningSoft, text: colors.warning,   bar: colors.warning,   dot: colors.warning },
  Stopped:   { bg: colors.background,  text: colors.textMuted, bar: colors.textFaint, dot: colors.textFaint },
  Complete:  { bg: colors.successSoft, text: colors.success,   bar: colors.success,   dot: colors.success },
  Error:     { bg: colors.dangerSoft,  text: colors.danger,    bar: colors.danger,    dot: colors.danger },
};

// ── Action buttons ─────────────────────────────────────────────────────────────

type ActionBtn = { label: string; variant: ButtonVariant; bg?: string; onPress: () => void };

function getButtons(p: ProgramSummary, isBuilt: boolean): ActionBtn[] {
  const { name, status } = p;
  switch (status) {
    case "Ready":
      return [{ label: "Start", variant: "primary", bg: colors.success, onPress: () => robotClient.startProgram(name) }];
    case "Starting":
    case "Running":
    case "Finishing":
      return [{ label: "Stop", variant: "destructive", onPress: () => robotClient.stopProgram(name) }];
    case "Stopped":
      return [
        { label: "Continue", variant: "primary", onPress: () => robotClient.startProgram(name) },
        { label: "Exit",     variant: "primary", bg: colors.textSecondary, onPress: () => robotClient.abortProgram(name) },
      ];
    case "Complete":
      return [
        {
          label: "Run Again",
          variant: "primary",
          bg: colors.success,
          onPress: () => { robotClient.runProgramAgain(name, isBuilt); },
        },
        { label: "Exit", variant: "primary", bg: colors.textSecondary, onPress: () => robotClient.abortProgram(name) },
      ];
    case "Error":
      return [{ label: "Exit", variant: "destructive", onPress: () => robotClient.abortProgram(name) }];
    case "Stopping":
    default:
      return [];
  }
}

// ── Running Program Card ───────────────────────────────────────────────────────

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

  // Spinner while an action is being applied — see useActionPending for when it clears.
  const [pending, setPending] = useActionPending(p);

  const progressAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => { progressAnim.setValue(pct); }, [pct]);

  const hasAlert = !!(p.errorDescription || p.warningDescription);
  const isError  = !!p.errorDescription;
  const alertColor = isError ? colors.danger : colors.warning;
  const alertText  = p.errorDescription || p.warningDescription || '';

  return (
    <View style={styles.runningCardWrapper}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.navigate(`/(tabs)/program/monitor-program?name=${encodeURIComponent(p.name)}`)}
        style={styles.runningCard}
      >
        {/* Status bar — shows run state only */}
        <View style={[styles.statusBar, { backgroundColor: hasAlert ? alertColor : theme.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: hasAlert ? colors.onAccent : theme.dot }]} />
          <Text style={[styles.statusText, { color: hasAlert ? colors.onAccent : theme.text }]} numberOfLines={1}>
            {p.status}
          </Text>
          {isBuilt && (
            <View style={[styles.builtBadge, hasAlert && styles.builtBadgeAlert]}>
              <Cpu size={10} color={hasAlert ? colors.onAccent : colors.accent} />
              <Text style={[styles.builtBadgeText, hasAlert && { color: colors.onAccent }]}>BUILT</Text>
            </View>
          )}
        </View>

        {/* Alert strip — separate row below status bar, always fully visible */}
        {hasAlert && (
          <View style={[styles.alertStripe, { backgroundColor: alertColor }]}>
            {isError
              ? <XCircle size={13} color={colors.onAccent} />
              : <AlertTriangle size={13} color={colors.onAccent} />
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
              <Gauge size={11} color={speedOverridePercent !== 100 ? (speedOverridePercent > 100 ? colors.danger : colors.warning) : colors.textMuted} />
              <Text style={[styles.speedPillText, speedOverridePercent !== 100 && {
                color: speedOverridePercent > 100 ? colors.danger : colors.warning,
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
                  <Button
                    key={btn.label}
                    label={blocked ? "Another Program Running" : btn.label}
                    variant={btn.variant}
                    size="sm"
                    loading={pending === btn.label}
                    disabled={blocked || (pending !== null && pending !== btn.label)}
                    style={[
                      styles.actionBtn,
                      blocked ? { backgroundColor: colors.textFaint } : btn.bg ? { backgroundColor: btn.bg } : undefined,
                    ]}
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

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ProgramScreen() {
  const programSummaries = useProgramSummaries();
  const builtPrograms    = useBuiltPrograms();
  const robotStatus      = useRobotStatus();
  const isWide           = useIsWide();
  const [visionCount,    setVisionCount]    = useState(0);
  const [localCount,     setLocalCount]     = useState(0);
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

  useFocusEffect(
    useCallback(() => {
      LocalProgramService.getAll()
        .then(programs => setLocalCount(programs.length))
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

  const activeCount = programSummaries.filter(
    p => p.status === "Running" || p.status === "Starting" || p.status === "Finishing"
  ).length;

  const statRow = (
    <View style={styles.statRow}>
      <StatTile
        label="Running"
        value={activeCount}
        icon={PlayCircle}
        tint={activeCount > 0 ? [colors.success, colors.successSoft] : undefined}
        style={styles.statTile}
      />
      <StatTile label="Programs" value={robotProgramCount} icon={Cpu} style={styles.statTile} />
      <StatTile
        label="Routines"
        value={routineCount}
        icon={Repeat2}
        tint={[ROUTINE_TINT.color, ROUTINE_TINT.bg]}
        style={styles.statTile}
      />
    </View>
  );

  const runningSection = (
    <>
      {/* Now Running / Last Ran */}
      <SectionHeader title={displayedProgram && displayedProgram.status === "Ready" ? "Last Ran" : "Now Running"} />
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
        <EmptyState
          icon={<PlayCircle size={32} color={colors.textFaint} />}
          title="No program has been run yet"
          subtitle="Pick a program below and start it — its live step, progress and alerts appear here."
        />
      )}
    </>
  );

  const navSection = (
    <>
      {/* Nav tiles */}
      <SectionHeader
        title="Programs"
        icon={Box}
        right={
          <InfoTip text="A program is a full sequence the robot runs on its own. A routine is a reusable block of steps that programs call with a Call Routine step. Local Programs are drafts kept only on this device, not on the robot." />
        }
      />

      <ListRow
        title="Programs"
        subtitle={`${robotProgramCount} ${robotProgramCount === 1 ? "program" : "programs"}`}
        icon={<Cpu size={20} color={colors.accent} />}
        iconColor={colors.accentSoft}
        onPress={() => router.navigate("/(tabs)/program/robot-programs")}
      />

      <ListRow
        title="Routines"
        subtitle={`${routineCount} ${routineCount === 1 ? "routine" : "routines"}`}
        icon={<Repeat2 size={20} color={ROUTINE_TINT.color} />}
        iconColor={ROUTINE_TINT.bg}
        onPress={() => router.navigate("/program/routines")}
      />

      {localCount > 0 && (
        <ListRow
          title="Local Programs"
          subtitle={`${localCount} ${localCount === 1 ? "draft on this device" : "drafts on this device"}`}
          icon={<Smartphone size={20} color={LOCAL_TINT.color} />}
          iconColor={LOCAL_TINT.bg}
          onPress={() => router.navigate("/(tabs)/program/phone-programs")}
        />
      )}

      {showVision && (
        <ListRow
          title="Vision Programs"
          subtitle={`${visionCount} ${visionCount === 1 ? "program" : "programs"}`}
          icon={<ScanSearch size={20} color={VISION_TINT.color} />}
          iconColor={VISION_TINT.bg}
          onPress={() => router.navigate("/(tabs)/program/vision")}
        />
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Program" subtitle="Build, run, and monitor robot programs" />
      <Screen>
        {statRow}
        {isWide ? (
          // Wide: the running program on the left, the page selectors on the right.
          <View style={styles.wideRow}>
            <View style={styles.wideLeftCol}>{runningSection}</View>
            <View style={styles.wideRightCol}>{navSection}</View>
          </View>
        ) : (
          <>
            {runningSection}
            {navSection}
          </>
        )}
      </Screen>

      <SpeedOverrideModal
        visible={speedModalOpen}
        overridePercent={robotStatus?.speedOverridePercent ?? 100}
        onClose={() => setSpeedModalOpen(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  statRow:  { flexDirection: "row", gap: spacing.md },
  statTile: { flex: 1, minWidth: 0 },

  // Wide: running program on a narrow left column, page selectors on the wider right.
  wideRow:      { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  wideLeftCol:  { width: 360, gap: spacing.md },
  wideRightCol: { flex: 1, gap: spacing.md },

  // Running program card
  runningCardWrapper: {
    borderRadius: radii.lg,
    ...shadows.soft,
  },
  runningCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  runningCardAlertBorder: {
    borderWidth: 2.5,
    borderRadius: radii.lg,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 1,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusText: { flex: 1, fontSize: 12, fontWeight: "600", letterSpacing: 0.4 },
  builtBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  builtBadgeAlert: { backgroundColor: "rgba(255,255,255,0.2)" },
  builtBadgeText: { fontSize: 10, fontWeight: "700", color: colors.accent, letterSpacing: 0.4 },
  alertStripe: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 1, gap: 7,
  },
  alertStripeText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.onAccent, lineHeight: 17 },

  runningCardBody: { padding: spacing.md + 2, gap: spacing.md },
  runningNameRow:  { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  runningName:     { flex: 1, fontSize: 17, fontWeight: "700", color: colors.text },
  speedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.background, borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  speedPillText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },

  stepRow:   { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  stepLabel: { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.6, paddingTop: 2 },
  stepText:  { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  progressRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  progressTrack: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
  progressFill:  { height: 6, borderRadius: 3 },
  percentText:   { width: 38, textAlign: "right", fontSize: 12, fontWeight: "600", color: colors.textMuted },

  buttonsRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn:  { flex: 1 },
});
