import {
  ActionButton } from "@/src/components/ui/ActionButton";
import { VisionResults } from "@/src/components/ui/VisionResults";
import { SpeedOverrideModal } from "@/src/components/ui/SpeedOverrideModal";
import { BuiltProgram,
  ProgramStatus,
  ProgramStep,
  ProgramSummary,
  ProgramVariableSnapshot,
  VisionResult, imageDataUri, isListVariable } from "@/src/models/robotModels";
import { useBuiltPrograms,
  useBuiltProgramsLoaded,
  useProgramSummaries,
  useRobotStatus,
  useSelectedRobot } from "@/src/providers/RobotProvider";
import { useActionPending } from "@/src/hooks/useActionPending";
import { robotClient } from "@/src/services/RobotConnectService";
import { router,
  Tabs,
  useFocusEffect,
  useLocalSearchParams } from "expo-router";
import { AlertTriangle,
  Box,
  Camera,
  ChevronRight,
  Cpu,
  Edit2,
  Gauge,
  Layers,
  Play,
  Square,
  Trash2,
  XCircle } from "lucide-react-native";
import { useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
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
// Only for the image variables, which are the one picture here that changes while you
// are looking at it. React Native's own Image blanks and then fades in on every source
// change, which on a board updating each ply reads as a flicker rather than a move.
import { Image as ExpoImage } from "expo-image";
import { appAlert } from "@/src/components/ui/AppAlert";
import { usePaneLayout, wide } from "@/src/components/ui/responsive";
import { RobotPathMap } from "@/src/components/ui/RobotPathMap";
import { colors, spacing, radii, InfoTip, PageHeader, PositionReadout, StatusPill } from "@/src/components/ui/kit";

// ── Status theming ────────────────────────────────────────────────────────────

type StatusTheme = { bg: string; text: string; bar: string };

// Note: Running/Finishing/Complete's brighter green bar (#22c55e), Complete's own
// bg/text shades (#dcfce7/#15803d), Stopping's orange (#fff7ed/#ea580c/#f97316) and
// Error's bar red (#ef4444) have no matching kit token (kit only defines one shade
// each of success/warning/danger) — left as literals rather than flattening seven
// distinct statuses onto three tones.
const STATUS_THEME: Record<ProgramStatus, StatusTheme> = {
  Ready:     { bg: colors.background,  text: colors.textMuted, bar: colors.textFaint },
  Starting:  { bg: colors.accentSoft,  text: colors.accent,    bar: colors.accentBright },
  Running:   { bg: colors.successSoft, text: colors.success,   bar: "#22c55e" },
  Finishing: { bg: colors.successSoft, text: colors.success,   bar: "#22c55e" },
  Stopping:  { bg: "#fff7ed",          text: "#ea580c",        bar: "#f97316" },
  Stopped:   { bg: colors.background,  text: colors.textMuted, bar: colors.textFaint },
  Complete:  { bg: "#dcfce7",          text: "#15803d",        bar: "#22c55e" },
  Error:     { bg: colors.dangerSoft,  text: colors.danger,    bar: "#ef4444" },
};

// ── Action buttons ────────────────────────────────────────────────────────────

type ActionBtn = { label: string; bg: string; onPress: () => void };

function getButtons(p: ProgramSummary, isBuilt: boolean): ActionBtn[] {
  const { name, status } = p;
  switch (status) {
    case "Ready":
      return [
        { label: "Start",    bg: colors.success, onPress: () => robotClient.startProgram(name) },
      ];
    case "Starting":
    case "Running":
    case "Finishing":
      return [
        { label: "Stop",     bg: colors.danger, onPress: () => robotClient.stopProgram(name) },
      ];
    case "Stopped":
      return [
        { label: "Continue", bg: colors.accent,        onPress: () => robotClient.startProgram(name) },
        { label: "Exit",     bg: colors.textSecondary, onPress: () => robotClient.abortProgram(name) },
      ];
    case "Complete":
      return [
        {
          label: "Run Again",
          bg: colors.success,
          onPress: () => { robotClient.runProgramAgain(name, isBuilt); },
        },
        { label: "Exit",     bg: colors.textSecondary, onPress: () => robotClient.abortProgram(name) },
      ];
    case "Error":
      return [
        { label: "Exit",     bg: colors.danger, onPress: () => robotClient.abortProgram(name) },
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
    currentPointName: "",
    start: false,
    stop: false,
    reset: false,
    abort: false,
  };
}

// ── Marquee text (auto-scrolling for long alert messages) ────────────────────

function MarqueeText({ text, style }: { text: string; style?: object }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth]           = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    anim.stopAnimation();
    if (textWidth <= containerWidth || containerWidth === 0) {
      anim.setValue(0);
      return;
    }
    const distance = textWidth - containerWidth + 24;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(anim, { toValue: -distance, duration: distance * 20, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [textWidth, containerWidth]);

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      <Animated.Text
        style={[style, { transform: [{ translateX: anim }] }]}
        onLayout={e => setTextWidth(e.nativeEvent.layout.width)}
        numberOfLines={1}
      >
        {text}
      </Animated.Text>
    </View>
  );
}



// ── Screen ────────────────────────────────────────────────────────────────────

export default function MonitorProgramScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const programName = name ? decodeURIComponent(name) : "";
  const programSummaries    = useProgramSummaries();
  const builtPrograms       = useBuiltPrograms();
  const builtProgramsLoaded = useBuiltProgramsLoaded();
  const robotStatus         = useRobotStatus();

  const robot   = useSelectedRobot();
  const s       = robot?.status;
  const isAstro = robot?.robotType === 'ASTRO';
  const allAxes = (isAstro ? ["X", "Y", "Z", "RZ"] : ["X", "Y", "Z", "RX", "RY", "RZ"]) as string[];
  const fmt    = (v?: number) => (v ?? 0).toFixed(1);

  const builtProgram  = builtPrograms.find((p) => p.name === programName) ?? null;
  const isBuilt       = builtProgram !== null;
  const isBackground  = builtProgram?.isBackground ?? false;
  const bgRunning     = (robotStatus.backgroundPrograms ?? []).find(b => b.name === programName) ?? null;

  // Toolpath of the CNC block currently executing — polled from the robot,
  // which resolves the origin anchor and runtime variables when the block
  // starts. Only shown while the block is actually running.
  const [cncToolpath, setCncToolpath] = useState<{ programName: string; paths: number[][]; holes: { x: number; y: number }[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = () => robotClient.getCncToolpath()
      .then(tp => { if (!cancelled) setCncToolpath(tp); })
      .catch(() => {});
    poll();
    const t = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const plannedCnc = useMemo(() => {
    if (!cncToolpath || cncToolpath.programName !== programName)
      return { paths: [] as { x: number; y: number }[][], holes: [] as { x: number; y: number }[] };
    const paths: { x: number; y: number }[][] = [];
    for (const flat of cncToolpath.paths ?? []) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
      if (pts.length >= 2) paths.push(pts);
    }
    return { paths, holes: cncToolpath.holes ?? [] };
  }, [cncToolpath, programName]);

  const liveProgram = programSummaries.find((p) => p.name === programName) ?? null;

  // For background programs, build a richer synthetic summary from the live bg status
  const bgSynth: ProgramSummary | null = isBackground && builtProgram
    ? { ...syntheticSummary(builtProgram), status: bgRunning ? 'Running' : 'Ready', currentStepDescription: bgRunning?.currentStep ?? '' }
    : null;

  const program: ProgramSummary | null =
    liveProgram ?? bgSynth ?? (builtProgram ? syntheticSummary(builtProgram) : null);

  // Guard against double-tap opening two builder screens
  const navigatingToEdit = useRef(false);
  useFocusEffect(useCallback(() => { navigatingToEdit.current = false; }, []));

  function handleEditPress() {
    if (navigatingToEdit.current) return;
    navigatingToEdit.current = true;
    router.push(`/program/builder?name=${encodeURIComponent(programName)}`);
  }

  // Arriving straight from the builder after a first save, the repository can
  // still predate the program we were asked to show. Pull it once rather than
  // sitting on "Program not found" until the next status poll corrects it.
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (program || !programName) return;
    setResolving(true);
    robotClient.getBuiltPrograms()
      .catch(() => {})
      .finally(() => setResolving(false));
  }, [programName, program]);

  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  // Three columns only on genuinely wide (desktop) screens — three side-by-side cards
  // need the room; below that the page stays a single scroll.
  const threeCol = usePaneLayout() === "desktop";

  // Spinner while an action is being applied — see useActionPending for when it
  // clears (status change, a new start, or the background-running flag flipping).
  const [pending, setPending] = useActionPending(program, !!bgRunning);
  const [deleting, setDeleting] = useState(false);

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
  const [visibleLogCount, setVisibleLogCount] = useState(50);

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
            // Keep only the most recent ~100k in memory so a long run doesn't
            // accumulate millions of entries in the app.
            setLogs((prev) => {
              const next = [...prev, ...result.logs];
              return next.length > 100_000 ? next.slice(next.length - 100_000) : next;
            });
            fetchedUntil = result.totalCount;
          }
        } catch {}
      };

      setLogs([]);
      setTotalLogCount(0);
      setVisibleLogCount(50);
      fetchedUntil = 0;

      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [programName])
  );


  // ── Vision snapshot polling ────────────────────────────────────────────────
  const [visionSnapshots, setVisionSnapshots] = useState<Record<string, string | null>>({});
  const [visionResults, setVisionResults]     = useState<Record<string, VisionResult | null>>({});

  const visionSteps: { id: string; name: string }[] = [];
  if (builtProgram) {
    const seen = new Set<string>();
    // Walk nested step lists too — a RunVision step can live inside a loop,
    // an if/else-if/else branch, or a CNC sub-program.
    const collect = (steps: ProgramStep[] | undefined) => {
      if (!steps) return;
      for (const step of steps) {
        if (step.type === 'RunVision' && step.visionProgramId && !seen.has(step.visionProgramId)) {
          seen.add(step.visionProgramId);
          visionSteps.push({ id: step.visionProgramId, name: step.visionProgramName ?? step.visionProgramId });
        }
        collect(step.loopSteps);
        collect(step.ifSteps);
        collect(step.elseSteps);
        collect(step.cncProgramSteps);
        step.elseIfBranches?.forEach(b => collect(b.steps));
      }
    };
    collect(builtProgram.steps);
  }
  const visionStepsRef = useRef<{ id: string; name: string }[]>(visionSteps);
  visionStepsRef.current = visionSteps;

  useFocusEffect(
    useCallback(() => {
      if (!programName) return;
      let cancelled = false;

      const fetchSnapshots = async () => {
        if (cancelled) return;
        for (const { id } of visionStepsRef.current) {
          // Prefer the live annotated debug frame (inspection overlays drawn) and
          // fall back to the snapshot captured at the end of the last RunVision step.
          const urls = [
            robotClient.visionAnnotatedUrl(id),
            robotClient.programVisionSnapshotUrl(id),
          ].filter((u): u is string => !!u);
          for (const url of urls) {
            try {
              const res = await fetch(url);
              if (res.status !== 200) continue; // 204 = no live frame yet, 404 = none
              const buffer = await res.arrayBuffer();
              if (buffer.byteLength === 0) continue;
              const bytes = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              const dataUri = `data:image/jpeg;base64,${btoa(binary)}`;
              if (!cancelled) setVisionSnapshots(prev => ({ ...prev, [id]: dataUri }));
              break; // newest frame for this program obtained
            } catch {}
          }
          // Structured result values — shown as text alongside the image.
          try {
            const r = await robotClient.getVisionResult(id);
            if (!cancelled) setVisionResults(prev => ({ ...prev, [id]: r }));
          } catch {}
        }
      };

      fetchSnapshots();
      const interval = setInterval(fetchSnapshots, 1500);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [programName])
  );

  // ── Variable snapshots ────────────────────────────────────────────────────
  const [varSnapshots, setVarSnapshots] = useState<ProgramVariableSnapshot[]>([]);
  // Image bytes by variable name, kept out of state until they change — see the poll.
  const [imageData, setImageData] = useState<Record<string, string>>({});
  const imageRevs = useRef<Record<string, number>>({});

  const hasMonitoredVars = (builtProgram?.variables ?? []).some(v => v.displayOnMonitor && !isListVariable(v) && !v.isImage);
  // Names rather than the variables themselves, and memoised on the joined string, so the
  // poll effect does not restart every render on a fresh array identity.
  const monitoredImages = useMemo(
    () => (builtProgram?.variables ?? []).filter(v => v.displayOnMonitor && v.isImage).map(v => v.name),
    [builtProgram?.variables],
  );
  const monitoredImageKey = monitoredImages.join(' ');

  useFocusEffect(
    useCallback(() => {
      if (!programName || (!hasMonitoredVars && !monitoredImageKey)) return;
      let cancelled = false;

      const fetch = () => {
        robotClient.getProgramVariables(programName)
          .then(({ variables, images }) => {
            if (cancelled) return;
            // Only overwrite with a non-empty snapshot. A stopped/finished program reports
            // no values, and we hold the last live ones rather than dropping back to the
            // declared initial values. Cleared on program change (see below).
            if (variables.length > 0) setVarSnapshots(variables);
            for (const img of images) {
              // Revision 0 is "declared, never written" — there is nothing to ask for.
              if (img.revision === 0) continue;
              // Inequality, not increase: a re-run gets a fresh executor whose counter
              // starts again, so the revision can legitimately go backwards and that
              // still means the picture changed.
              if (imageRevs.current[img.name] === img.revision) continue;
              imageRevs.current[img.name] = img.revision;
              robotClient.getProgramVariableImage(programName, img.name)
                .then(data => {
                  if (!cancelled && data) setImageData(prev => ({ ...prev, [img.name]: data }));
                })
                // Forget the revision so the next tick asks again rather than sitting on
                // a picture that never arrived.
                .catch(() => { delete imageRevs.current[img.name]; });
            }
          })
          .catch(() => {});
      };

      fetch();
      const interval = setInterval(fetch, 300);
      return () => { cancelled = true; clearInterval(interval); };
    }, [programName, hasMonitoredVars, monitoredImageKey])
  );

  // A different program's images and values are not this one's. Clearing on the name
  // rather than in the poll's cleanup keeps the last frame/values on screen when the page
  // merely loses focus, while still resetting when you open a different program.
  useEffect(() => {
    imageRevs.current = {};
    setImageData({});
    setVarSnapshots([]);
  }, [programName]);

  // The variable poll re-renders this page every 300ms. Built inline, the data URI would
  // be a new string on each of those renders for a picture that had not changed, and
  // handing an image a new source is how you get it to reload and flicker. imageData only
  // gets a new identity when a revision actually moved, so this holds still between moves.
  const imageUris = useMemo(
    () => Object.fromEntries(
      Object.entries(imageData).map(([name, data]) => [name, imageDataUri(data)]),
    ),
    [imageData],
  );

  // ── Persistent alert banner ────────────────────────────────────────────────
  const [pinnedError,   setPinnedError]   = useState('');
  const [pinnedWarning, setPinnedWarning] = useState('');
  const prevStatusRef = useRef<string | null>(null);

  // Latch error/warning the moment the server reports one
  useEffect(() => {
    if (program?.errorDescription) setPinnedError(program.errorDescription);
  }, [program?.errorDescription]);

  useEffect(() => {
    if (program?.warningDescription) setPinnedWarning(program.warningDescription);
  }, [program?.warningDescription]);

  // Auto-clear when the program is reset/re-started
  useEffect(() => {
    const curr = program?.status ?? null;
    const prev = prevStatusRef.current;
    prevStatusRef.current = curr;
    if (curr === 'Starting' || (curr === 'Ready' && prev !== null && prev !== 'Ready')) {
      setPinnedError('');
      setPinnedWarning('');
    }
  }, [program?.status]);

  // Progress bar — set directly so it always matches the text, no animation lag.
  // Lives above the early returns below so the hook order stays stable whether
  // or not the program has resolved yet.
  const pct =
    program && program.maxStepCount > 0
      ? Math.round((program.currentStepNumber / program.maxStepCount) * 100)
      : 0;
  const progressAnim = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    progressAnim.setValue(pct);
  }, [pct]);

  // ── Loading / not-found states ─────────────────────────────────────────────

  // Monitor always sits logically under the robot's program list, whichever
  // route pushed it (the tab index, a list row, or the builder's Run action).
  const monitorCrumbs = [
    { label: "Program", href: "/program" },
    { label: "Programs", href: "/(tabs)/program/robot-programs" },
    { label: programName },
  ];

  if (!program && (!builtProgramsLoaded || resolving)) {
    return (
      <View style={styles.root}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <PageHeader
          title={programName}
          subtitle="Loading from the controller…"
          crumbs={monitorCrumbs}
          backTo="/(tabs)/program/robot-programs"
        />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
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
        <PageHeader
          title={programName}
          subtitle="Not registered in the controller"
          crumbs={monitorCrumbs}
          backTo="/(tabs)/program/robot-programs"
        />
        <View style={styles.centerState}>
          <Box size={40} color={colors.borderStrong} />
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
  const buttons = isRunnable ? [] : getButtons(program, isBuilt);
  const showActions = buttons.length > 0 || isRunnable;

  // Alert banner derived values
  const hasAlert   = !!(pinnedError || pinnedWarning);
  const isError    = !!pinnedError;
  const alertColor = isError ? colors.danger : colors.warning;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Declared monitor scalars with their initial values. Shown before the program starts
  // (the controller reports no running values yet) so the VARIABLES section is always
  // present instead of popping in on first run. Plain (not memoised) so it can sit after
  // the early returns above without disturbing hook order.
  const declaredMonitorVars: ProgramVariableSnapshot[] = (builtProgram?.variables ?? [])
    .filter(v => v.displayOnMonitor && !isListVariable(v) && !v.isImage && !v.isString)
    // A computed variable has no initial value — its formula only runs on the robot — so
    // it shows a placeholder until the controller reports one.
    .map(v => ({ name: v.name, value: v.isComputed ? NaN : (v.value ?? 0), isBoolean: v.isBoolean === true }));
  // Live values once running; the declared initial values before then.
  const displayVars = varSnapshots.length > 0 ? varSnapshots : declaredMonitorVars;

  // On desktop each data column scrolls on its own inside a viewport-height row, so the
  // page itself never scrolls and the log fits on screen. On narrow, Column is a plain
  // View and everything stacks in the outer ScrollView exactly as before.
  const Column: any = threeCol ? ScrollView : View;
  const columnProps: any = threeCol
    ? { style: styles.wideCol, contentContainerStyle: styles.wideColContent, nestedScrollEnabled: true, showsVerticalScrollIndicator: false }
    : {};

  return (
    <View style={styles.root}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <PageHeader
        title={programName}
        subtitle={
          `${program.status}` +
          (program.maxStepCount > 0 ? ` · step ${program.currentStepNumber}/${program.maxStepCount} (${pct}%)` : "") +
          (isBackground ? " · background program" : isBuilt ? " · built here" : " · controller program")
        }
        crumbs={monitorCrumbs}
        backTo="/(tabs)/program/robot-programs"
        right={
          <StatusPill
            label={program.status}
            tone={
              program.status === "Error" ? "danger"
                : isActivelyRunning ? "success"
                : program.status === "Stopping" || program.status === "Stopped" ? "warning"
                : "neutral"
            }
            dot
          />
        }
      />

      {/* ── Persistent alert banner (fixed, always visible, no animation) ── */}
      {hasAlert && (
        <View style={[styles.alertBanner, { backgroundColor: alertColor }]}>
          {isError
            ? <XCircle size={16} color={colors.onAccent} />
            : <AlertTriangle size={16} color={colors.onAccent} />
          }
          <MarqueeText text={pinnedError || pinnedWarning} style={styles.alertBannerText} />
          <TouchableOpacity
            onPress={() => { setPinnedError(''); setPinnedWarning(''); }}
            style={styles.alertDismiss}
            activeOpacity={0.7}
          >
            {/* No token for a translucent-white icon tint; kept literal. */}
            <XCircle size={20} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={threeCol ? styles.wideScroll : wide.content} scrollEnabled={!threeCol} showsVerticalScrollIndicator={false}>
        {/* On desktop the sections split into three columns: name + actions, position,
            and the log. On narrower screens these wrapper Views are unstyled, so they
            simply stack and the single-column order is exactly as before. */}
        <View style={threeCol && styles.wideColumns}>
          <Column {...columnProps}>

        {/* ── Program card: identity (name, image, chips) + progress + actions ── */}
        <View style={styles.section}>
          {/* Status + built chip */}
          <View style={styles.heroTopRow}>
            <View style={[styles.statusBadge, { borderColor: theme.bar + "55" }]}>
              <View style={[styles.statusDot, { backgroundColor: theme.bar }]} />
              <Text style={[styles.statusBadgeText, { color: theme.text }]}>
                {program.status}
              </Text>
            </View>
            {isBackground ? (
              <StatusPill label="BACKGROUND" tone="success" icon={<Layers size={11} color={colors.success} />} />
            ) : isBuilt ? (
              <StatusPill label="BUILT" tone="accent" icon={<Cpu size={11} color={colors.accent} />} />
            ) : null}
          </View>

          {/* Image + name/description */}
          <View style={styles.heroIdentity}>
            <View style={[styles.imageWrap, { borderColor: theme.bar + "33" }]}>
              {image ? (
                <Image
                  source={{ uri: imageDataUri(image)! }}
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

          <View style={styles.progressHeader}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.sectionLabel}>PROGRESS</Text>
              <InfoTip text="Start, Stop and Continue act on the robot immediately." />
            </View>
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

          {/* ── Action buttons ── */}
          {isBackground ? (
            <View style={styles.inlineActions}>
              {bgRunning ? (
                <ActionButton
                  label="Stop"
                  icon={<Square size={14} color={colors.onAccent} fill={colors.onAccent} />}
                  loading={pending === "Stop"}
                  style={[styles.actionBtn, { backgroundColor: colors.danger }]}
                  textStyle={styles.actionBtnText}
                  onPress={() => { setPending("Stop"); robotClient.stopBackgroundProgram(programName).catch(() => {}); }}
                />
              ) : (
                <ActionButton
                  label="Start"
                  icon={<Play size={15} color={colors.onAccent} />}
                  loading={pending === "Start"}
                  style={[styles.actionBtn, { backgroundColor: colors.success }]}
                  textStyle={styles.actionBtnText}
                  onPress={() => { setPending("Start"); robotClient.startBackgroundProgram(programName).catch(() => {}); }}
                />
              )}
            </View>
          ) : showActions ? (
            <View style={styles.inlineActions}>
              {isRunnable ? (
                <ActionButton
                  label={anotherBuiltRunning ? "Another Program Running" : "Run Program"}
                  icon={<Play size={15} color={colors.onAccent} />}
                  loading={pending === "Run Program"}
                  disabled={anotherBuiltRunning}
                  style={[styles.actionBtn, { backgroundColor: anotherBuiltRunning ? colors.textFaint : colors.success }]}
                  textStyle={styles.actionBtnText}
                  onPress={() => { setPending("Run Program"); robotClient.executeBuiltProgram(programName).catch(() => {}); }}
                />
              ) : (
                buttons.map((btn) => {
                  const isStartAction = isBuilt && (btn.label === "Continue" || btn.label === "Run Again");
                  const blocked = isStartAction && anotherBuiltRunning;
                  return (
                    <ActionButton
                      key={btn.label}
                      label={blocked ? "Another Program Running" : btn.label}
                      loading={pending === btn.label}
                      disabled={blocked || (pending !== null && pending !== btn.label)}
                      style={[styles.actionBtn, { backgroundColor: blocked ? colors.textFaint : btn.bg }]}
                      textStyle={styles.actionBtnText}
                      onPress={() => { setPending(btn.label); btn.onPress(); }}
                    />
                  );
                })
              )}
            </View>
          ) : null}

          {/* Edit / Delete now sit inside the progress card, under the run controls. */}
          {isBuilt && (
            <View style={[styles.managementRow, { marginTop: 10 }]}>
              <ActionButton
                label="Edit"
                icon={<Edit2 size={15} color={colors.accent} />}
                style={styles.editBtn}
                textStyle={styles.editBtnText}
                spinnerColor={colors.accent}
                onPress={handleEditPress}
              />
              <ActionButton
                label="Delete"
                icon={<Trash2 size={15} color={isActivelyRunning ? "#fca5a5" : colors.danger} />}
                loading={deleting}
                disabled={isActivelyRunning}
                style={[styles.deleteBtn, isActivelyRunning && styles.deleteBtnDisabled]}
                textStyle={[styles.deleteBtnText, isActivelyRunning && styles.deleteBtnTextDisabled]}
                spinnerColor={colors.danger}
                onPress={() =>
                  appAlert(
                    "Delete Program",
                    `Delete "${programName}"? This cannot be undone.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: async () => {
                          setDeleting(true);
                          await robotClient.deleteBuiltProgram(programName).catch(() => {});
                          robotClient.getBuiltPrograms().catch(() => {});
                          router.back();
                        },
                      },
                    ]
                  )
                }
              />
            </View>
          )}
        </View>

        {/* ── Variables ── */}
        {displayVars.length > 0 && (
          <>
            <View style={styles.gapBand} />
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>VARIABLES</Text>
              <View style={styles.varGrid}>
                {displayVars.map(v => {
                  // A computed variable whose formula fails reports NaN, which JSON may
                  // carry as null or a string — coerce, and show it rather than crash.
                  const num   = typeof v.value === "number" ? v.value : Number(v.value ?? NaN);
                  const valid = Number.isFinite(num);
                  const display = !valid
                    ? (varSnapshots.length > 0 ? "NaN" : "—")
                    : v.isBoolean
                    ? (num !== 0 ? "True" : "False")
                    : Number.isInteger(num) ? String(num) : num.toFixed(4).replace(/\.?0+$/, '');
                  return (
                    <View key={v.name} style={styles.varCell}>
                      <Text style={styles.varCellName} numberOfLines={1}>${v.name}</Text>
                      <Text style={[styles.varCellValue, valid && v.isBoolean && { color: num !== 0 ? colors.success : colors.danger }]}
                        numberOfLines={1}>{display}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {/* ── Image variables ── */}
        {monitoredImages.length > 0 && (
          <>
            <View style={styles.gapBand} />
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>IMAGES</Text>
              {monitoredImages.map(name => {
                // The mime was read off the bytes when this was built: CaptureImage
                // writes JPEG, an HTTP inbound mapping writes whatever the server sent.
                const uri = imageUris[name];
                return (
                  <View key={name} style={styles.imgCell}>
                    <Text style={styles.varCellName} numberOfLines={1}>${name}</Text>
                    {uri ? (
                      <ExpoImage
                        source={{ uri }}
                        style={styles.varImage}
                        contentFit="contain"
                        // No crossfade. expo-image holds the frame it already has until
                        // the next one has decoded, so at 0 the board simply changes --
                        // no blank, no fade. Anything above 0 animates a board that is
                        // meant to be read, not watched.
                        transition={0}
                        // Every frame is a one-off: the picture arrives as bytes we
                        // already hold and is superseded on the next move. Caching them
                        // would just accumulate a copy of every ply of the game.
                        cachePolicy="none"
                      />
                    ) : (
                      // Declared but nothing written yet. The placeholder holds the same
                      // space the picture will take, so the page does not jump when the
                      // first frame lands.
                      <View style={styles.varImageEmpty}>
                        <Text style={styles.varImageEmptyText}>No image yet</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

          </Column>
          <Column {...columnProps}>

        {/* ── Position (foreground only) — speed override merged onto its foot ── */}
        {!isBackground && (
          <>
            <View style={styles.gapBand} />
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>POSITION</Text>

              {s && (
                <View style={{ marginBottom: 10 }}>
                  <RobotPathMap
                    x={s.x ?? 0}
                    y={s.y ?? 0}
                    targetX={s.targetX}
                    targetY={s.targetY}
                    moving={s.moving}
                    plannedPaths={plannedCnc.paths}
                    plannedHoles={plannedCnc.holes}
                  />
                </View>
              )}

              {/* One DRO with the live position and, beside each axis, the commanded target. */}
              <PositionReadout
                card={false}
                axes={[
                  { label: "X",  value: fmt(s?.x),  target: fmt(s?.targetX),  unit: "mm" },
                  { label: "Y",  value: fmt(s?.y),  target: fmt(s?.targetY),  unit: "mm" },
                  { label: "Z",  value: fmt(s?.z),  target: fmt(s?.targetZ),  unit: "mm" },
                  { label: "RZ", value: fmt(s?.rz), target: fmt(s?.targetRz), unit: "°"  },
                ]}
              />

              <View style={styles.posSubRow}>
                <Text style={styles.posSubLabel}>POINT</Text>
                <Text style={[styles.posSubValue, !program.currentPointName && styles.posSubPlaceholder]}>
                  {program.currentPointName || "—"}
                </Text>
              </View>

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

              <View style={styles.posSubRow}>
                <Text style={styles.posSubLabel}>OFFSET</Text>
                {allAxes.map((lbl) => {
                  const v = program[`currentOffset${lbl}` as keyof typeof program] as number | undefined;
                  return (
                    <Text key={lbl} style={[styles.posSubValue, v == null && styles.posSubPlaceholder]}>
                      {lbl} {v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—"}{"  "}
                    </Text>
                  );
                })}
              </View>

              <View style={styles.posSubRow}>
                <Text style={styles.posSubLabel}>TOOL</Text>
                {allAxes.map((lbl) => {
                  const v = program[`currentToolOffset${lbl}` as keyof typeof program] as number | undefined;
                  return (
                    <Text key={lbl} style={[styles.posSubValue, v == null && styles.posSubPlaceholder]}>
                      {lbl} {v != null ? (v >= 0 ? "+" : "") + v.toFixed(2) : "—"}{"  "}
                    </Text>
                  );
                })}
              </View>

              {/* Speed override, merged onto the foot of the position card. */}
              <TouchableOpacity style={styles.speedOverrideRow} onPress={() => setSpeedModalOpen(true)} activeOpacity={0.7}>
                {(() => {
                  const pct   = s?.speedOverridePercent ?? 100;
                  const color = pct > 100 ? colors.danger : pct < 50 ? colors.warning : colors.accent;
                  return (
                    <>
                      <Gauge size={16} color={color} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, flex: 1 }}>Speed Override</Text>
                      <Text style={{ fontSize: 16, fontWeight: "700", color }}>{Math.round(pct)}%</Text>
                      <ChevronRight size={16} color={colors.borderStrong} />
                    </>
                  );
                })()}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Background Programs (not shown when viewing a background program) ── */}
        {!isBackground && (robotStatus.backgroundPrograms ?? []).length > 0 && (
          <>
            <View style={styles.gapBand} />
            <View style={styles.section}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
                <Layers size={12} color={colors.success} />
                <Text style={[styles.sectionLabel, { color: colors.success }]}>BACKGROUND PROGRAMS</Text>
              </View>
              {(robotStatus.backgroundPrograms ?? []).map(bg => (
                <View key={bg.name} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{bg.name}</Text>
                    {!!bg.currentStep && (
                      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>{bg.currentStep}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Vision Snapshots ── */}
        {visionSteps.length > 0 && (
          <>
            <View style={styles.gapBand} />
            <View style={styles.section}>
              <View style={styles.snapshotHeader}>
                <Camera size={12} color={colors.textFaint} />
                <Text style={styles.sectionLabel}>VISION DEBUG FRAMES</Text>
              </View>
              {visionSteps.map(({ id, name }) => {
                const dataUri = visionSnapshots[id];
                return (
                  <View key={id} style={styles.snapshotItem}>
                    <Text style={styles.snapshotName}>{name}</Text>
                    {dataUri ? (
                      // Also a live frame, replaced on every poll, so the same no-fade
                      // treatment as the image variables above.
                      <ExpoImage
                        source={{ uri: dataUri }}
                        style={styles.snapshotImage}
                        contentFit="contain"
                        transition={0}
                        cachePolicy="none"
                      />
                    ) : (
                      <View style={styles.snapshotPlaceholder}>
                        <Camera size={24} color={colors.borderStrong} />
                        <Text style={styles.snapshotPlaceholderText}>
                          {isActivelyRunning ? 'Waiting for vision frame…' : 'No debug frame yet'}
                        </Text>
                      </View>
                    )}
                    <VisionResults result={visionResults[id] ?? null} />
                  </View>
                );
              })}
            </View>
          </>
        )}

          </Column>
          <View style={threeCol && styles.wideCol}>

        {/* ── Logs ── */}
        <View style={styles.gapBand} />
        <View style={[styles.logsSection, threeCol && styles.logsSectionFull]}>
          <View style={styles.logHeader}>
            <Text style={styles.logSectionLabel}>PROGRAM LOG</Text>
            <View style={styles.logHeaderRight}>
              <View style={styles.logCountBadge}>
                <Text style={styles.logCountText}>{totalLogCount} entries</Text>
              </View>
              <InfoTip text="Newest entry first, so the log never scrolls away from you while the program runs. Only the latest 50 are rendered — use Load 50 more to reach older ones." />
            </View>
          </View>
          <ScrollView
            style={threeCol ? styles.logsScrollFull : styles.logsScroll}
            showsVerticalScrollIndicator
            nestedScrollEnabled
          >
            {logs.length === 0 ? (
              <Text style={styles.logsEmpty}>No log entries yet.</Text>
            ) : (
              <>
                {[...logs].reverse().slice(0, visibleLogCount).map((entry, i) => {
                  const entryNumber = logs.length - i;
                  return (
                    <View key={entryNumber} style={[styles.logEntry, i % 2 === 0 && styles.logEntryAlt]}>
                      <Text style={styles.logIndex}>{String(entryNumber).padStart(4, " ")}</Text>
                      <Text style={styles.logText}>{entry}</Text>
                    </View>
                  );
                })}
                {visibleLogCount < logs.length && (
                  <TouchableOpacity
                    style={styles.loadMoreBtn}
                    onPress={() => setVisibleLogCount(c => c + 50)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.loadMoreText}>
                      Load 50 more  ({logs.length - visibleLogCount} remaining)
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </View>

          </View>
        </View>
        {!threeCol && <View style={{ height: 48 }} />}
      </ScrollView>

      <SpeedOverrideModal
        visible={speedModalOpen}
        overridePercent={s?.speedOverridePercent ?? 100}
        onClose={() => setSpeedModalOpen(false)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: colors.background },

  // ── Wide (desktop) three-column layout ──────────────────────────────────────
  // flexGrow makes the content fill the viewport height (the outer ScrollView has
  // scrolling disabled at this width), and the row + columns inherit that height so
  // each column scrolls on its own instead of the whole page scrolling.
  wideScroll:  { flexGrow: 1, paddingHorizontal: 10, paddingTop: 10 },
  // stretch (not flex-start) so every column takes the row's full height — that is what
  // lets the log card in the right column fill the space instead of sitting in a short box.
  wideColumns: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    width: "100%",
  },
  wideCol: { flex: 1 },
  // Scroll content for the left/middle data columns (ScrollViews on desktop).
  wideColContent: { paddingBottom: spacing.lg },

  // Speed override, merged onto the foot of the position card with a divider above it.
  speedOverrideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  scroll: { flex: 1 },

  // ── Center states (loading / not-found) ───────────────────────────────────
  centerState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: spacing.md, padding: spacing.xxl,
  },
  centerTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
  centerSub:   { fontSize: 13, color: colors.textFaint, textAlign: "center", lineHeight: 20 },

  // ── Hero ───────────────────────────────────────────────────────────────────
  heroTopRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row", alignItems: "center",
    gap: 7, borderWidth: 1, borderRadius: radii.xl,
    paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  statusDot:       { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },

  heroIdentity: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  imageWrap: {
    width: 72, height: 72, borderRadius: radii.lg,
    overflow: "hidden", borderWidth: 1.5,
  },
  image:        { width: 72, height: 72 },
  imageFallback: {
    width: 72, height: 72,
    justifyContent: "center", alignItems: "center",
  },
  heroInfo:  { flex: 1, gap: spacing.xs },
  heroName:  { fontSize: 20, fontWeight: "700", color: colors.text, lineHeight: 26 },
  heroDesc:  { fontSize: 13, color: colors.textMuted, lineHeight: 18 },

  // ── Persistent alert banner ────────────────────────────────────────────────
  alertBanner: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: spacing.md,
    gap: 10,
  },
  alertBannerText: {
    flex: 1, fontSize: 13, fontWeight: "700", color: colors.onAccent,
    lineHeight: 18,
  },
  alertDismiss: {
    paddingLeft: spacing.xs, flexShrink: 0,
  },

  // ── Generic section (white bg) ─────────────────────────────────────────────
  section: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20, paddingVertical: 18,
    gap: spacing.md,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: colors.textFaint,
    letterSpacing: 1, textTransform: "uppercase",
  },

  // ── Gap band (gray strip between major sections) ───────────────────────────
  gapBand: { height: 10, backgroundColor: colors.background },

  // ── Progress ───────────────────────────────────────────────────────────────
  progressHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  progressLabelRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
  },
  progressMeta:     { fontSize: 13, color: colors.textFaint },
  progressMetaBold: { fontWeight: "700" },
  progressMetaMuted:{},
  progressTrack: {
    height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: "hidden",
  },
  progressFill:  { height: 10, borderRadius: 5 },
  progressPct:   { fontSize: 13, fontWeight: "700", textAlign: "right" },

  stepDescRow: {
    borderLeftWidth: 3, borderRadius: 2,
    paddingLeft: 10, paddingVertical: 6,
    backgroundColor: colors.surfaceMuted, gap: 3,
  },
  stepDescLabel: {
    fontSize: 9, fontWeight: "700", color: colors.textFaint,
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  // Between colors.text and colors.textSecondary with no exact token; left literal.
  stepDescText:        { fontSize: 14, color: "#1f2937", lineHeight: 20 },
  stepDescPlaceholder: { color: colors.borderStrong },

  // ── Inline actions (inside progress section) ──────────────────────────────
  inlineActions: {
    flexDirection: "row", gap: 10,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", paddingVertical: 13,
    borderRadius: 11, alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: "700" },

  // ── Variables ─────────────────────────────────────────────────────────────
  varGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: 6,
  },
  varCell: {
    minWidth: 120, flex: 1,
    backgroundColor: colors.surfaceMuted, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    gap: 3,
  },
  varCellName:  { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  varCellValue: { fontSize: 18, fontWeight: "700", color: colors.text },

  imgCell: { marginTop: spacing.sm, gap: spacing.xs },
  // Square, because the thing most likely to end up here is a camera frame or a board
  // and neither wants cropping. contentFit="contain" does the rest.
  varImage: {
    width: "100%", aspectRatio: 1, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted,
  },
  varImageEmpty: {
    width: "100%", aspectRatio: 1, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted,
    alignItems: "center", justifyContent: "center",
  },
  varImageEmptyText: { fontSize: 12, color: colors.textFaint },

  // ── Management (edit / delete) ─────────────────────────────────────────────
  managementRow: { flexDirection: "row", gap: 10 },
  editBtn: {
    flex: 1, flexDirection: "row", paddingVertical: spacing.md,
    borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: colors.accentFaded, backgroundColor: colors.accentSoft,
  },
  editBtnText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  deleteBtn: {
    flex: 1, flexDirection: "row", paddingVertical: spacing.md,
    borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 6,
    // No token for this lighter danger border shade (danger/dangerSoft are the only
    // danger tokens); left literal.
    borderWidth: 1.5, borderColor: "#fca5a5", backgroundColor: colors.dangerSoft,
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteBtnText:         { color: colors.danger, fontSize: 14, fontWeight: "700" },
  deleteBtnTextDisabled: { color: "#fca5a5" },

  // ── Position ───────────────────────────────────────────────────────────────
  posSubRow: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: spacing.xs, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  posSubLabel: {
    fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5,
  },
  posSubValue: {
    fontSize: 12, fontWeight: "600", color: colors.textSecondary,
  },
  posSubPlaceholder: { color: colors.borderStrong },
  posSubDot: { fontSize: 10, color: colors.borderStrong },

  // ── Vision Snapshots ───────────────────────────────────────────────────────
  snapshotHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  snapshotItem: { gap: spacing.sm },
  snapshotName: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  snapshotImage: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#000' },
  snapshotPlaceholder: {
    height: 120, borderRadius: 8,
    backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  snapshotPlaceholderText: { fontSize: 12, color: colors.textFaint },

  // ── Logs ───────────────────────────────────────────────────────────────────
  // Deliberate dark terminal look for the log console — distinct from the rest of the
  // page and outside the light-surface token palette, so these slate shades and the
  // translucent-white overlays below are left as literals rather than forced onto
  // colors.* tokens meant for the light UI.
  logsSection: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16,
    gap: 10,
  },
  logHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  logHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logSectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#475569",
    letterSpacing: 1, textTransform: "uppercase",
  },
  logCountBadge: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 10,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  logCountText: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  logsScroll: {
    height: 260, borderRadius: 8,
  },
  // Desktop three-column: the log card and its scroll fill the column height (which the
  // stretched row gives them) instead of the fixed 260 box used in the single column.
  logsSectionFull: { flex: 1 },
  logsScrollFull:  { flex: 1, borderRadius: 8 },
  logsEmpty:    { color: "#64748b", fontSize: 13, fontStyle: "italic" },
  loadMoreBtn:  { paddingVertical: 10, alignItems: "center" },
  loadMoreText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  logEntry:     { flexDirection: "row", gap: 10, paddingVertical: 3, paddingHorizontal: 2 },
  logEntryAlt:  { backgroundColor: "rgba(255,255,255,0.04)" },
  logIndex: {
    fontSize: 11, color: "#475569",
    fontVariant: ["tabular-nums"], lineHeight: 18,
  },
  logText: { flex: 1, fontSize: 12, color: "#cbd5e1", lineHeight: 18 },
});
