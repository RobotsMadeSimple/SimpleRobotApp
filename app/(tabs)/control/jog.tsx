import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { Cell3DView } from "@/src/components/ui/cell3d/Cell3DView";
import type { Cell3DOptions } from "@/src/components/ui/cell3d/bridge";
import { ArrayCellSheet } from "@/src/components/space/ArrayCellSheet";
import { PointActionSheet, usePointPick } from "@/src/components/space/PointActionSheet";
import { useSpaceSets } from "@/src/components/space/space3d";
import JogPad from "@/src/components/ui/JogPad";
import { SpeedSlider } from "@/src/components/ui/jog/SpeedSlider";
import {
  Button,
  buttonTextColor,
  Card,
  Chip,
  ChipGroup,
  colors,
  Divider,
  EmptyState,
  FormRow,
  InfoTip,
  Input,
  PageHeader,
  PositionReadout,
  RadioRow,
  type ReadoutAxis,
  radii,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { useIsShort, useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { COMPACT_RAIL_WIDTH } from "@/src/components/ui/NavRail";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Point } from "@/src/models/robotModels";
import { useLocals, usePoints, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { teachHandoff } from "@/src/services/teachHandoff";
import { router, Tabs, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  Box,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  Gauge,
  Grid2X2,
  MapPin,
  MousePointerClick,
  Move3d,
  Navigation,
  OctagonX,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Wrench,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Shared key: the last jog speed the user picked (continuous only), so Move-to-point / DRO moves
// here and on the Points page default to it. Step modes (0.1/1/10 mm) aren't move speeds → Slow.
export const LAST_MOVE_SPEED_KEY = "lastMoveSpeed";
/** Which pane the desktop jog layout shows on the right ("3d" | "points"), and whether the phone
 *  layout shows the 3D strip — remembered across visits. */
const JOG_3D_KEY = "jog.view3d";
/** The jog 3D views can show the saved grids / stacks (the Arrays chip, off by default); a tapped cell opens its move sheet. */
const WIDE_3D_OPTIONS: Cell3DOptions = { sets: false, toggles: ["points", "locals", "sets", "trail"] };
const NARROW_3D_OPTIONS: Cell3DOptions = { controls: "full", sets: false, toggles: ["sets"] };
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";

// ── Layout breakpoints (measured on the content area, not the window) ─────────
// The jog pad sizes itself to ~405px, so the column that hosts it is fixed at
// PAD_COL_WIDTH and the config / points columns take the remaining width. The
// thresholds below are the narrowest widths at which each arrangement still has
// real gutters rather than a squeeze.
const PAD_COL_WIDTH = 440;
const THREE_COL_MIN = 1140; // config | pad + STOP/Teach | points
const TWO_COL_MIN    = 810; // config (+ points) | pad + STOP/Teach
/** Rough NavRail width, used only to seed the layout before onLayout measures. */
const RAIL_ESTIMATE = 216;
/** Short layout: vertical padding of the row (top + bottom) and the gap above STOP/Teach. */
const SHORT_PAD_CHROME = 8 + 8 + 8;

// ── Picker modal ──────────────────────────────────────────────────────────────
// Generalized beyond a flat string list so mode/speed pickers can carry a
// one-line description per row and an InfoTip beside the modal title (the
// narrow grid tiles relocate their InfoTips here — see JOG_MODE_INFO/SPEED_INFO).
type PickerOption = { value: string; label?: string; description?: string };

function normalizePickerOption(opt: string | PickerOption): PickerOption {
  return typeof opt === "string" ? { value: opt } : opt;
}

function PickerModal({
  visible,
  title,
  titleInfo,
  options,
  value,
  onSelect,
  onClose,
  footnote,
  viewLabel,
  viewRoute,
}: {
  visible: boolean;
  title: string;
  /** Shown as an InfoTip (ⓘ) beside the title — relocated field-level InfoTips land here. */
  titleInfo?: string;
  options: (string | PickerOption)[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  /** Small note below the option list (e.g. a mode-dependent caveat). */
  footnote?: string;
  viewLabel?: string;
  viewRoute?: string;
}) {
  const normalized = options.map(normalizePickerOption);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={styles.pickerCard} onPress={() => {}} activeOpacity={1}>
          <View style={styles.dialogHeader}>
            <View style={styles.dialogTitleRow}>
              <Text style={styles.dialogTitle}>{title}</Text>
              {titleInfo && <InfoTip text={titleInfo} />}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {normalized.map((opt, i) => {
              const active = opt.value === value;
              const isLast = i === normalized.length - 1;
              return (
                <View key={opt.value}>
                  <RadioRow
                    title={opt.label ?? opt.value}
                    subtitle={opt.description}
                    selected={active}
                    onPress={() => { onSelect(opt.value); onClose(); }}
                  />
                  {!isLast && <Divider />}
                </View>
              );
            })}
          </ScrollView>

          {footnote && <Text style={styles.pickerFootnote}>{footnote}</Text>}

          {viewLabel && viewRoute && (
            <TouchableOpacity
              style={styles.pickerViewLink}
              onPress={() => { onClose(); router.push(viewRoute as any); }}
              activeOpacity={0.7}
            >
              <Text style={styles.pickerViewLinkText}>{viewLabel}</Text>
              <ArrowRight size={14} color={colors.accent} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Selector ──────────────────────────────────────────────────────────────────
function Selector({
  label,
  value,
  options,
  onSelect,
  icon,
  viewLabel,
  viewRoute,
  mutedValue,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
  icon?: React.ReactNode;
  viewLabel?: string;
  viewRoute?: string;
  /** Dim the value text — set by call sites for an unset "None" value. */
  mutedValue?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.selectorWrap}>
      <AnimatedPressable style={styles.selectorBtn} onPress={() => setOpen(true)}>
        {icon && <View style={styles.selectorIcon}>{icon}</View>}
        <View style={styles.selectorTextStack}>
          <Text style={styles.selectorLabel}>{label}</Text>
          <View style={styles.selectorValueRow}>
            <Text style={[styles.selectorValue, mutedValue && styles.selectorValueMuted]}>{value}</Text>
            <ChevronDown size={13} color={colors.textFaint} />
          </View>
        </View>
      </AnimatedPressable>

      <PickerModal
        visible={open}
        title={label}
        options={options}
        value={value}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
        viewLabel={viewLabel}
        viewRoute={viewRoute}
      />
    </View>
  );
}

// ── Grid selector tile (narrow layout) ─────────────────────────────────────────
// Compact 2×2 replacement for the config card's SegmentedControl/ChipGroup/
// Selector row on narrow screens: caption + current value + chevron, tap opens
// the same PickerModal machinery as the LOCAL/TOOL Selector above.
function GridSelectorTile({
  label,
  icon,
  value,
  options,
  onSelect,
  titleInfo,
  footnote,
  viewLabel,
  viewRoute,
  mutedValue,
  disabled,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  options: (string | PickerOption)[];
  onSelect: (v: string) => void;
  titleInfo?: string;
  footnote?: string;
  viewLabel?: string;
  viewRoute?: string;
  /** Dim the value text — set by call sites for an unset "None" value. */
  mutedValue?: boolean;
  /** Non-interactive (e.g. CONTROL in Joint mode, where it doesn't apply). */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card onPress={disabled ? undefined : () => setOpen(true)} style={[styles.gridTile, disabled && styles.gridTileDisabled]}>
        {icon && <View style={styles.gridTileIcon}>{icon}</View>}
        <View style={styles.gridTileText}>
          <Text style={styles.selectorLabel}>{label}</Text>
          <View style={styles.gridTileValueRow}>
            <Text style={[styles.gridTileValue, mutedValue && styles.gridTileValueMuted]} numberOfLines={1}>{value}</Text>
            <ChevronDown size={14} color={colors.textFaint} />
          </View>
        </View>
      </Card>

      <PickerModal
        visible={open}
        title={label}
        titleInfo={titleInfo}
        options={options}
        value={value}
        onSelect={onSelect}
        onClose={() => setOpen(false)}
        footnote={footnote}
        viewLabel={viewLabel}
        viewRoute={viewRoute}
      />
    </>
  );
}

// Straight-line (translational) distance in mm from the robot's current position to a point.
function distanceMm(p: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }): number {
  return Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
}

// ── Teach modal ───────────────────────────────────────────────────────────────
/** First unused "Point N" name, so a new teach is one tap away. */
function suggestPointName(points: Point[]): string {
  const taken = new Set(points.map((p) => p.name));
  let i = points.length + 1;
  while (taken.has(`Point ${i}`)) i++;
  return `Point ${i}`;
}

function TeachModal({ onClose }: { onClose: () => void }) {
  const points = usePoints();
  const status = useRobotStatus();
  // Default to teaching a NEW point (name pre-filled); "Select Existing" switches to the list.
  const [mode, setMode] = useState<"list" | "new">("new");
  const [newName, setNewName] = useState(() => suggestPointName(points));
  const [search, setSearch] = useState("");

  const filtered = points.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function teachPoint(name: string) {
    robotClient.sendCommand("TeachPoint", { name });
    onClose();
  }

  function teachNew() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    robotClient.sendCommand("TeachPoint", { name: trimmed });
    onClose();
  }

  return (
    <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
      <TouchableOpacity style={styles.dialog} onPress={() => {}} activeOpacity={1}>
        <View style={styles.dialogHeader}>
          <View style={styles.dialogTitleRow}>
            <Text style={styles.dialogTitle}>
              {mode === "list" ? "Overwrite Point" : "New Point"}
            </Text>
            {mode === "list" && (
              <InfoTip text="Tap a saved point to overwrite it with the robot's current position — the point's stored coordinates are replaced and this cannot be undone. Use New Point to save the current position under a new name instead." />
            )}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
            <X size={18} color={colors.textFaint} />
          </TouchableOpacity>
        </View>

        {mode === "list" ? (
          <>
            <View style={styles.searchRow}>
              <Search size={15} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search points…"
                placeholderTextColor={colors.textFaint}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={styles.pointList} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 && (
                <Text style={styles.emptyText}>
                  {points.length === 0 ? "No points saved yet" : "No matches"}
                </Text>
              )}
              {filtered.map((p, i) => (
                <View key={p.name}>
                  <TouchableOpacity style={styles.pointRow} onPress={() => teachPoint(p.name)} activeOpacity={0.7}>
                    <Text style={styles.pointName}>{p.name}</Text>
                    <View style={styles.pointMeta}>
                      <Text style={styles.pointCoords}>
                        {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                      </Text>
                      <Text style={styles.pointDistance}>{distanceMm(p, status).toFixed(1)} mm away</Text>
                    </View>
                  </TouchableOpacity>
                  {i < filtered.length - 1 && <Divider />}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.newPointButton}
              onPress={() => { setNewName(suggestPointName(points)); setMode("new"); }}
              activeOpacity={0.7}
            >
              <Plus size={16} color={colors.accent} />
              <Text style={styles.newPointText}>New Point</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <FormRow label="Point name" style={styles.newPointForm}>
              <Input
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. PickUp1"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={teachNew}
              />
            </FormRow>
            <View style={styles.modalActions}>
              <Button label="Select Existing" variant="secondary" style={{ flex: 1 }} onPress={() => setMode("list")} />
              <Button
                label="Teach Here"
                variant="primary"
                icon={<MousePointerClick size={15} color={buttonTextColor("primary")} />}
                disabled={!newName.trim()}
                style={{ flex: 1 }}
                onPress={teachNew}
              />
            </View>
          </>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Jog mode / speed copy (narrow grid tiles) ──────────────────────────────────
// Same wording as the InfoTips that sit above the SegmentedControl/ChipGroup in
// the wide config card — relocated verbatim into the modal title's InfoTip so
// none of the explanatory text is lost, plus a distilled one-line description
// per row and a footnote for the Tool-mode step caveat.
const JOG_MODE_INFO =
  "XYZ jogs along the room/local axes. Tool jogs along the tool tip's own axes " +
  "(e.g. it always plunges straight into the tip). Joint moves a single robot " +
  "joint at a time.";
const SPEED_INFO =
  "Slow/Normal/Fast jog continuously while held, at the speeds set on Robot › " +
  "Configure. The 0.1/1/10 mm chips take one precise step per tap in XYZ and " +
  "Joint mode — in Tool mode they instead jog continuously at a very slow speed.";
const SPEED_FOOTNOTE =
  "In Tool mode, the 0.1/1/10 mm steps jog continuously at a very slow speed instead of stepping.";

const jogModeTileOptions: PickerOption[] = [
  { value: "XYZ",   description: "Room/local axes" },
  { value: "Tool",  description: "Tool-tip's own axes" },
  { value: "Joint", description: "Single joint at a time" },
];

const speedTileOptions: PickerOption[] = [
  { value: "0.1mm",  description: "One precise step per tap" },
  { value: "1mm",    description: "One precise step per tap" },
  { value: "10mm",   description: "One precise step per tap" },
  { value: "Slow",   description: "Jogs continuously while held" },
  { value: "Normal", description: "Jogs continuously while held" },
  { value: "Fast",   description: "Jogs continuously while held" },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function JogScreen() {
  const [selectedSpeed, setSelectedSpeed] = useState("Slow");
  const [mode, setMode]                 = useState("XYZ");
  const [padStyle, setPadStyle]         = useState<"buttons" | "joystick">("buttons");
  const [teachOpen, setTeachOpen]       = useState(false);
  const [jogSpeeds, setJogSpeeds]       = useState<{ Slow: number; Normal: number; Fast: number } | undefined>(undefined);

  // Program-point teach mode: opened from the builder with the point to teach. The header shows
  // "Teaching [name]" and the Teach button captures the live base-frame pose, hands it back to the
  // builder (teachHandoff) and returns, instead of saving to the global point library.
  const { teachPointId, teachPointName, returnTo } =
    useLocalSearchParams<{ teachPointId?: string; teachPointName?: string; returnTo?: string }>();
  const teaching = !!teachPointName;

  const tools      = useTools();
  const locals     = useLocals();
  const points     = usePoints();
  const status     = useRobotStatus();
  const activeTool = status.activeTool;
  const wideContent = useWideContent();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWide = useIsWide();
  const isShort = useIsShort();
  const insets = useSafeAreaInsets();

  // Lay out against the real content width (the NavRail eats ~216px of the
  // window on wide screens), seeded from the window so the first frame is right.
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const paneWidth = measuredWidth || (isWide ? windowWidth - (isShort ? COMPACT_RAIL_WIDTH : RAIL_ESTIMATE) : windowWidth);
  const threeColumn = paneWidth >= THREE_COL_MIN;
  const twoColumn   = !threeColumn && paneWidth >= TWO_COL_MIN;
  const wideLayout  = threeColumn || twoColumn;

  // Narrow pad sizing: the pad's height budget is the window minus the (fixed) header, config
  // block, footer and the bottom tab bar — all measured/known independently, so the pad never
  // feeds back into its own size. Window height is used (reliable) rather than the container,
  // whose flex height can mirror the pad on web.
  const TAB_BAR_RESERVE = 70;
  const [headerH, setHeaderH] = useState(0);
  const [topH,    setTopH]    = useState(0);
  const [footH,   setFootH]   = useState(0);
  const padMaxH = headerH && topH && footH
    ? Math.max(120, windowHeight - headerH - topH - footH - TAB_BAR_RESERVE)
    : undefined;

  // Short (landscape phone): config scrolls on the left, the pad + STOP/Teach column sits on the
  // right and never scrolls. The pad's height budget is the page minus the header, the STOP/Teach
  // row and the column's padding; its width budget is the column (expressed as the equivalent
  // 3-row height, since the pads size from maxHeight).
  const shortPadColW = Math.round(Math.min(400, Math.max(280, paneWidth * 0.48)));
  const shortPadMaxH = headerH && footH
    ? Math.max(120, Math.min(
        (measuredHeight || windowHeight) - headerH - footH - SHORT_PAD_CHROME - insets.bottom,
        3 * ((shortPadColW - 3 * 8) / 4) + 2 * 8,
      ))
    : undefined;

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setMeasuredWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    setMeasuredHeight((prev) => (Math.abs(prev - h) > 1 ? h : prev));
  }, []);

  const [tool, setToolLocal] = useState(activeTool || "None");

  function setTool(name: string) {
    setToolLocal(name);
    robotClient.setActiveTool(name);
  }

  const local = status.activeLocal || "None";
  const localOptions = ["None", ...locals.map(l => l.name)];

  function setLocal(name: string) {
    robotClient.setActiveLocal(name === "None" ? "" : name);
  }

  const s = status;

  const fmt          = (v?: number) => (v ?? 0).toFixed(1);
  const speedOptions = ["0.1mm", "1mm", "10mm", "Slow", "Normal", "Fast"];

  const jogModes = [
    { label: "XYZ",   value: "XYZ",   icon: (c: string, s: number) => <Move3d size={s} color={c} /> },
    { label: "Tool",  value: "Tool",  icon: (c: string, s: number) => <Wrench size={s} color={c} /> },
    { label: "Joint", value: "Joint", icon: (c: string, s: number) => <RotateCw size={s} color={c} /> },
  ];

  // Speed slider stops: fine step → fast continuous for the button pad; only the continuous
  // speeds for the analog joystick (discrete steps don't apply to it).
  const speedSliderOptions = (padStyle === "joystick" ? ["Slow", "Normal", "Fast"] : speedOptions)
    .map(s => ({ key: s, label: s }));

  // A step speed left selected when switching to the joystick would be meaningless.
  useEffect(() => {
    if (padStyle === "joystick" && selectedSpeed.includes("mm")) setSelectedSpeed("Normal");
  }, [padStyle, selectedSpeed]);

  // Reload jog speeds whenever this screen comes into focus (picks up config changes immediately)
  useFocusEffect(useCallback(() => {
    robotClient.getRobotConfig()
      .then(cfg => setJogSpeeds({ Slow: cfg.jogSlowSpeed, Normal: cfg.jogNormalSpeed, Fast: cfg.jogFastSpeed }))
      .catch(() => {});
  }, []));

  // Keep local selector in sync when active tool changes externally
  useEffect(() => {
    setToolLocal(activeTool || "None");
  }, [activeTool]);

  const coords = mode === "Joint"
    ? [
        { label: "J1", value: fmt(s?.joint1Angle), unit: "°"  },
        { label: "J2", value: fmt(s?.joint2X),     unit: "mm" },
        { label: "J3", value: fmt(s?.joint2Z),     unit: "mm" },
        { label: "J4", value: fmt(s?.joint4Angle), unit: "°"  },
      ]
    : [
        // Local-frame position — tracks the selected local (equals world when none)
        { label: "X",  value: fmt(s?.localX),  unit: "mm" },
        { label: "Y",  value: fmt(s?.localY),  unit: "mm" },
        { label: "Z",  value: fmt(s?.localZ),  unit: "mm" },
        { label: "RZ", value: fmt(s?.localRZ), unit: "°"  },
      ];

  // ── Move-to-point (mechanics mirrored from Space › Points) ──────────────────
  const [pointSearch, setPointSearch]     = useState("");
  const [pointsOpen, setPointsOpen]       = useState(false);

  // ── Live 3D view (right pane on desktop, collapsible in two-column, toggle on narrow) ──
  const [sidePane, setSidePane] = useState<"3d" | "points">("3d");
  const [show3d, setShow3d]     = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(JOG_3D_KEY).then(raw => {
      if (!raw) return;
      const v = JSON.parse(raw);
      if (v.sidePane === "3d" || v.sidePane === "points") setSidePane(v.sidePane);
      if (typeof v.show3d === "boolean") setShow3d(v.show3d);
    }).catch(() => {});
  }, []);
  const save3d = (patch: Partial<{ sidePane: "3d" | "points"; show3d: boolean }>) => {
    const next = { sidePane, show3d, ...patch };
    if (patch.sidePane) setSidePane(patch.sidePane);
    if (patch.show3d !== undefined) setShow3d(patch.show3d);
    AsyncStorage.setItem(JOG_3D_KEY, JSON.stringify(next)).catch(() => {});
  };
  // A point tapped in the 3D view opens the shared point action sheet (by stable id).
  const pick3d = usePointPick();
  const spaceSets3d = useSpaceSets();
  const [moveTarget, setMoveTarget]       = useState<Point | null>(null);
  const [moveSpeed, setMoveSpeed]         = useState<"Slow" | "Normal" | "Fast">("Normal");

  // Move-to-point / DRO-to-position speed tracks the current jog speed selection: the same
  // Slow/Normal/Fast when a continuous speed is picked, or Slow when an incremental step
  // (0.1/1/10 mm) is selected. Persisted so the Points page can default to it too.
  useEffect(() => {
    const effective: "Slow" | "Normal" | "Fast" = selectedSpeed.includes("mm")
      ? "Slow"
      : (selectedSpeed as "Slow" | "Normal" | "Fast");
    setMoveSpeed(effective);
    AsyncStorage.setItem(LAST_MOVE_SPEED_KEY, effective).catch(() => {});
  }, [selectedSpeed]);
  const [movingFromPage, setMovingFromPage] = useState(false);
  const [movingToName, setMovingToName]   = useState<string | null>(null);
  const [alreadyHere, setAlreadyHere]     = useState<string | null>(null);
  /** Move overlay wording: axis moves aren't "to a point". */
  const [movingIsAxis, setMovingIsAxis]   = useState(false);

  const AT_THRESHOLD = 0.5;

  function isAtPoint(p: Point) {
    return (
      Math.abs((s?.x ?? 0) - p.x) < AT_THRESHOLD &&
      Math.abs((s?.y ?? 0) - p.y) < AT_THRESHOLD &&
      Math.abs((s?.z ?? 0) - p.z) < AT_THRESHOLD
    );
  }

  // Clear the "moving" overlay as soon as the robot reports it stopped.
  useEffect(() => {
    if (movingFromPage && !status.moving) {
      setMovingFromPage(false);
      setMovingToName(null);
      setMovingIsAxis(false);
    }
  }, [status.moving]);

  /** Same commands Space › Points sends: MoveL / MoveJ by point name + speed. */
  function moveToPoint(command: "MoveL" | "MoveJ") {
    const p = moveTarget;
    if (!p) return;
    if (isAtPoint(p)) { setMoveTarget(null); setAlreadyHere(p.name); return; }
    setMovingToName(p.name);
    robotClient.sendCommand(command, { name: p.name, speed: jogSpeeds?.[moveSpeed] });
    setMoveTarget(null);
    setMovingFromPage(true);
  }

  const filteredPoints = points.filter((p) =>
    p.name.toLowerCase().includes(pointSearch.trim().toLowerCase())
  );

  // ── Point actions (tap a point row) ─────────────────────────────────────────
  // A tap opens an actions dialog — Move To / Edit Position / Teach Here —
  // instead of going straight to the move confirm. Each action closes this
  // dialog before opening its own stage, so two Modals are never on screen at
  // once (same sequencing the rest of the screen uses).
  const [actionTarget, setActionTarget] = useState<Point | null>(null);
  const [editTarget, setEditTarget]     = useState<Point | null>(null);
  const [editDraft, setEditDraft]       = useState({ x: "", y: "", z: "", rz: "", description: "" });
  const [teachTarget, setTeachTarget]   = useState<Point | null>(null);

  const editFields = ["x", "y", "z", "rz"] as const;
  const editValid  = editFields.every((f) => {
    const raw = editDraft[f].trim();
    return raw !== "" && Number.isFinite(Number(raw));
  });

  function openEditPoint(p: Point) {
    setEditDraft({
      x:  p.x.toString(),
      y:  p.y.toString(),
      z:  p.z.toString(),
      rz: p.rz.toString(),
      description: p.description ?? "",
    });
    setActionTarget(null);
    setEditTarget(p);
  }

  /** Same client call Space › Points uses; the points list refreshes itself off
   *  the status stream's lastPointUpdate, so there's nothing to reload here. */
  function saveEditPoint() {
    const p = editTarget;
    if (!p || !editValid) return;
    robotClient.editPoint(p.name, {
      x:  Number(editDraft.x),
      y:  Number(editDraft.y),
      z:  Number(editDraft.z),
      rz: Number(editDraft.rz),
      description: editDraft.description.trim(),
    });
    setEditTarget(null);
  }

  /** Same command the Teach modal sends — overwrites the point in place. */
  function teachOverPoint() {
    const p = teachTarget;
    if (!p) return;
    robotClient.sendCommand("TeachPoint", { name: p.name });
    setTeachTarget(null);
  }

  // ── Type a target position (tap an axis in the DRO) ─────────────────────────
  // Sends an absolute cartesian MoveL built from the robot's CURRENT base-frame
  // vector with only the tapped axis replaced by the typed value.
  //
  // Frame safety: a raw-vector MoveL is interpreted in the BASE frame by the
  // controller (only named-point moves get local-frame transforms), while this
  // DRO shows the LOCAL-frame position (status.localX/…). Those agree only when
  // no local is active, so the feature is gated on local === "None" rather than
  // doing frame math in the app. Joint mode is gated too: the controller has no
  // absolute single-joint move command (MoveL/MoveJ/OffsetL/Jog* only).
  type AxisKey = "X" | "Y" | "Z" | "RZ";
  const AXIS_KEYS: AxisKey[] = ["X", "Y", "Z", "RZ"];

  const [axisTarget, setAxisTarget] = useState<{ key: AxisKey; unit?: string; current: string } | null>(null);
  const [axisInput, setAxisInput]   = useState("");
  const [axisNotice, setAxisNotice] = useState<string | null>(null);

  const axisInputValid = Number.isFinite(Number(axisInput.trim())) && axisInput.trim() !== "";

  function openAxisTarget(axis: ReadoutAxis) {
    if (mode === "Joint") {
      setAxisNotice("Joint targets aren't supported — use the jog buttons to move a single joint.");
      return;
    }
    if (local !== "None") {
      setAxisNotice("Deactivate the Local frame to type target positions.");
      return;
    }
    const key = AXIS_KEYS.find((k) => k === axis.label);
    if (!key) return;
    const current = String(axis.value);
    setAxisInput(current);
    setAxisTarget({ key, unit: axis.unit, current });
  }

  /** Absolute line move to the current vector with one axis overridden. */
  function moveAxisTo() {
    const t = axisTarget;
    if (!t) return;
    const v = Number(axisInput.trim());
    if (!Number.isFinite(v) || axisInput.trim() === "") return;

    const vector: Record<AxisKey, number> = {
      X:  s?.x  ?? 0,
      Y:  s?.y  ?? 0,
      Z:  s?.z  ?? 0,
      RZ: s?.rz ?? 0,
    };
    vector[t.key] = v;

    setMovingToName(`${t.key} ${v.toFixed(1)}${t.unit ? ` ${t.unit}` : ""}`);
    setMovingIsAxis(true);
    robotClient.sendCommand("MoveL", { ...vector, Speed: jogSpeeds?.[moveSpeed] });
    setAxisTarget(null);
    setMovingFromPage(true);
  }

  // The pieces the layout arranges. Defined once so every layout places the same
  // controls without duplicating them.
  // Buttons / Joystick toggle — only meaningful for the cartesian modes. Lives in the fixed
  // config area (not above the pad) so it doesn't eat jog space or scroll away on mobile.
  const padStyleToggle = mode !== "Joint" ? (
    <SegmentedControl
      style={styles.padStyleToggle}
      options={[{ label: "Buttons", value: "buttons" }, { label: "Joystick", value: "joystick" }]}
      value={padStyle}
      onChange={(v) => setPadStyle(v as "buttons" | "joystick")}
      size="sm"
    />
  ) : null;

  // Mobile config: a 2×3 grid of tiles (label + value, tap to change) — motion, control, local,
  // tool, points, speed — with the DRO in its own section beneath (see narrow render). Built as
  // three fixed rows of two flex:1 tiles (NOT flex-wrap) so a fold/unfold resize can never reflow
  // the column count — wrap + percentage/measured widths were reflowing to 3 or 1 columns.
  const configMobile = (
    <View style={styles.configGrid}>
      <View style={styles.gridRow}>
        <GridSelectorTile
          label="MOTION"
          icon={<Move3d size={22} color={colors.textMuted} />}
          value={mode}
          options={jogModeTileOptions}
          onSelect={setMode}
          titleInfo={JOG_MODE_INFO}
        />
        <GridSelectorTile
          label="CONTROL"
          icon={<Gamepad2 size={22} color={colors.textMuted} />}
          value={mode === "Joint" ? "—" : padStyle === "joystick" ? "Joystick" : "Buttons"}
          options={["Buttons", "Joystick"]}
          onSelect={(v) => setPadStyle(v === "Joystick" ? "joystick" : "buttons")}
          disabled={mode === "Joint"}
          mutedValue={mode === "Joint"}
          titleInfo="Buttons gives directional jog buttons. Joystick gives analog thumbsticks for X/Y, Z and rotation. (Joint mode always uses buttons.)"
        />
      </View>
      <View style={styles.gridRow}>
        <GridSelectorTile
          label="LOCAL"
          icon={<Grid2X2 size={22} color={colors.textMuted} />}
          value={local}
          options={localOptions}
          onSelect={setLocal}
          viewLabel="View Locals"
          viewRoute="/space/locals"
          mutedValue={local === "None"}
        />
        <GridSelectorTile
          label="TOOL"
          icon={<Wrench size={22} color={colors.textMuted} />}
          value={tool || "None"}
          options={["None", ...tools.map(t => t.name)]}
          onSelect={setTool}
          viewLabel="View Tools"
          viewRoute="/space/tools"
          mutedValue={(tool || "None") === "None"}
        />
      </View>
      <View style={styles.gridRow}>
        <Card onPress={() => setPointsOpen(true)} style={styles.gridTile}>
          <View style={styles.gridTileIcon}><MapPin size={22} color={colors.textMuted} /></View>
          <View style={styles.gridTileText}>
            <Text style={styles.selectorLabel}>POINTS</Text>
            <View style={styles.gridTileValueRow}>
              <Text style={styles.gridTileValue} numberOfLines={1}>{points.length} saved</Text>
              <ChevronRight size={14} color={colors.textFaint} />
            </View>
          </View>
        </Card>
        <GridSelectorTile
          label="SPEED"
          icon={<Gauge size={22} color={colors.textMuted} />}
          value={selectedSpeed}
          options={speedTileOptions}
          onSelect={setSelectedSpeed}
          titleInfo={SPEED_INFO}
          footnote={SPEED_FOOTNOTE}
        />
      </View>
    </View>
  );

  // DRO as its own compact section beneath the config grid (narrow layout). PositionReadout
  // renders its own Card, so pass card={false} and wrap once to keep it a single card.
  const droSection = (
    <Card padded={false} style={styles.droCard}>
      <PositionReadout axes={coords} inline size="lg" card={false} onAxisPress={openAxisTarget} />
    </Card>
  );

  const configCard = (
    <Card>
      {/* Jog mode */}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.selectorLabel}>JOG MODE</Text>
        <InfoTip text="XYZ jogs along the room/local axes. Tool jogs along the tool tip's own axes (e.g. it always plunges straight into the tip). Joint moves a single robot joint at a time." />
      </View>
      <SegmentedControl options={jogModes} value={mode} onChange={setMode} />
      {padStyleToggle && <View style={{ marginTop: spacing.sm }}>{padStyleToggle}</View>}

      <Divider style={styles.cardSeparator} />

      {/* Speed — same slider as mobile (fine step → fast continuous; continuous-only for joystick) */}
      <SpeedSlider options={speedSliderOptions} value={selectedSpeed} onChange={setSelectedSpeed} />

      <Divider style={styles.cardSeparator} />

      {/* Local / Tool row */}
      <View style={styles.selectorsRow}>
        <Selector
          label="LOCAL"
          value={local}
          options={localOptions}
          onSelect={setLocal}
          icon={<Grid2X2 size={15} color={colors.textMuted} />}
          viewLabel="View Locals"
          viewRoute="/space/locals"
          mutedValue={local === "None"}
        />
        <Divider vertical style={styles.cardDivider} />
        <Selector
          label="TOOL"
          value={tool || "None"}
          options={["None", ...tools.map(t => t.name)]}
          onSelect={setTool}
          icon={<Wrench size={15} color={colors.textMuted} />}
          viewLabel="View Tools"
          viewRoute="/space/tools"
          mutedValue={(tool || "None") === "None"}
        />
      </View>
    </Card>
  );

  // Narrow-only replacement for configCard: a compact 2×2 grid of selector
  // tiles, each opening the same PickerModal a tap on a Selector would. State,
  // handlers and option sets are shared with the wide config card above.
  const configGrid = (
    <View style={styles.configGrid}>
      <GridSelectorTile
        label="JOG MODE"
        value={mode}
        options={jogModeTileOptions}
        onSelect={setMode}
        titleInfo={JOG_MODE_INFO}
      />
      <GridSelectorTile
        label="SPEED"
        value={selectedSpeed}
        options={speedTileOptions}
        onSelect={setSelectedSpeed}
        titleInfo={SPEED_INFO}
        footnote={SPEED_FOOTNOTE}
      />
      <GridSelectorTile
        label="LOCAL"
        value={local}
        options={localOptions}
        onSelect={setLocal}
        viewLabel="View Locals"
        viewRoute="/space/locals"
        mutedValue={local === "None"}
      />
      <GridSelectorTile
        label="TOOL"
        value={tool || "None"}
        options={["None", ...tools.map(t => t.name)]}
        onSelect={setTool}
        viewLabel="View Tools"
        viewRoute="/space/tools"
        mutedValue={(tool || "None") === "None"}
      />
    </View>
  );

  // CNC-style DRO — the axis list replaces the old 4-across coordinate strip.
  // Wide layout only; kept at its established "lg" size.
  // Rows are tappable: a tap opens the type-a-target dialog (or a notice when
  // the frame/mode guards block it — see openAxisTarget).
  const dro = (
    <PositionReadout axes={coords} size="lg" onAxisPress={openAxisTarget} />
  );

  // Narrow-only replacement for dro: a single-row inline strip (axis tile +
  // value per axis, no targets) so the DRO doesn't push the pinned jog pad
  // below the fold on phone widths.
  const droInline = (
    <PositionReadout axes={coords} inline onAxisPress={openAxisTarget} />
  );

  const jogPad = (
    <View style={styles.jogWrapper}>
      <JogPad jogMode={mode} selectedSpeed={selectedSpeed} speedOverrides={jogSpeeds} padStyle={padStyle} />
    </View>
  );

  // Teach-mode: capture the live BASE-frame pose for the program point and hand it back to the
  // builder (which owns the point in its in-memory doc), then return to it. router.back() keeps the
  // builder instance — and its unsaved document — alive, so never replace/remount it.
  const teachProgramPoint = () => {
    if (!teachPointId) return;
    teachHandoff.set(teachPointId, teachPointName ?? "", {
      x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0, rx: s.rx ?? 0, ry: s.ry ?? 0, rz: s.rz ?? 0,
    });
    if (router.canGoBack()) router.back();
    else if (returnTo) router.replace(returnTo as Parameters<typeof router.replace>[0]);
  };

  const stopTeach = (inline: boolean, compact = false) => (
    <View style={[styles.bottomRow, inline && styles.bottomRowInline]}>
      <Button
        label="STOP"
        variant="destructive"
        icon={<OctagonX size={22} color={buttonTextColor("destructive")} />}
        style={[styles.stopButton, inline && !compact && styles.stopButtonWide]}
        textStyle={styles.stopText}
        onPress={() => robotClient.sendCommand("HardStop")}
      />

      <Button
        label={teaching ? "Teach Point" : "Teach"}
        variant="ghost"
        icon={<MousePointerClick size={18} color={colors.accent} />}
        style={[styles.teachButton, inline && !compact && styles.teachButtonWide]}
        textStyle={styles.teachButtonText}
        onPress={teaching ? teachProgramPoint : () => setTeachOpen(true)}
      />
    </View>
  );

  // ── Points panel ────────────────────────────────────────────────────────────
  // Parameterized by onPick so each host (wide panel, twoColumn
  // collapsible, narrow modal) controls what happens when a point is chosen —
  // the narrow modal closes itself first (see pointsModal) so it never stacks
  // on top of the dialog that follows.
  //   onPick — row tap: opens the point actions dialog.
  // Row tap and the "Actions" button both open the point actions dialog
  // (Move To / Edit Position / Teach Here).
  const renderPointRows = (onPick: (p: Point) => void) => (
    <>
      <View style={styles.pointsSearchWrap}>
        <Input
          value={pointSearch}
          onChangeText={setPointSearch}
          placeholder="Search points…"
          icon={<Search size={16} color={colors.textFaint} />}
          clearable
          returnKeyType="search"
        />
      </View>

      {filteredPoints.length === 0 ? (
        <EmptyState
          icon={<MapPin size={28} color={colors.textFaint} />}
          title={points.length === 0 ? "No points saved yet" : "No matches"}
          subtitle={
            points.length === 0
              ? "Jog the robot to a position, then press Teach to save it here."
              : undefined
          }
          style={styles.pointsEmpty}
        />
      ) : (
        filteredPoints.map((p, i) => (
          <View key={p.name}>
            <Pressable style={styles.pointListRow} onPress={() => onPick(p)}>
              <View style={styles.pointListText}>
                <Text style={styles.pointName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.pointCoords} numberOfLines={1}>
                  X {p.x.toFixed(1)}  Y {p.y.toFixed(1)}  Z {p.z.toFixed(1)}  RZ {p.rz.toFixed(1)}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.textFaint} />
            </Pressable>
            {i < filteredPoints.length - 1 && <Divider />}
          </View>
        ))
      )}
    </>
  );

  /** Wide: a full-height panel whose list scrolls on its own. */
  const pointsPanel = (
    <Card padded={false} style={styles.pointsCard}>
      <View style={styles.pointsHeader}>
        <Text style={styles.pointsTitle}>Points</Text>
        <InfoTip text="Saved robot positions. Pick one to line- or joint-move the robot there — you choose the move type and speed, and a STOP button stays on screen for the whole move. Make sure the path is clear first." />
      </View>
      <ScrollView
        style={styles.pointsScroll}
        contentContainerStyle={styles.pointsScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderPointRows(setActionTarget)}
      </ScrollView>
    </Card>
  );

  /** Narrow: the same list as a collapsible section so it never crowds the pad. */
  const pointsCollapsible = (
    <Card padded={false}>
      <Pressable style={styles.pointsHeader} onPress={() => setPointsOpen(o => !o)}>
        {pointsOpen
          ? <ChevronDown size={16} color={colors.textMuted} />
          : <ChevronRight size={16} color={colors.textMuted} />}
        <Text style={styles.pointsTitle}>Points</Text>
        <Text style={styles.pointsCount}>{points.length}</Text>
        <View style={styles.pointsHeaderSpacer} />
        <InfoTip text="Saved robot positions. Pick one to line- or joint-move the robot there — you choose the move type and speed, and a STOP button stays on screen for the whole move. Make sure the path is clear first." />
      </Pressable>
      {pointsOpen && <View style={styles.pointsCollapsedBody}>{renderPointRows(setActionTarget)}</View>}
    </Card>
  );

  /** Narrow: a compact trigger row (matches the config grid tiles) that opens
   *  pointsModal below instead of expanding inline, so the points list never
   *  crowds the pinned jog pad on phone widths. */
  const pointsTrigger = (
    <Card onPress={() => setPointsOpen(true)} style={styles.pointsTriggerTile}>
      <Text style={styles.selectorLabel}>POINTS</Text>
      <View style={styles.gridTileValueRow}>
        <Text style={styles.gridTileValue} numberOfLines={1}>{points.length} saved</Text>
        <ChevronRight size={14} color={colors.textFaint} />
      </View>
    </Card>
  );

  /** Narrow: full-screen-ish modal (opened by pointsTrigger) hosting the same
   *  search/list/empty-state content as pointsPanel/pointsCollapsible. Picking
   *  a point closes this modal first, then opens the move-confirm dialog —
   *  mirroring how the rest of this screen never shows two Modals at once
   *  (moveTarget → movingFromPage / alreadyHere are likewise sequential, never
   *  stacked), rather than nesting the move dialogs inside this Modal. */
  const pointsModal = (
    <Modal
      visible={pointsOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setPointsOpen(false)}
    >
      <Pressable style={styles.pickerOverlay} onPress={() => setPointsOpen(false)}>
        <Pressable style={styles.pointsDialog} onPress={() => {}}>
          <View style={styles.dialogHeader}>
            <View style={styles.dialogTitleRow}>
              <Text style={styles.dialogTitle}>Points</Text>
              <Text style={styles.pointsCount}>{points.length}</Text>
            </View>
            <TouchableOpacity onPress={() => setPointsOpen(false)} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.pointsModalScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderPointRows(
              (p) => { setPointsOpen(false); setActionTarget(p); },
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  /** Every jog 3D view: a tapped point / grid cell / stack slot opens its move sheet (highlighted while open). */
  const jog3d = (style: StyleProp<ViewStyle>, persistKey: string, options: Cell3DOptions = WIDE_3D_OPTIONS) => (
    <Cell3DView style={style} persistKey={persistKey} options={options} sets={spaceSets3d} highlight={pick3d.highlight} onPick={pick3d.onPick} />
  );

  /** Desktop right column: the live 3D view or the saved points, one at a time. */
  const sidePanel = (
    <View style={styles.sidePanel}>
      <SegmentedControl
        size="sm"
        options={[
          { label: "3D view", value: "3d", icon: (c: string, z: number) => <Box size={z} color={c} /> },
          { label: `Points · ${points.length}`, value: "points", icon: (c: string, z: number) => <MapPin size={z} color={c} /> },
        ]}
        value={sidePane}
        onChange={(v) => save3d({ sidePane: v as "3d" | "points" })}
      />
      {sidePane === "3d" ? (
        <Card padded={false} style={styles.cell3dCard}>
          {jog3d(styles.cell3dFill, "jog")}
        </Card>
      ) : pointsPanel}
    </View>
  );

  /** Two-column: the 3D view fills the space above the pad in the pad column, always shown. It
   *  takes whatever height the pad and STOP/Teach leave, down to a minimum; the pad never shrinks. */
  const cell3dPadTop = (
    <Card padded={false} style={[styles.cell3dCollapsible, styles.cell3dPadTop]}>
      {jog3d(styles.cell3dFill, "jog")}
    </Card>
  );

  /** Narrow: a compact 3D strip above the pad (opt-in from the header, the pad shrinks to fit). */
  const cell3dNarrow = show3d ? (
    <Card padded={false} style={styles.cell3dCollapsible}>
      {jog3d({ height: Math.round(Math.max(170, Math.min(240, windowHeight * 0.24))) }, "jog-narrow", NARROW_3D_OPTIONS)}
    </Card>
  ) : null;

  return (
    <View style={styles.container} onLayout={onContentLayout}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <View onLayout={e => setHeaderH(e.nativeEvent.layout.height)}>
        <PageHeader
          title={teaching ? `Teaching ${teachPointName}` : "Jog & Teach"}
          subtitle={teaching
            ? "Jog to the position, then tap Teach Point to capture it"
            : "Manually move the robot, then save a point at its current position"}
          // In teach mode return to the live builder (one pop) so its unsaved document survives;
          // dismissTo a route could pop past it.
          backTo={teaching ? undefined : "/control"}
          onBack={teaching ? () => { teachHandoff.clear(); if (router.canGoBack()) router.back(); } : undefined}
          right={!wideLayout || isShort ? (
            <Button
              size="sm"
              variant={show3d ? "ghost" : "secondary"}
              label={show3d ? "Hide 3D" : "3D"}
              icon={<Box size={15} color={show3d ? colors.accent : colors.textSecondary} />}
              onPress={() => save3d({ show3d: !show3d })}
            />
          ) : undefined}
        />
      </View>

      {isShort ? (
        // Short (a phone on its side): the DRO (first, so it stays in view while jogging), the
        // optional 3D view, config and points scroll on the left; the pad with STOP/Teach beneath
        // it is pinned on the right, always on screen.
        <View style={[styles.shortRow, { paddingBottom: spacing.sm + insets.bottom }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.sideColContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Card padded={false}>
              <PositionReadout axes={coords} inline size="lg" card={false} onAxisPress={openAxisTarget} />
            </Card>
            {cell3dNarrow}
            {configCard}
            {pointsCollapsible}
          </ScrollView>
          <View style={[styles.shortPadCol, { width: shortPadColW }]}>
            <View style={styles.shortPadArea}>
              <JogPad
                jogMode={mode}
                selectedSpeed={selectedSpeed}
                speedOverrides={jogSpeeds}
                padStyle={padStyle}
                maxHeight={shortPadMaxH}
              />
            </View>
            <View onLayout={e => setFootH(e.nativeEvent.layout.height)}>{stopTeach(true, true)}</View>
          </View>
        </View>
      ) : wideLayout ? (
        // Wide: jog config + DRO on the left, the pad with STOP/Teach directly
        // underneath in the middle, saved points on the right (desktop widths).
        <View style={styles.wideRow}>
          <View style={[styles.sideCol, threeColumn && styles.sideColThree]}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.sideColContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {configCard}
              {/* Two-column widths have no room for a third pane — the points list rides
                  along in this column (the 3D view sits above the pad). */}
              {dro}
              {twoColumn && pointsCollapsible}
            </ScrollView>
          </View>

          {twoColumn ? (
            <View style={[styles.padCol, styles.padColTwo]}>
              {cell3dPadTop}
              <View style={styles.padStack}>
                {jogPad}
                {stopTeach(true)}
              </View>
            </View>
          ) : (
            <View style={styles.padCol}>
              {jogPad}
              {stopTeach(true)}
            </View>
          )}

          {threeColumn && (
            <View style={[styles.sideCol, styles.sideColThree, styles.pointsCol]}>
              {sidePanel}
            </View>
          )}
        </View>
      ) : (
        // Narrow: config/points/DRO scroll; the jog pad is PINNED above the
        // STOP/Teach footer so the jog buttons are always on screen (the DRO
        // was pushing the pad below the fold when everything scrolled).
        <>
          {/* Fixed top — config, toggle, DRO and points all stay put (no tiny scroll) while
              jogging; the pad gets the rest of the screen. */}
          <View
            style={[styles.narrowTop, wideContent]}
            onLayout={e => setTopH(e.nativeEvent.layout.height)}
          >
            {configMobile}
            {droSection}
            {cell3dNarrow}
          </View>
          <View style={styles.narrowPadArea}>
            <JogPad
              jogMode={mode}
              selectedSpeed={selectedSpeed}
              speedOverrides={jogSpeeds}
              padStyle={padStyle}
              maxHeight={padMaxH}
            />
          </View>
          <View onLayout={e => setFootH(e.nativeEvent.layout.height)}>{stopTeach(false)}</View>
          {pointsModal}
        </>
      )}

      <PointActionSheet point={pick3d.point} onClose={pick3d.close} speed={moveSpeed} />
      <ArrayCellSheet cell={pick3d.cell} onClose={pick3d.close} speed={moveSpeed} />

      {/* ── Teach modal ── */}
      <Modal
        visible={teachOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTeachOpen(false)}
      >
        <TeachModal key={teachOpen ? "open" : "closed"} onClose={() => setTeachOpen(false)} />
      </Modal>

      {/* ── Point actions (row tap) ── */}
      {/* Each action closes this dialog as it opens the next stage, so the
          move-confirm / edit / teach-confirm dialogs never stack on it. */}
      <Modal
        visible={!!actionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setActionTarget(null)}>
          <Pressable style={styles.moveDialog} onPress={() => {}}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleRow}>
                <MapPin size={16} color={colors.textMuted} />
                <Text style={styles.dialogTitle}>{actionTarget?.name}</Text>
              </View>
              <Pressable onPress={() => setActionTarget(null)} hitSlop={10}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <Text style={styles.moveCoordText}>
              X {actionTarget?.x.toFixed(1)}{"  "}
              Y {actionTarget?.y.toFixed(1)}{"  "}
              Z {actionTarget?.z.toFixed(1)}{"  "}
              RZ {actionTarget?.rz.toFixed(1)}
            </Text>

            <Pressable
              style={styles.actionRow}
              onPress={() => { const p = actionTarget; setActionTarget(null); setMoveTarget(p); }}
            >
              <Navigation size={18} color={colors.accent} />
              <View style={styles.actionTextStack}>
                <Text style={styles.actionText}>Move To</Text>
                <Text style={styles.actionSubtext}>Line or joint move at a chosen speed</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.actionRow}
              onPress={() => { if (actionTarget) openEditPoint(actionTarget); }}
            >
              <Pencil size={18} color={colors.accent} />
              <View style={styles.actionTextStack}>
                <Text style={styles.actionText}>Edit Position</Text>
                <Text style={styles.actionSubtext}>Type new X / Y / Z / RZ coordinates</Text>
              </View>
            </Pressable>

            <Pressable
              style={styles.actionRow}
              onPress={() => { const p = actionTarget; setActionTarget(null); setTeachTarget(p); }}
            >
              <MousePointerClick size={18} color={colors.accent} />
              <View style={styles.actionTextStack}>
                <Text style={styles.actionText}>Teach Here</Text>
                <Text style={styles.actionSubtext}>Overwrite with the robot's current position</Text>
              </View>
            </Pressable>

            <View style={styles.actionCancelRow}>
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.modalCancelFlex}
                onPress={() => setActionTarget(null)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit point position (same client call as Space › Points) ── */}
      <Modal
        visible={!!editTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEditTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setEditTarget(null)}>
          <Pressable style={styles.moveDialog} onPress={() => {}}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleRow}>
                <Pencil size={16} color={colors.textMuted} />
                <Text style={styles.dialogTitle}>Edit {editTarget?.name}</Text>
              </View>
              <Pressable onPress={() => setEditTarget(null)} hitSlop={10}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            {editFields.map((field) => (
              <FormRow key={field} label={field.toUpperCase()} inline style={styles.editRow}>
                <Input
                  style={styles.editCoordInput}
                  value={editDraft[field]}
                  onChangeText={(v) => setEditDraft((d) => ({ ...d, [field]: v }))}
                  keyboardType="numeric"
                  selectTextOnFocus
                  returnKeyType="done"
                />
              </FormRow>
            ))}

            <FormRow label="DESCRIPTION" style={styles.editRow}>
              <Input
                value={editDraft.description}
                onChangeText={(v) => setEditDraft((d) => ({ ...d, description: v }))}
                placeholder="What is this point for? (optional)"
                multiline
                returnKeyType="done"
              />
            </FormRow>

            <Divider style={styles.cardSeparator} />

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.modalCancelFlex}
                onPress={() => setEditTarget(null)}
              />
              <Button
                label="Save"
                variant="primary"
                disabled={!editValid}
                style={styles.modalCancelFlex}
                onPress={saveEditPoint}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Teach-over confirm (destructive: replaces the stored coordinates) ── */}
      <Modal
        visible={!!teachTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setTeachTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setTeachTarget(null)}>
          <Pressable style={styles.moveDialog} onPress={() => {}}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleRow}>
                <MousePointerClick size={16} color={colors.textMuted} />
                <Text style={styles.dialogTitle}>Teach Here?</Text>
              </View>
              <Pressable onPress={() => setTeachTarget(null)} hitSlop={10}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <Text style={styles.teachConfirmBody}>
              <Text style={styles.teachConfirmName}>{teachTarget?.name}</Text> will be overwritten with
              the robot's current position — the point's stored coordinates are replaced and this
              cannot be undone.
            </Text>

            <Text style={styles.moveCoordText}>
              Stored{"  "}X {teachTarget?.x.toFixed(1)}{"  "}
              Y {teachTarget?.y.toFixed(1)}{"  "}
              Z {teachTarget?.z.toFixed(1)}{"  "}
              RZ {teachTarget?.rz.toFixed(1)}
            </Text>
            <Text style={styles.moveCoordText}>
              Current{"  "}X {fmt(s?.x)}{"  "}
              Y {fmt(s?.y)}{"  "}
              Z {fmt(s?.z)}{"  "}
              RZ {fmt(s?.rz)}
            </Text>

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.modalCancelFlex}
                onPress={() => setTeachTarget(null)}
              />
              <Button
                label="Teach Here"
                variant="primary"
                icon={<MousePointerClick size={15} color={buttonTextColor("primary")} />}
                style={styles.modalConfirmFlex}
                onPress={teachOverPoint}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Move-to-point confirm (same actions as Space › Points) ── */}
      <Modal
        visible={!!moveTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setMoveTarget(null)}>
          <Pressable style={styles.moveDialog} onPress={() => {}}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleRow}>
                <MapPin size={16} color={colors.textMuted} />
                <Text style={styles.dialogTitle}>{moveTarget?.name}</Text>
              </View>
              <Pressable onPress={() => setMoveTarget(null)} hitSlop={10}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <Text style={styles.moveCoordText}>
              X {moveTarget?.x.toFixed(1)}{"  "}
              Y {moveTarget?.y.toFixed(1)}{"  "}
              Z {moveTarget?.z.toFixed(1)}{"  "}
              RZ {moveTarget?.rz.toFixed(1)}
            </Text>

            <View style={styles.fieldLabelRow}>
              <Text style={styles.selectorLabel}>MOVE SPEED</Text>
            </View>
            <SegmentedControl
              options={["Slow", "Normal", "Fast"] as const}
              value={moveSpeed}
              onChange={setMoveSpeed}
              size="sm"
            />

            <Divider style={styles.cardSeparator} />

            <Pressable style={styles.actionRow} onPress={() => moveToPoint("MoveL")}>
              <Navigation size={18} color={colors.accent} />
              <Text style={styles.actionText}>Line Move</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => moveToPoint("MoveJ")}>
              <RotateCw size={18} color={colors.accent} />
              <Text style={styles.actionText}>Joint Move</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Type a target position (tap an axis in the DRO) ── */}
      <Modal
        visible={!!axisTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setAxisTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setAxisTarget(null)}>
          <Pressable style={styles.moveDialog} onPress={() => {}}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogTitleRow}>
                <Navigation size={16} color={colors.textMuted} />
                <Text style={styles.dialogTitle}>Move {axisTarget?.key}</Text>
              </View>
              <Pressable onPress={() => setAxisTarget(null)} hitSlop={10}>
                <X size={18} color={colors.textFaint} />
              </Pressable>
            </View>

            <Text style={styles.moveCoordText}>
              Current {axisTarget?.key} {axisTarget?.current}{axisTarget?.unit ? ` ${axisTarget.unit}` : ""}
            </Text>

            <View style={styles.fieldLabelRow}>
              <Text style={styles.selectorLabel}>TARGET {axisTarget?.key}</Text>
              <InfoTip text="The robot line-moves to its current position with only this axis changed to the value you type. Make sure the path is clear first." />
            </View>
            <View style={styles.axisInputWrap}>
              <Input
                value={axisInput}
                onChangeText={setAxisInput}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
                placeholder={axisTarget?.current}
                returnKeyType="done"
                onSubmitEditing={moveAxisTo}
                style={styles.axisInputText}
              />
            </View>

            <View style={styles.fieldLabelRow}>
              <Text style={styles.selectorLabel}>MOVE SPEED</Text>
            </View>
            <SegmentedControl
              options={["Slow", "Normal", "Fast"] as const}
              value={moveSpeed}
              onChange={setMoveSpeed}
              size="sm"
            />

            <Divider style={styles.cardSeparator} />

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="secondary"
                style={styles.modalCancelFlex}
                onPress={() => setAxisTarget(null)}
              />
              <Button
                label="Move"
                variant="primary"
                icon={<Navigation size={15} color={buttonTextColor("primary")} />}
                disabled={!axisInputValid}
                style={styles.modalConfirmFlex}
                onPress={moveAxisTo}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Axis-target blocked notice (local frame active / Joint mode) ── */}
      <Modal visible={!!axisNotice} transparent animationType="fade" onRequestClose={() => setAxisNotice(null)}>
        <Pressable style={styles.overlay} onPress={() => setAxisNotice(null)}>
          <Pressable style={styles.alreadyHereCard} onPress={() => {}}>
            <Navigation size={28} color={colors.accent} />
            <Text style={styles.alreadyHereTitle}>Can't Type a Target</Text>
            <Text style={styles.alreadyHereBody}>{axisNotice}</Text>
            <Button label="OK" variant="primary" style={styles.alreadyHereButton} onPress={() => setAxisNotice(null)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Move stop overlay ── */}
      <Modal visible={movingFromPage} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.moveStopCard}>
            <Navigation size={28} color={colors.accent} />
            <Text style={styles.moveStopTitle}>{movingIsAxis ? "Moving axis to" : "Moving to point"}</Text>
            {movingToName && <Text style={styles.moveStopName}>{movingToName}</Text>}
            <Button
              label="STOP"
              variant="destructive"
              icon={<OctagonX size={22} color={buttonTextColor("destructive")} />}
              onPress={() => {
                robotClient.sendCommand("HardStop");
                setMovingFromPage(false);
                setMovingToName(null);
                setMovingIsAxis(false);
              }}
              style={styles.moveStopButton}
              textStyle={styles.stopText}
            />
          </View>
        </View>
      </Modal>

      {/* ── Already at position popup ── */}
      <Modal visible={!!alreadyHere} transparent animationType="fade" onRequestClose={() => setAlreadyHere(null)}>
        <Pressable style={styles.overlay} onPress={() => setAlreadyHere(null)}>
          <Pressable style={styles.alreadyHereCard} onPress={() => {}}>
            <MapPin size={28} color={colors.accent} />
            <Text style={styles.alreadyHereTitle}>Already Here</Text>
            <Text style={styles.alreadyHereBody}>
              The robot is already at{"\n"}
              <Text style={styles.alreadyHereName}>{alreadyHere}</Text>
            </Text>
            <Button label="OK" variant="primary" style={styles.alreadyHereButton} onPress={() => setAlreadyHere(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: spacing.sm + 2,
    gap: spacing.md,
    paddingBottom: spacing.md,
  },

  // ── Wide layout ─────────────────────────────────────────────────────────────
  // Three panes on desktop (config+DRO · pad+STOP/Teach · points), two when the
  // window can't hold a third pane with real gutters. The pad column is fixed
  // because the pad sizes itself; the side columns take the rest of the width.
  wideRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  sideCol: {
    flex: 1,
    minWidth: 290,
  },
  sideColThree: {
    maxWidth: 460,
  },
  sideColContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  pointsCol: {
    // The points panel manages its own scrolling, so the column just fills height.
    justifyContent: "flex-start",
  },
  // Centre column: the jog pad with STOP/Teach directly beneath it, both kept
  // on screen (this column never scrolls) so STOP is always one tap away.
  padCol: {
    width: PAD_COL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  cardSeparator: {
    marginVertical: spacing.sm,
  },

  selectorsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  cardDivider: {
    marginHorizontal: spacing.xs,
  },

  // ── Selector ──────────────────────────────────────────────────────────────
  selectorWrap: {
    flex: 1,
    position: "relative",
  },

  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },

  selectorIcon: {
    opacity: 0.7,
  },

  selectorTextStack: {
    alignItems: "flex-start",
    gap: 2,
  },

  selectorLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.8,
  },

  // Label + InfoTip row above the jog-mode segmented control and speed chips.
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs + 2,
  },

  selectorValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  // Speed chips: one no-wrap row of equal-width chips (wide config card only).
  speedGroup: {
    flexWrap: "nowrap",
    gap: spacing.xs,
  },
  speedChip: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },

  selectorValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },

  // Unset ("None") LOCAL/TOOL value — dimmed instead of full-strength.
  selectorValueMuted: {
    color: colors.textFaint,
  },

  // ── Grid selector tile (narrow config grid) ───────────────────────────────
  configGrid: {
    gap: spacing.sm,
  },

  // Fixed 2-up rows (not flex-wrap) — the column count can't change on a fold resize.
  gridRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },

  gridTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  gridTileDisabled: {
    opacity: 0.5,
  },

  // Bigger icon on the left, label + value stacked on the right.
  gridTileIcon: {
    width: 24,
    alignItems: "center",
  },

  gridTileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  gridTileValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  gridTileValue: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },

  // Unset ("None") LOCAL/TOOL value — dimmed instead of full-strength.
  gridTileValueMuted: {
    color: colors.textFaint,
  },

  // Full-width trigger row under the config grid — opens pointsModal.
  pointsTriggerTile: {
    minHeight: 44,
    gap: 4,
    justifyContent: "center",
  },

  // ── Picker modal ──────────────────────────────────────────────────────────
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },

  pickerCard: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },

  pickerViewLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  pickerViewLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.accent,
  },

  pickerFootnote: {
    ...type.caption,
    marginTop: spacing.sm + 2,
    lineHeight: 16,
  },

  // ── JogPad ────────────────────────────────────────────────────────────────
  jogWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs + 2,
  },
  padStyleToggle: {
    alignSelf: "stretch",
  },
  // Compact mobile config card — tight vertical rhythm between the distinct controls.
  mobileConfig: {
    gap: 6,
    paddingVertical: spacing.sm,
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pointsRowValue: {
    marginLeft: "auto",
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  // Narrow: fixed config/DRO/points block so nothing in the top section scrolls.
  narrowTop: {
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm,
  },
  // Narrow: the jog pad takes the remaining space between the fixed top and the footer.
  // minHeight:0 lets this flex child actually shrink below its content (defeating the CSS
  // flexbox min-height:auto rule), so its measured height is the real available space and the
  // pad scales to fit it instead of overflowing onto the DRO/points above.
  narrowPadArea: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  // DRO section beneath the mobile config grid.
  droCard: {
    marginTop: spacing.sm,
  },
  // Narrow: keeps the pad on screen above the STOP/Teach footer while the
  // config/DRO/points scroll behind it.
  pinnedPad: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },

  // ── STOP / Teach row ──────────────────────────────────────────────────────
  // Narrow: pinned footer directly beneath the pad. Wide: inline under the pad
  // in the centre column (no top border, no pinned chrome).
  bottomRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    // Match the narrow config gutter so STOP/Teach line up with the cards above.
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.md + 2,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  bottomRowInline: {
    alignSelf: "stretch",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopWidth: 0,
    gap: spacing.md,
  },

  // STOP keeps its exact hit area (paddingVertical) — only color/radius come from the kit.
  stopButton: {
    flex: 3,
    paddingVertical: spacing.md,
  },

  // Wide has the room, so STOP grows (it never shrinks).
  stopButtonWide: {
    paddingVertical: spacing.lg + 2,
  },

  stopText: {
    fontSize: 18,
    letterSpacing: 2,
  },

  teachButton: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderWidth: 1.5,
    borderColor: colors.accent,
    paddingVertical: spacing.md,
  },

  teachButtonWide: {
    paddingVertical: spacing.lg + 2,
  },

  teachButtonText: {
    fontSize: 15,
  },

  // ── Points panel ──────────────────────────────────────────────────────────
  pointsCard: {
    flex: 1,
    overflow: "hidden",
  },

  // ── Live 3D view ──
  sidePanel: {
    flex: 1,
    gap: spacing.sm,
  },
  cell3dCard: {
    flex: 1,
    overflow: "hidden",
  },
  cell3dFill: {
    flex: 1,
  },
  cell3dCollapsible: {
    overflow: "hidden",
  },
  cell3dPadTop: {
    alignSelf: "stretch",
    flex: 1,
    minHeight: 180,
  },
  // Two-column pad column: the 3D card on top, the pad + STOP/Teach anchored at the bottom.
  padColTwo: {
    justifyContent: "flex-start",
    gap: spacing.lg,
  },
  // Short (landscape phone): scrolling config column + fixed pad column.
  shortRow: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  shortPadCol: {
    gap: spacing.sm,
  },
  shortPadArea: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  padStack: {
    alignItems: "center",
    gap: spacing.xl,
  },

  pointsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  pointsTitle: {
    ...type.sectionLabel,
  },

  pointsCount: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
  },

  pointsHeaderSpacer: {
    flex: 1,
  },

  pointsScroll: {
    flex: 1,
  },

  pointsScrollContent: {
    paddingBottom: spacing.sm,
  },

  pointsCollapsedBody: {
    paddingBottom: spacing.sm,
  },

  // ── Points modal (narrow) ─────────────────────────────────────────────────
  pointsDialog: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },

  pointsModalScroll: {
    flexGrow: 0,
  },

  pointsSearchWrap: {
    padding: spacing.md,
  },

  pointsEmpty: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },

  pointListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.sm + 2,
  },

  pointListText: {
    flex: 1,
    gap: 2,
  },

  // ── Teach modal ───────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    width: "90%",
    maxWidth: 440,
    maxHeight: 600,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },

  dialogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md + 2,
  },

  dialogTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },

  dialogTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 1,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },

  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },

  pointList: {
    maxHeight: 200,
  },

  pointRow: {
    paddingVertical: spacing.sm + 3,
  },

  pointName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },

  pointMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.sm,
    marginTop: 2,
  },

  pointCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
    flexShrink: 1,
  },

  pointDistance: {
    ...type.mono,
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
  },

  emptyText: {
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: spacing.lg + 4,
    fontSize: 14,
  },

  newPointButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md + 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },

  newPointText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: "600",
  },

  newPointForm: {
    marginBottom: spacing.md + 2,
  },

  modalActions: {
    flexDirection: "row",
    gap: spacing.sm + 2,
  },

  modalCancelFlex: {
    flex: 1,
  },

  modalConfirmFlex: {
    flex: 2,
  },

  // ── Move-to-point dialogs (mirrors Space › Points) ────────────────────────
  moveDialog: {
    width: 300,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },

  moveCoordText: {
    ...type.mono,
    fontSize: 11,
    color: colors.textFaint,
    marginBottom: spacing.md + 2,
  },

  // Typed axis target input (tap an axis in the DRO)
  axisInputWrap: {
    marginBottom: spacing.md,
  },

  axisInputText: {
    ...type.mono,
    fontSize: 18,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md + 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.background,
  },

  actionText: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: "500",
  },

  // ── Point actions dialog ──────────────────────────────────────────────────
  actionTextStack: {
    flex: 1,
    gap: 2,
  },

  actionSubtext: {
    ...type.caption,
  },

  actionCancelRow: {
    flexDirection: "row",
    marginTop: spacing.md + 2,
  },

  editRow: {
    marginBottom: spacing.sm,
  },

  // Inline FormRow puts the label block on flex:1, so the field needs a width.
  editCoordInput: {
    ...type.mono,
    width: 128,
    textAlign: "right",
  },

  teachConfirmBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: spacing.md,
  },

  teachConfirmName: {
    fontWeight: "700",
    color: colors.text,
  },

  moveStopCard: {
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.raised,
  },

  moveStopTitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: "600",
    marginTop: spacing.xs,
  },

  moveStopName: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.sm,
  },

  moveStopButton: {
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl - 4,
    marginTop: spacing.sm,
  },

  alreadyHereCard: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl + 4,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    gap: spacing.xs + 2,
    ...shadows.raised,
  },

  alreadyHereTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginTop: spacing.xs,
  },

  alreadyHereBody: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.sm,
  },

  alreadyHereName: {
    fontWeight: "700",
  },

  alreadyHereButton: {
    paddingHorizontal: spacing.xl - 4,
    marginTop: spacing.xs,
  },
});
