import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import JogPad from "@/src/components/ui/JogPad";
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
import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { Point } from "@/src/models/robotModels";
import { useLocals, usePoints, useRobotStatus, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, Tabs, useFocusEffect } from "expo-router";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  MapPin,
  MousePointerClick,
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
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
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
  value,
  options,
  onSelect,
  titleInfo,
  footnote,
  viewLabel,
  viewRoute,
  mutedValue,
}: {
  label: string;
  value: string;
  options: (string | PickerOption)[];
  onSelect: (v: string) => void;
  titleInfo?: string;
  footnote?: string;
  viewLabel?: string;
  viewRoute?: string;
  /** Dim the value text — set by call sites for an unset "None" value. */
  mutedValue?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card onPress={() => setOpen(true)} style={styles.gridTile}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <View style={styles.gridTileValueRow}>
          <Text style={[styles.gridTileValue, mutedValue && styles.gridTileValueMuted]} numberOfLines={1}>{value}</Text>
          <ChevronDown size={14} color={colors.textFaint} />
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

// ── Teach modal ───────────────────────────────────────────────────────────────
function TeachModal({ onClose }: { onClose: () => void }) {
  const points = usePoints();
  const [mode, setMode] = useState<"list" | "new">("list");
  const [newName, setNewName] = useState("");
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
              {mode === "list" ? "Teach Point" : "New Point"}
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
                    <Text style={styles.pointCoords}>
                      {p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}
                    </Text>
                  </TouchableOpacity>
                  {i < filtered.length - 1 && <Divider />}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.newPointButton} onPress={() => setMode("new")} activeOpacity={0.7}>
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
              <Button label="Back" variant="secondary" style={styles.modalCancelFlex} onPress={() => setMode("list")} />
              <Button
                label="Teach Here"
                variant="primary"
                icon={<MousePointerClick size={15} color={buttonTextColor("primary")} />}
                disabled={!newName.trim()}
                style={styles.modalConfirmFlex}
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
  const [teachOpen, setTeachOpen]       = useState(false);
  const [jogSpeeds, setJogSpeeds]       = useState<{ Slow: number; Normal: number; Fast: number } | undefined>(undefined);

  const tools      = useTools();
  const locals     = useLocals();
  const points     = usePoints();
  const status     = useRobotStatus();
  const activeTool = status.activeTool;
  const wideContent = useWideContent();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = useIsWide();

  // Lay out against the real content width (the NavRail eats ~216px of the
  // window on wide screens), seeded from the window so the first frame is right.
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const paneWidth = measuredWidth || (isWide ? windowWidth - RAIL_ESTIMATE : windowWidth);
  const threeColumn = paneWidth >= THREE_COL_MIN;
  const twoColumn   = !threeColumn && paneWidth >= TWO_COL_MIN;
  const wideLayout  = threeColumn || twoColumn;

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setMeasuredWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
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
    { label: "XYZ",   value: "XYZ" },
    { label: "Tool",  value: "Tool" },
    { label: "Joint", value: "Joint" },
  ];

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
  const [moveTarget, setMoveTarget]       = useState<Point | null>(null);
  const [moveSpeed, setMoveSpeed]         = useState<"Slow" | "Normal" | "Fast">("Normal");
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
  const [editDraft, setEditDraft]       = useState({ x: "", y: "", z: "", rz: "" });
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
  const configCard = (
    <Card>
      {/* Jog mode */}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.selectorLabel}>JOG MODE</Text>
        <InfoTip text="XYZ jogs along the room/local axes. Tool jogs along the tool tip's own axes (e.g. it always plunges straight into the tip). Joint moves a single robot joint at a time." />
      </View>
      <SegmentedControl options={jogModes} value={mode} onChange={setMode} />

      <Divider style={styles.cardSeparator} />

      {/* Speed */}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.selectorLabel}>SPEED</Text>
        <InfoTip text="Slow/Normal/Fast jog continuously while held, at the speeds set on Robot › Configure. The 0.1/1/10 mm chips take one precise step per tap in XYZ and Joint mode — in Tool mode they instead jog continuously at a very slow speed." />
      </View>
      <ChipGroup>
        {speedOptions.map((spd) => (
          <Chip
            key={spd}
            label={spd}
            selected={selectedSpeed === spd}
            onPress={() => setSelectedSpeed(spd)}
          />
        ))}
      </ChipGroup>

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
      <JogPad jogMode={mode} selectedSpeed={selectedSpeed} speedOverrides={jogSpeeds} />
    </View>
  );

  const stopTeach = (inline: boolean) => (
    <View style={[styles.bottomRow, inline && styles.bottomRowInline]}>
      <Button
        label="STOP"
        variant="destructive"
        icon={<OctagonX size={22} color={buttonTextColor("destructive")} />}
        style={[styles.stopButton, inline && styles.stopButtonWide]}
        textStyle={styles.stopText}
        onPress={() => robotClient.sendCommand("HardStop")}
      />

      <Button
        label="Teach"
        variant="ghost"
        icon={<MousePointerClick size={18} color={colors.accent} />}
        style={[styles.teachButton, inline && styles.teachButtonWide]}
        textStyle={styles.teachButtonText}
        onPress={() => setTeachOpen(true)}
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
              <Button
                label="Actions"
                variant="secondary"
                size="sm"
                icon={<ChevronRight size={14} color={buttonTextColor("secondary")} />}
                onPress={() => onPick(p)}
              />
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

  return (
    <View style={styles.container} onLayout={onContentLayout}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <PageHeader
        title="Jog & Teach"
        subtitle="Manually move the robot, then save a point at its current position"
        backTo="/control"
      />

      {wideLayout ? (
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
              {dro}
              {/* Two-column widths have no room for a third pane — the points
                  list rides along under the config column instead. */}
              {twoColumn && pointsCollapsible}
            </ScrollView>
          </View>

          <View style={styles.padCol}>
            {jogPad}
            {stopTeach(true)}
          </View>

          {threeColumn && (
            <View style={[styles.sideCol, styles.sideColThree, styles.pointsCol]}>
              {pointsPanel}
            </View>
          )}
        </View>
      ) : (
        // Narrow: config/points/DRO scroll; the jog pad is PINNED above the
        // STOP/Teach footer so the jog buttons are always on screen (the DRO
        // was pushing the pad below the fold when everything scrolled).
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, wideContent]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {configGrid}
            {pointsTrigger}
            {droInline}
          </ScrollView>
          <View style={styles.pinnedPad}>{jogPad}</View>
          {stopTeach(false)}
          {pointsModal}
        </>
      )}

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
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },

  gridTile: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 44,
    gap: 4,
    justifyContent: "center",
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
    paddingHorizontal: spacing.md,
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
    width: 300,
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

  pointCoords: {
    ...type.mono,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
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
