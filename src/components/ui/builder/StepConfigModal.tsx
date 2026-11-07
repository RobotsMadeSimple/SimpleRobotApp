import React, { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  useWindowDimensions,
} from "react-native";
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, ChevronRight, CircuitBoard, Cpu, Crosshair, Globe, List, Minus, Pencil, Plus, Radio, RotateCcw, RotateCw, Search, Trash2, X } from "lucide-react-native";
import { useKeyboardStableCard } from "@/src/platform/keyboard";

import {
  AuxAxisChannelState,
  AuxDeviceState,
  ConditionGroup,
  Grid,
  GridPoint,
  JsonInboundMapping,
  JsonKeyValue,
  ProgramStep,
  ProgramVariable,
  RobotStack,
  ValidationProblem,
  variableList,
  StackPoint,
  THREAD_PRESETS,
  auxStepsPerUnit,
  auxUnitLabel,
  ioPinSymbol,
  isAssignableVariable,
  isListVariable,
  isPointListVariable,
  isRecordListVariable,
  isScalarListVariable,
} from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  useBuiltPrograms,
  useCameras,
  useConnected,
  useGrids,
  useLocals,
  useIoDevices,
  usePoints,
  useRelayIO,
  useSelectedRobot,
  useStacks,
  useTools,
} from "@/src/providers/RobotProvider";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { colors, radii, accents, CautionNote } from "@/src/components/ui/kit";
import { ms } from "./builderStyles";
import { STEP_THEME, fmtMoveStop, movePointName, newId } from "./stepUtils";
import { CatalogStepFields, fieldClaims, isFieldShown } from "./CatalogStepFields";
import { Axes6Fields, CatalogVarField, ExprMapField, TargetRefField } from "./catalogFieldControls";
import { ExpressionField } from "./expressions/ExpressionEditorModal";
import { useStepCatalog } from "./useStepCatalog";
import { appAlert } from "@/src/components/ui/AppAlert";
import { ExpressionInput, TemplateInput } from "./NumericInputs";
import { SetVariableFields } from "./SetVariableFields";
import { SaveImageFields } from "./SaveImageFields";
import { VarPickerModal, VarSelectorButton } from "./VarPicker";
import { ConditionGroupEditor, conditionSummary } from "./ConditionEditor";
import { VarType } from "./VariableEditModal";
import { PluginStepFields, PluginStepHeader } from "./PluginStepFields";
import { RunVisionStepFields } from "./RunVisionStepFields";
import type { VisionProgram } from "@/src/models/visionTools";
import { ExpressionHelperPanel } from "./expressions/ExpressionHelperPanel";
import { useIsWide } from "@/src/components/ui/responsive";
import { openCalibrationWizard } from "@/src/components/ui/calibration/CameraCalibrationControls";

type SubPage = null | "point" | "speed" | "posOffset" | "toolOffset" | "posOverride" | "jumpHeight" | "blend" | "moveStop";

// Step types whose config fields read live aux-stepper state. Only these fetch aux state on open;
// every other step type opens without touching the network (the modal used to fetch robot config,
// vision programs AND aux state on every open — slow over WiFi on a real robot).
// Step types whose editor is rendered from the controller's step catalog (CatalogStepFields).
const CATALOG_TYPES = new Set<string>([
  "Note", "LoopControl", "Return", "EndProgram", "RaiseError", "Switch", "Try",
  "SavePosition", "SetSpeedFactor", "ListOp", "Prompt",
  "SetSpeedL", "SetSpeedJ", "SetBlendRadius", "StopwatchControl",
  "StartBackground", "StopBackground", "WaitForBackground",
]);

const AUX_STEP_TYPES = new Set<string>([
  "AuxMove", "AuxContinuous", "AuxStop", "AuxEnable",
  "GripperAction", "ConveyorAction", "RotaryIndex",
]);

export function StepConfigModal({
  visible,
  step,
  variables,
  contextVariables,
  scopeSteps,
  stepIndex,
  onSave,
  onClose,
  onEnterRoutine,
  onCreateVariable,
  onSaveVariable,
  onCreateRoutine,
  problems,
}: {
  visible: boolean;
  step: ProgramStep | null;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  scopeSteps?: ProgramStep[];
  stepIndex?: number;
  /**
   * Commits the edited step. On phones the editor is a full page whose edits go into the
   * program as they are made (`live`, debounced and undoable); on wide screens the centred
   * modal commits on Save.
   */
  onSave: (updated: ProgramStep, opts?: { live?: boolean }) => void;
  onClose: () => void;
  onEnterRoutine?: (routineName: string) => void;
  onCreateVariable?: (defaultType?: VarType) => void;
  onSaveVariable?: (v: ProgramVariable) => void;
  onCreateRoutine?: () => void;
  /** The controller's validation problems on this step (shown under their fields). */
  problems?: ValidationProblem[];
}) {
  const points        = usePoints();
  const catalog       = useStepCatalog();
  const insets        = useSafeAreaInsets();
  const grids         = useGrids();
  const stacks        = useStacks();
  const tools         = useTools();
  const locals        = useLocals();
  const allPrograms   = useBuiltPrograms();
  const routines      = allPrograms.filter(p => p.isRoutine);
  const ioDevices         = useIoDevices();
  const relay         = useRelayIO();
  const robot         = useSelectedRobot();
  // ASTRO and CNC 4-axis robots only have Z rotation — hide RX/RY offset fields.
  const rzOnly        = robot?.robotType === 'ASTRO' || robot?.robotType === 'CNC4Axis';
  const [draft, setDraft]           = useState<ProgramStep | null>(null);
  const [pulseMsText, setPulseMs]   = useState("");
  const [subPage, setSubPage]       = useState<SubPage>(null);
  // Step name is edited in-place in the header via a pencil toggle.
  const [editingName, setEditingName] = useState(false);
  // Description + status description collapse to an "Add …" button when empty, to save room.
  const [showComment, setShowComment] = useState(false);
  const [showStatus,  setShowStatus]  = useState(false);
  // Which modifier row is currently showing its inline "clear?" confirmation.
  const [clearConfirm, setClearConfirm] = useState<SubPage>(null);
  const [gridPointMode, setGridPointMode] = useState<'savedPoint' | 'gridPoint' | 'stackPoint' | 'variable'>('savedPoint');
  const [gridPickerOpen, setGridPickerOpen] = useState(false);
  const [stackPickerOpen, setStackPickerOpen] = useState(false);
  const [ioConfig, setIoConfig]       = useState<{ enableStbCard: boolean; enableIoDevices: boolean; enableRelayCard: boolean } | null>(null);
  const [auxDevices, setAuxDevices]       = useState<AuxDeviceState[]>([]);
  const [visionPrograms, setVisionPrograms] = useState<VisionProgram[]>([]);
  // Cameras are already streamed globally by the provider — no need to re-subscribe per open.
  const cameraDevices = useCameras();
  const [threadPresetPickerOpen, setThreadPresetPickerOpen] = useState(false);
  const [waitTimeoutVarPicker,  setWaitTimeoutVarPicker]  = useState(false);
  const [moveStopPosVarPicker,  setMoveStopPosVarPicker]  = useState(false);
  const [moveStopFlagVarPicker, setMoveStopFlagVarPicker] = useState(false);
  const [loopIndexVarPicker,    setLoopIndexVarPicker]    = useState(false);
  const [forEachSourcePicker,   setForEachSourcePicker]   = useState(false);
  const [forEachValuePicker,    setForEachValuePicker]    = useState(false);
  const [jsonInboundPicker,  setJsonInboundPicker]  = useState<number | null>(null);
  const [jsonOutboundPicker, setJsonOutboundPicker] = useState<number | null>(null);
  const [exportColumnPicker, setExportColumnPicker] = useState<number | null>(null);
  const [httpReceiveInboundPicker, setHttpReceiveInboundPicker] = useState<number | null>(null);
  // The single-target steps whose variable used to be an inline chip/radio list. Every target
  // now goes through the shared picker, which also offers "+ New <type> variable".
  const [loadCellVarPicker,  setLoadCellVarPicker]  = useState(false);
  const [recordVarPicker,    setRecordVarPicker]    = useState(false);
  const [captureVarPicker,   setCaptureVarPicker]   = useState(false);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 48, 520);
  // Two-pane (edit card + always-visible variable/function/property helper) whenever the app is in
  // its wide layout — the same `useIsWide` that drives the nav rail, so every wide device (landscape
  // tablets, unfolded foldables like the Z Fold, desktop) gets it. The two panes size to fit the
  // available width so they never overflow on the narrower wide screens.
  const wide = useIsWide();
  // Phones get a full-page editor (like the vision tool page) whose edits go straight into the
  // program; wide screens keep the centred modal with Save / Cancel.
  const pageMode = !wide;
  const availWidth    = windowWidth - 48; // overlay side padding (2 * spacing.xl)
  const panelWidth    = Math.min(300, Math.max(220, Math.round((availWidth - 16) * 0.4)));
  const wideCardWidth = Math.min(520, availWidth - panelWidth - 16);

  // The card keeps a stable height whether or not the keyboard is up, so the pinned Cancel/Save
  // footer never moves — the keyboard simply draws over it (dismiss it to tap them) — and the
  // focused field scrolls clear of the keyboard's top. windowHeight shrinks under adjustResize, so
  // snapshot the keyboard-closed height and always size from that.
  const { kbHeight, scrollRef: kbScrollRef, onScroll: kbOnScroll, onCardLayout: kbOnCardLayout,
          cardStyle: kbCardStyle, contentPaddingBottom: kbPadBottom } = useKeyboardStableCard(visible);
  const fullWindowHRef = useRef(windowHeight);
  if (kbHeight === 0) fullWindowHRef.current = windowHeight;
  const cardMaxHeight = Math.round(fullWindowHRef.current * 0.88);

  // Only fetch the data a given step type actually uses. Opening a Move/Wait/Logic/etc. step now
  // makes zero network calls; IO/Vision/Aux steps fetch just their own data. (Previously every open
  // fired getRobotConfig + getVisionPrograms + getAuxState + two subscriptions — slow over WiFi.)
  const draftType = draft?.type;
  useEffect(() => {
    if (!visible || !draftType) return;
    if (draftType === "SetOutput") {
      robotClient.getRobotConfig()
        .then(cfg => setIoConfig({
          enableStbCard:   cfg.enableStbCard   ?? true,
          enableIoDevices: cfg.enableIoDevices ?? true,
          enableRelayCard: cfg.enableRelayCard ?? false,
        }))
        .catch(() => setIoConfig({ enableStbCard: true, enableIoDevices: true, enableRelayCard: false }));
    }
    if (draftType === "RunVision") {
      robotClient.getVisionPrograms()
        .then(({ programs }) => setVisionPrograms(programs))
        .catch(() => {});
    }
    if (AUX_STEP_TYPES.has(draftType)) {
      robotClient.getAuxState().catch(() => {});
      const unsubAux = robotClient.onAuxAxis(devices => setAuxDevices(devices));
      return () => { unsubAux(); };
    }
  }, [visible, draftType]);

  const liveBaseline = useRef("");
  const draftRef = useRef<ProgramStep | null>(null);
  const onSaveRef = useRef(onSave);

  // Rebuild the draft from the step on every open, not just when the step object changes: Cancel
  // only hides the modal and the builder hands back the same step object next time, so without
  // `visible` here a cancelled edit (e.g. a deleted condition) would still be sitting in the draft.
  useEffect(() => {
    if (!visible) return;
    if (step) {
      // varPointName/varPointIndex were a separate tab before point targets merged into
      // one expression. Fold them into the equivalent pointNameExpr so the merged field
      // shows them; the rewrite only persists if the user saves.
      const migrated = step.varPointName
        ? { ...step,
            pointNameExpr: `$${step.varPointName}[${step.varPointIndex ?? "0"}]`,
            varPointName: undefined,
            varPointIndex: undefined }
        : { ...step };
      setDraft(migrated);
      setPulseMs(step.pulseMs !== undefined && step.pulseMs > 0 ? String(step.pulseMs) : "");
      setGridPointMode(migrated.pointNameExpr ? 'variable' : step.gridPoint != null ? 'gridPoint' : step.stackPoint != null ? 'stackPoint' : 'savedPoint');
    } else {
      setDraft(null);
      setPulseMs("");
      setGridPointMode('savedPoint');
    }
    setSubPage(null);
    setClearConfirm(null);
    setEditingName(false);
    setShowComment(false);
    setShowStatus(false);
    liveBaseline.current = step ? JSON.stringify(step.varPointName
      ? { ...step, pointNameExpr: `$${step.varPointName}[${step.varPointIndex ?? "0"}]`, varPointName: undefined, varPointIndex: undefined }
      : step) : "";
  }, [step, visible]);

  // Live edits (phone page): each change is committed 400 ms after the last one, coalesced into
  // one undo step by the builder; closing flushes whatever is pending. Nothing is committed until
  // the draft actually differs from what was opened (liveBaseline, set when the editor opens).
  useEffect(() => { draftRef.current = draft; onSaveRef.current = onSave; });
  const flushLive = () => {
    const d = draftRef.current;
    if (!pageMode || !d) return;
    const json = JSON.stringify(d);
    if (json === liveBaseline.current) return;
    liveBaseline.current = json;
    onSaveRef.current(d, { live: true });
  };
  useEffect(() => {
    if (!pageMode || !visible || !draft) return;
    const t = setTimeout(flushLive, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, pageMode, visible]);
  const closePage = () => { flushLive(); onClose(); };

  // Leaving the main page (into a sub-page) always drops name-edit mode.
  useEffect(() => { if (subPage) setEditingName(false); }, [subPage]);

  // Snapshot the draft when a sub-page opens so its Cancel can revert just that edit (the whole
  // modal's Cancel still discards everything). The snapshot is taken before any `seed` the opener
  // applies, so Cancel also undoes a flag the open itself switched on (blend, an empty stop
  // condition).
  const subPageSnapshot = useRef<ProgramStep | null>(null);
  const openSubPage = (page: NonNullable<SubPage>, seed?: Partial<ProgramStep>) => {
    subPageSnapshot.current = draft;
    if (seed) setDraft(d => d ? { ...d, ...seed } : d);
    setSubPage(page);
  };


  if (!draft) return null;

  const set = (fields: Partial<ProgramStep>) => setDraft(d => d ? { ...d, ...fields } : d);

  /** Update (or clear) a single entry in the step's `expressions` dict. */
  const setExpr = (key: string, expr: string | undefined) =>
    setDraft(d => {
      if (!d) return d;
      const exprs = { ...(d.expressions ?? {}) };
      if (expr === undefined || expr.trim() === "") delete exprs[key];
      else exprs[key] = expr;
      return { ...d, expressions: Object.keys(exprs).length > 0 ? exprs : undefined };
    });

  const offsetKeys    = ["offsetX","offsetY","offsetZ","offsetRX","offsetRY","offsetRZ"];
  const toolOffKeys   = ["toolOffsetX","toolOffsetY","toolOffsetZ","toolOffsetRX","toolOffsetRY","toolOffsetRZ"];
  const overrideKeys  = ["overrideX","overrideY","overrideZ","overrideRX","overrideRY","overrideRZ"];
  const hasOffset    = offsetKeys.some(k   => (draft as any)[k] != null || draft.expressions?.[k] != null);
  const hasToolOff   = toolOffKeys.some(k  => (draft as any)[k] != null || draft.expressions?.[k] != null);
  const hasOverride  = overrideKeys.some(k => (draft as any)[k] != null || draft.expressions?.[k] != null);

  // Per-axis summary of set fields, e.g. "X=10  Z=-5". prefix strips the field name.
  const axisSummary = (keys: string[], prefix: string) =>
    keys
      .filter(k => (draft as any)[k] != null || draft.expressions?.[k] != null)
      .map(k => `${k.replace(prefix, "")}=${draft.expressions?.[k] ?? (draft as any)[k]}`)
      .join("  ");

  const offsetSummary   = axisSummary(offsetKeys,   "offset");
  const toolOffSummary  = axisSummary(toolOffKeys,  "toolOffset");
  const overrideSummary = axisSummary(overrideKeys, "override");

  const speedKeys    = ["speed", "accel", "decel"];
  const speedSet     = speedKeys.some(k => (draft as any)[k] != null || draft.expressions?.[k] != null);
  const speedSummary = (() => {
    const parts: string[] = [];
    const sp = draft.expressions?.speed ?? (draft.speed != null ? `${draft.speed} mm/s` : null);
    const ac = draft.expressions?.accel ?? (draft.accel != null ? `${draft.accel}` : null);
    const de = draft.expressions?.decel ?? (draft.decel != null ? `${draft.decel}` : null);
    if (sp) parts.push(sp);
    if (ac) parts.push(`accel ${ac}`);
    if (de) parts.push(`decel ${de}`);
    return parts.join("  ·  ");
  })();

  // Blend row (MoveL "Blend Into Next Move", JumpL "Blend Apex Corners"): the flag plus an optional
  // radius override. Clearing the row drops both.
  const blendKeys = ["blend", "blendRadius"];
  const blendRadiusText = draft.expressions?.blendRadius ?? (draft.blendRadius != null ? String(draft.blendRadius) : null);
  const blendSummary = blendRadiusText ? `Radius ${blendRadiusText} mm` : "Program default radius";

  // Clear a modifier's direct fields and any expression overrides on those fields.
  const clearFields = (keys: string[]) =>
    setDraft(d => {
      if (!d) return d;
      const next: any = { ...d };
      const exprs = { ...(d.expressions ?? {}) };
      for (const k of keys) { next[k] = undefined; delete exprs[k]; }
      return { ...next, expressions: Object.keys(exprs).length > 0 ? exprs : undefined };
    });

  // Move-modifier row. When set: a solid card whose body opens the editor and whose
  // trash button asks for an inline confirmation before clearing. When unset: a
  // dashed grayed-out "Add …" button.
  // `seed` is applied when the "Add …" row opens the sub-page (e.g. turning the blend flag on);
  // the sub-page's Cancel reverts it along with any edits.
  const modifierRow = (label: string, isSet: boolean, value: string, page: NonNullable<SubPage>, clearKeys: string[], seed?: Partial<ProgramStep>) => {
    if (!isSet) {
      return (
        <TouchableOpacity style={ms.modRowAdd} onPress={() => openSubPage(page, seed)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={label}>
          <Plus size={15} color={colors.textFaint} />
          <Text style={ms.modAddText}>{label}</Text>
        </TouchableOpacity>
      );
    }
    if (clearConfirm === page) {
      return (
        <View style={ms.modRow}>
          <Text style={[ms.subRowLabel, { flex: 1 }]} numberOfLines={1}>Clear {label}?</Text>
          <TouchableOpacity onPress={() => setClearConfirm(null)} hitSlop={8} activeOpacity={0.7} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textMuted }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { clearFields(clearKeys); setClearConfirm(null); }} hitSlop={8} activeOpacity={0.7} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.danger }}>Clear</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={ms.modRow}>
        <TouchableOpacity style={ms.subRowLeft} onPress={() => openSubPage(page)} activeOpacity={0.7}>
          <Text style={ms.subRowLabel}>{label}</Text>
          <Text style={ms.subRowValue} numberOfLines={1}>{value}</Text>
        </TouchableOpacity>
        <DeleteIconButton onPress={() => setClearConfirm(page)} size={16} style={{ padding: 4 }} />
      </View>
    );
  };

  // ── Stop / record on condition (move steps) ───────────────────────────────
  // Optional on MoveL/MoveJ/JumpL/JumpJ/AuxMove/GripperAction. A modifier row like the offsets:
  // unset it is a dashed "Add …" row that opens the sub-page with an empty condition; set it shows
  // the condition summary and its trash clears all four wire fields. The sub-page holds the
  // condition editor, the stop/record mode and the two optional variable targets. What the position
  // variable may be depends on the step: a Points list for a robot move (the live pose, one
  // element), a plain number for an aux move (the axis position).
  const moveStopIsAux = draft.type === "AuxMove" || draft.type === "GripperAction";
  const moveStopKeys = ["moveStopCondition", "moveStopMode", "moveStopPositionVariableName", "moveStopFlagVariableName"];
  const moveStopPosVars = moveStopIsAux
    ? (variables ?? []).filter(v => !isListVariable(v) && !v.isString && !v.isImage && !v.isBoolean && !v.isStopwatch)
    : (variables ?? []).filter(isPointListVariable);
  const moveStopFlagVars = (variables ?? []).filter(v => !isListVariable(v) && !v.isString && !v.isImage && !v.isStopwatch);
  // Named load cells on named nanos — the only pins the controller publishes as `io.<nano>.<pin>`.
  const loadCellChips = (ioDevices ?? []).flatMap(n => !n.name ? [] :
    (n.pins ?? []).filter(p => p.type === "LoadCell" && !!p.name)
      .map(p => ({ key: `${n.id}/${p.pin}`, nano: n.name, pin: p.name })));
  const clearMoveStop = () => clearFields(moveStopKeys);

  // Leaving a sub-page by Done / back / backdrop keeps its edits. A stop condition left without
  // any rows is no condition at all, so the row goes back to "Add" instead of saving an empty one.
  const closeSubPageDone = () => {
    if (subPage === "moveStop" && !(draft.moveStopCondition?.items?.length)) clearMoveStop();
    setSubPage(null);
  };

  // "$ [name ▾] ×" — the same variable-target row the Wait step's timeout flag uses.
  const varTargetRow = (value: string | undefined, label: string, onOpen: () => void, onClear: () => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
      <Text style={{ fontSize: 13, color: accents.purple, fontWeight: "600", marginRight: 6 }}>$</Text>
      <TouchableOpacity style={[ms.input, { flex: 1, justifyContent: "center" }]} onPress={onOpen} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={label}>
        <Text style={{ color: value ? colors.text : colors.textFaint, fontSize: 14 }}>{value ?? "none"}</Text>
      </TouchableOpacity>
      {value && (
        <TouchableOpacity onPress={onClear} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
          <X size={14} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );

  // The row on the main page. Set: "Stop on Condition" / "Record on Condition" with the summary line
  // the step list shows; its trash clears all four fields. Unset: "Add" opens the sub-page seeded with
  // an empty condition (Cancel there reverts to unset).
  const moveStopRow = () => {
    const cond = draft.moveStopCondition;
    const label = cond && draft.moveStopMode === "record" ? "Record on Condition" : "Stop on Condition";
    return modifierRow(label, !!cond, fmtMoveStop(draft) ?? "", "moveStop", moveStopKeys,
      { moveStopCondition: { combinator: "ALL", items: [] } });
  };

  // The sub-page body.
  const moveStopPage = () => {
    const cond = draft.moveStopCondition ?? { combinator: "ALL" as const, items: [] };
    const mode = draft.moveStopMode ?? "stop";
    const addRow = (expr: string) =>
      set({ moveStopCondition: { ...cond, items: [...(cond.items ?? []), { id: newId(), expr }] } });
    return (
      <>
        <Text style={ms.hintText}>Checked continuously while this move is in flight.</Text>
        {draft.type === "AuxMove" && draft.auxWaitForDone === false && (
          <Text style={[ms.hintText, { color: colors.warning }]}>
            {"Only applies while the step waits for the move — turn \"Wait until move completes\" on."}
          </Text>
        )}
        <Text style={[ms.fieldLabel, { marginTop: 10 }]}>CONDITION</Text>
        <ConditionGroupEditor
          group={cond}
          onChange={g => set({ moveStopCondition: g })}
          variables={variables}
          contextVariables={contextVariables}
        />
        {loadCellChips.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {loadCellChips.map(c => (
              <TouchableOpacity key={c.key} style={stopCond.chip} activeOpacity={0.7}
                onPress={() => addRow(`${ioPinSymbol(c.nano, c.pin)} >= 1000`)}
                accessibilityRole="button" accessibilityLabel={`Add force limit on ${c.pin}`}>
                <Plus size={12} color={accents.cyan} />
                <Text style={stopCond.chipText}>{`Force ≥ … on ${c.pin}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={ms.hintText}>{"Force limit: $io.<nano>.<load cell> >= grams. Load cells read in grams."}</Text>

        <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MODE</Text>
        <View style={ms.segRow}>
          {([{ label: "Stop here", val: "stop" }, { label: "Record position", val: "record" }] as const).map(({ label, val }) => {
            const active = mode === val;
            return (
              <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                onPress={() => set({ moveStopMode: val })} activeOpacity={0.8}>
                <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={ms.hintText}>
          {mode === "stop"
            ? "The move ends where it is the first time the condition is true; the next step runs right away."
            : "The move carries on to its target; only the position at the first true evaluation is captured."}
        </Text>

        <Text style={[ms.fieldLabel, { marginTop: 12 }]}>RECORD POSITION VARIABLE  (optional)</Text>
        <Text style={ms.hintText}>
          {moveStopIsAux
            ? "Numeric variable that receives the axis position (mm or deg, or raw steps) when the condition fires."
            : "Points list variable replaced with the robot position when the condition fires — read it as $var[0]."}
        </Text>
        {varTargetRow(draft.moveStopPositionVariableName, "Record position variable",
          () => setMoveStopPosVarPicker(true), () => set({ moveStopPositionVariableName: undefined }))}

        <Text style={[ms.fieldLabel, { marginTop: 12 }]}>FIRED FLAG VARIABLE  (optional)</Text>
        <Text style={ms.hintText}>Set to 1 if the condition fired during the move, 0 if not.</Text>
        {varTargetRow(draft.moveStopFlagVariableName, "Fired flag variable",
          () => setMoveStopFlagVarPicker(true), () => set({ moveStopFlagVariableName: undefined }))}
      </>
    );
  };

  // The move target as the Point row shows it (the live point name by id, so a rename shows).
  const pointLabel = draft.gridPoint
    ? `Grid → ${grids.find(g => g.id === draft.gridPoint!.gridId)?.name ?? 'Unknown'}`
    : draft.stackPoint
    ? `Stack → ${stacks.find(s => s.id === draft.stackPoint!.stackId)?.name ?? 'Unknown'}`
    : draft.varPointName
    ? `$${draft.varPointName}[${draft.varPointIndex ?? "0"}]`
    : draft.pointNameExpr
    ? `→ ${draft.pointNameExpr}`
    : movePointName(draft, points, "Current Position");

  // Generic catalog fields for this draft (CatalogStepFields with the modal's wiring).
  const catalogFields = (extra?: { only?: string[]; skip?: string[]; grouped?: boolean; special?: Record<string, () => React.ReactNode> }) => (
    <CatalogStepFields
      key={draft.id}
      step={draft}
      set={set}
      setExpr={setExpr}
      variables={variables}
      contextVariables={contextVariables}
      onSaveVariable={onSaveVariable}
      problems={problems}
      {...extra}
    />
  );

  // ── Sub-page content ──────────────────────────────────────────────────────

  function renderSubPage() {
    switch (subPage) {
      case "blend":
        return (
          <>
            <Text style={ms.hintText}>
              {draft!.type === "JumpL"
                ? "Round the lift and lower corners into a smooth arch instead of stopping at the top."
                : "Round this corner instead of stopping, carrying speed into the next MoveL."}
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 10 }]}>BLEND RADIUS OVERRIDE  (mm)</Text>
            <ExpressionInput style={ms.input} fieldKey="blendRadius"
              value={draft!.blendRadius} expressions={draft!.expressions}
              onChangeValue={v => set({ blendRadius: v })} onChangeExpr={setExpr} variables={variables}
              allowUndefined placeholder="program default" />
            <Text style={ms.hintText}>Leave blank to use the program's default blend radius (Set Blend Radius step).</Text>
          </>
        );

      case "moveStop":
        return moveStopPage();

      case "point": {
        return (
          <>
            {/* Mode tabs */}
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
              {(['savedPoint', 'gridPoint', 'stackPoint', 'variable'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    { flex: 1, paddingVertical: 8, borderRadius: radii.sm, alignItems: 'center',
                      backgroundColor: gridPointMode === mode ? colors.accent : colors.background,
                      borderWidth: 1, borderColor: gridPointMode === mode ? colors.accent : colors.border }
                  ]}
                  onPress={() => {
                    setGridPointMode(mode);
                    if (mode === 'savedPoint') {
                      set({ gridPoint: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined, pointNameExpr: undefined });
                    } else if (mode === 'gridPoint') {
                      if (!draft!.gridPoint) {
                        set({ pointName: undefined, pointId: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined, pointNameExpr: undefined, gridPoint: { gridId: '', rowIndex: 0, colIndex: 0, useGridIndex: false } });
                      }
                    } else if (mode === 'stackPoint') {
                      if (!draft!.stackPoint) {
                        set({ pointName: undefined, pointId: undefined, gridPoint: undefined, varPointName: undefined, varPointIndex: undefined, pointNameExpr: undefined, stackPoint: { stackId: '', index: 0 } });
                      }
                    } else {
                      set({ pointName: undefined, pointId: undefined, gridPoint: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: gridPointMode === mode ? colors.surface : colors.textSecondary }}>
                    {mode === 'savedPoint' ? 'Point' : mode === 'gridPoint' ? 'Grid' : mode === 'stackPoint' ? 'Stack' : 'Variable'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {gridPointMode === 'savedPoint' ? (
              <>
                {/* "Current Position" option */}
                <TouchableOpacity
                  style={[ms.row, ms.rowBorder, !draft!.pointName && ms.rowActive]}
                  onPress={() => { set({ pointName: undefined, pointId: undefined }); setSubPage(null); }}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, !draft!.pointName && ms.radioRingActive]}>
                    {!draft!.pointName && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, !draft!.pointName && ms.rowLabelActive]}>Current Position</Text>
                    <Text style={ms.rowDesc}>Use the robot's live position — offsets become relative moves</Text>
                  </View>
                </TouchableOpacity>
                {points.length === 0 && <Text style={ms.emptyHint}>No points saved yet.</Text>}
                {points.map((p, i) => {
                  const active = draft!.pointId ? draft!.pointId === p.id : draft!.pointName === p.name;
                  return (
                    <TouchableOpacity
                      key={p.id || p.name}
                      style={[ms.row, i < points.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => { set({ pointName: p.name, pointId: p.id || undefined }); setSubPage(null); }}
                      activeOpacity={0.7}
                    >
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{p.name}</Text>
                        <Text style={ms.rowDesc}>{p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <TeachHere
                  points={points}
                  selected={draft!.pointId ? points.find(p => p.id === draft!.pointId) : points.find(p => p.name === draft!.pointName)}
                  onTaught={name => set({ pointName: name, pointId: points.find(p => p.name === name)?.id || undefined })}
                />
              </>
            ) : gridPointMode === 'gridPoint' ? (
              <>
                {/* Grid picker button */}
                <TouchableOpacity
                  style={[ms.subRow, { marginBottom: 4 }]}
                  onPress={() => setGridPickerOpen(true)}
                  activeOpacity={0.7}
                >
                  <View style={ms.subRowLeft}>
                    <Text style={ms.subRowLabel}>Grid</Text>
                    <Text style={ms.subRowValue}>
                      {grids.find(g => g.id === draft!.gridPoint?.gridId)?.name ?? 'Select grid…'}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.borderStrong} />
                </TouchableOpacity>

                {/* Row & Column vs Grid Index toggle */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 }}>
                  {[false, true].map(useIdx => (
                    <TouchableOpacity
                      key={String(useIdx)}
                      style={[{ flex: 1, paddingVertical: 7, borderRadius: radii.sm, alignItems: 'center',
                        backgroundColor: draft!.gridPoint?.useGridIndex === useIdx ? colors.accentSoft : colors.surfaceMuted,
                        borderWidth: 1, borderColor: draft!.gridPoint?.useGridIndex === useIdx ? colors.accent : colors.border }]}
                      onPress={() => {
                        set({ gridPoint: { ...(draft!.gridPoint ?? { gridId: '', rowIndex: 0, colIndex: 0 }), useGridIndex: useIdx } });
                        if (useIdx) {
                          setExpr('gridRowIndex', undefined);
                          setExpr('gridColIndex', undefined);
                        } else {
                          setExpr('gridGridIndex', undefined);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: draft!.gridPoint?.useGridIndex === useIdx ? colors.accent : colors.textMuted }}>
                        {useIdx ? 'Grid Index' : 'Row & Column'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!draft!.gridPoint?.useGridIndex ? (
                  <>
                    <Text style={ms.fieldLabel}>ROW INDEX</Text>
                    <ExpressionInput
                      style={ms.input}
                      fieldKey="gridRowIndex"
                      value={draft!.gridPoint?.rowIndex}
                      expressions={draft!.expressions}
                      onChangeValue={v => set({ gridPoint: { ...(draft!.gridPoint ?? { gridId: '', colIndex: 0, useGridIndex: false }), rowIndex: v ?? 0 } })}
                      onChangeExpr={setExpr}
                      variables={variables}
                    />
                    <Text style={[ms.fieldLabel, { marginTop: 10 }]}>COL INDEX</Text>
                    <ExpressionInput
                      style={ms.input}
                      fieldKey="gridColIndex"
                      value={draft!.gridPoint?.colIndex}
                      expressions={draft!.expressions}
                      onChangeValue={v => set({ gridPoint: { ...(draft!.gridPoint ?? { gridId: '', rowIndex: 0, useGridIndex: false }), colIndex: v ?? 0 } })}
                      onChangeExpr={setExpr}
                      variables={variables}
                    />
                  </>
                ) : (
                  <>
                    <Text style={ms.fieldLabel}>GRID INDEX</Text>
                    <ExpressionInput
                      style={ms.input}
                      fieldKey="gridGridIndex"
                      value={draft!.gridPoint?.gridIndex}
                      expressions={draft!.expressions}
                      onChangeValue={v => set({ gridPoint: { ...(draft!.gridPoint ?? { gridId: '', rowIndex: 0, colIndex: 0, useGridIndex: true }), gridIndex: v ?? 0 } })}
                      onChangeExpr={setExpr}
                      variables={variables}
                    />
                  </>
                )}

                {/* Grid picker modal */}
                <Modal visible={gridPickerOpen} transparent animationType="fade" onRequestClose={() => setGridPickerOpen(false)}>
                  <Pressable style={ms.overlay} onPress={() => setGridPickerOpen(false)}>
                    <Pressable style={ms.card} onPress={() => {}}>
                      <View style={ms.header}>
                        <Text style={ms.title}>Select Grid</Text>
                        <TouchableOpacity onPress={() => setGridPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                          <X size={18} color={colors.textFaint} />
                        </TouchableOpacity>
                      </View>
                      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                        {grids.length === 0 && <Text style={ms.emptyHint}>No grids defined yet.</Text>}
                        {grids.map((g, i) => {
                          const active = draft!.gridPoint?.gridId === g.id;
                          return (
                            <TouchableOpacity
                              key={g.id}
                              style={[ms.row, i < grids.length - 1 && ms.rowBorder, active && ms.rowActive]}
                              onPress={() => {
                                set({ gridPoint: { ...(draft!.gridPoint ?? { rowIndex: 0, colIndex: 0, useGridIndex: false }), gridId: g.id } });
                                setGridPickerOpen(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={[ms.radioRing, active && ms.radioRingActive]}>
                                {active && <View style={ms.radioDot} />}
                              </View>
                              <View style={ms.rowText}>
                                <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{g.name}</Text>
                                <Text style={ms.rowDesc}>Base: {g.basePointName}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </Pressable>
                  </Pressable>
                </Modal>
              </>
            ) : gridPointMode === 'stackPoint' ? (
              <>
                {/* Stack picker button */}
                <TouchableOpacity
                  style={[ms.subRow, { marginBottom: 4 }]}
                  onPress={() => setStackPickerOpen(true)}
                  activeOpacity={0.7}
                >
                  <View style={ms.subRowLeft}>
                    <Text style={ms.subRowLabel}>Stack</Text>
                    <Text style={ms.subRowValue}>
                      {stacks.find(s => s.id === draft!.stackPoint?.stackId)?.name ?? 'Select stack…'}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={colors.borderStrong} />
                </TouchableOpacity>

                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INDEX</Text>
                <ExpressionInput
                  style={ms.input}
                  fieldKey="stackIndex"
                  value={draft!.stackPoint?.index}
                  expressions={draft!.expressions}
                  onChangeValue={v => set({ stackPoint: { ...(draft!.stackPoint ?? { stackId: '' }), index: v ?? 0 } })}
                  onChangeExpr={setExpr}
                  variables={variables}
                />
                <Text style={ms.hintText}>Wraps via modulo when the stack has a max count set.</Text>

                {/* Stack picker modal */}
                <Modal visible={stackPickerOpen} transparent animationType="fade" onRequestClose={() => setStackPickerOpen(false)}>
                  <Pressable style={ms.overlay} onPress={() => setStackPickerOpen(false)}>
                    <Pressable style={ms.card} onPress={() => {}}>
                      <View style={ms.header}>
                        <Text style={ms.title}>Select Stack</Text>
                        <TouchableOpacity onPress={() => setStackPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                          <X size={18} color={colors.textFaint} />
                        </TouchableOpacity>
                      </View>
                      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                        {stacks.length === 0 && <Text style={ms.emptyHint}>No stacks defined yet.</Text>}
                        {stacks.map((s, i) => {
                          const active = draft!.stackPoint?.stackId === s.id;
                          return (
                            <TouchableOpacity
                              key={s.id}
                              style={[ms.row, i < stacks.length - 1 && ms.rowBorder, active && ms.rowActive]}
                              onPress={() => {
                                set({ stackPoint: { ...(draft!.stackPoint ?? { index: 0 }), stackId: s.id } });
                                setStackPickerOpen(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={[ms.radioRing, active && ms.radioRingActive]}>
                                {active && <View style={ms.radioDot} />}
                              </View>
                              <View style={ms.rowText}>
                                <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{s.name}</Text>
                                <Text style={ms.rowDesc}>
                                  Base: {s.basePointName}
                                  {s.maxCount != null ? `  ·  max ${s.maxCount}` : ""}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </Pressable>
                  </Pressable>
                </Modal>
              </>
            ) : (
              (() => {
                // Images are the one kind that can't contribute to a target.
                const targetVars = (variables ?? []).filter(v => !v.isImage);
                const expr       = draft!.pointNameExpr ?? "";
                // Mirrors the executor: an indexed points variable on its own is already a
                // coordinate; everything else resolves to text naming a saved point.
                const ptMatch    = /^\{?\s*\$(\w+)\s*\[([^\]]*)\]\s*\}?$/.exec(expr.trim());
                const asPoints   = ptMatch && targetVars.some(v => isPointListVariable(v) && v.name === ptMatch[1]);
                return (
                  <>
                    <Text style={ms.fieldLabel}>POINT EXPRESSION</Text>
                    <TemplateInput
                      style={ms.input}
                      value={expr}
                      onChange={v => set({ pointNameExpr: v || undefined })}
                      placeholder="$target  ·  $pointsList[$index]  ·  {$binPrefix}{$index}"
                      variables={targetVars}
                      insertToken={v => isPointListVariable(v) ? `$${v.name}[0]` : `{$${v.name}}`}
                      create={{ type: "string" }}
                      onCreateVariable={onSaveVariable} allVariables={variables}
                    />

                    {expr.trim().length > 0 && (
                      <Text style={[ms.hintText, { marginTop: 8, fontWeight: "700", color: asPoints ? accents.cyan : accents.purple }]}>
                        {asPoints
                          ? `Coordinates from element ${ptMatch![2].trim() || "0"} of $${ptMatch![1]}.`
                          : "Resolves to text, then matched against your saved points by name."}
                      </Text>
                    )}

                    <Text style={[ms.hintText, { marginTop: 8 }]}>
                      Re-resolved every time the step runs, so assigning the variables retargets the move.
                      A <Text style={{ fontWeight: "700" }}>Points</Text> variable indexed on its own —{" "}
                      <Text style={{ fontWeight: "700" }}>{"$pointsList[$index]"}</Text> — moves straight to those
                      coordinates. Anything else builds a saved point&apos;s <Text style={{ fontWeight: "700" }}>name</Text>:{" "}
                      a <Text style={{ fontWeight: "700" }}>String</Text> variable like{" "}
                      <Text style={{ fontWeight: "700" }}>$target</Text>, or pieces joined with braces, as{" "}
                      <Text style={{ fontWeight: "700" }}>{"bin{$i + 1}"}</Text> → <Text style={{ fontWeight: "700" }}>bin3</Text>.
                      The program errors if a name doesn&apos;t match a saved point.
                    </Text>
                  </>
                );
              })()
            )}
          </>
        );
      }

      case "speed":
        return (
          <>
            <Text style={ms.hintText}>Leave blank to use the robot's current speed setting.</Text>
            <Text style={[ms.fieldLabel, { marginTop: 10 }]}>SPEED  (mm/s)</Text>
            <ExpressionInput style={ms.input} fieldKey="speed"
              value={draft!.speed} expressions={draft!.expressions}
              onChangeValue={v => set({ speed: v })} onChangeExpr={setExpr} variables={variables}
              allowUndefined placeholder="default" />
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  (mm/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="accel"
                  value={draft!.accel} expressions={draft!.expressions}
                  onChangeValue={v => set({ accel: v })} onChangeExpr={setExpr} variables={variables}
                  allowUndefined placeholder="default" />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>DECEL  (mm/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="decel"
                  value={draft!.decel} expressions={draft!.expressions}
                  onChangeValue={v => set({ decel: v })} onChangeExpr={setExpr} variables={variables}
                  allowUndefined placeholder="default" />
              </View>
            </View>
          </>
        );

      case "jumpHeight":
        return (
          <>
            <Text style={ms.hintText}>
              The robot lifts to the Start Z, transits to the target, then lowers to End Z before descending to the final position.
              Set only Jump Z to use the same height for both legs.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 10 }]}>JUMP Z  (mm)</Text>
            <ExpressionInput style={ms.input} fieldKey="jumpZ"
              value={draft!.jumpZ} expressions={draft!.expressions}
              onChangeValue={v => set({ jumpZ: v })} onChangeExpr={setExpr} variables={variables}
              allowUndefined placeholder="required" />
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>START Z OVERRIDE  (mm)</Text>
                <ExpressionInput style={ms.input} fieldKey="jumpZStart"
                  value={draft!.jumpZStart} expressions={draft!.expressions}
                  onChangeValue={v => set({ jumpZStart: v })} onChangeExpr={setExpr} variables={variables}
                  allowUndefined placeholder="same as Jump Z" />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>END Z OVERRIDE  (mm)</Text>
                <ExpressionInput style={ms.input} fieldKey="jumpZEnd"
                  value={draft!.jumpZEnd} expressions={draft!.expressions}
                  onChangeValue={v => set({ jumpZEnd: v })} onChangeExpr={setExpr} variables={variables}
                  allowUndefined placeholder="same as Jump Z" />
              </View>
            </View>
          </>
        );

      case "posOffset":
        return (
          <Axes6Fields prefix="offset" step={draft!} set={set} setExpr={setExpr} variables={variables}
            rzOnly={rzOnly} clearLabel="Clear offset" />
        );

      case "toolOffset":
        return (
          <Axes6Fields prefix="toolOffset" step={draft!} set={set} setExpr={setExpr} variables={variables}
            rzOnly={rzOnly} clearLabel="Clear offset" />
        );

      case "posOverride":
        return (
          <>
            <Text style={[ms.hintText, { marginBottom: 12 }]}>
              When set, locks that axis to the exact value regardless of the target point or offsets.
              Leave blank to use the calculated value.
            </Text>
            <Axes6Fields prefix="override" step={draft!} set={set} setExpr={setExpr} variables={variables}
              rzOnly={rzOnly} allowUndefined placeholder="not set" clearLabel="Clear all overrides" />
          </>
        );

      default:
        return null;
    }
  }

  // ── Main body (non-move steps stay inline) ────────────────────────────────

  function renderMainBody() {
    switch (draft!.type) {
      case "MoveL":
      case "MoveJ": {
        return (
          <>
            <TouchableOpacity style={ms.modRow} onPress={() => openSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color={colors.borderStrong} />
            </TouchableOpacity>
            {modifierRow("Override Speed",    speedSet,    speedSummary,    "speed",       speedKeys)}
            {modifierRow("Position Offset",   hasOffset,   offsetSummary,   "posOffset",   offsetKeys)}
            {modifierRow("Position Override", hasOverride, overrideSummary, "posOverride", overrideKeys)}
            {modifierRow("Tool Offset",       hasToolOff,  toolOffSummary,  "toolOffset",  toolOffKeys)}

            {/* Opening from the "Add" row turns the flag on; the sub-page edits the radius. */}
            {draft!.type === "MoveL" &&
              modifierRow("Blend Into Next Move", !!draft!.blend, blendSummary, "blend", blendKeys, { blend: true })}
            {moveStopRow()}
          </>
        );
      }

      case "JumpL":
      case "JumpJ": {
        const jumpHeightLabel = (() => {
          if (draft!.jumpZStart != null || draft!.jumpZEnd != null) {
            const s = draft!.jumpZStart != null ? `Start: ${draft!.jumpZStart} mm` : null;
            const e = draft!.jumpZEnd   != null ? `End: ${draft!.jumpZEnd} mm`     : null;
            return [s, e].filter(Boolean).join("  ·  ");
          }
          return draft!.jumpZ != null ? `${draft!.jumpZ} mm` : "Not set";
        })();
        return (
          <>
            <TouchableOpacity style={ms.modRow} onPress={() => openSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color={colors.borderStrong} />
            </TouchableOpacity>
            <TouchableOpacity style={ms.modRow} onPress={() => openSubPage("jumpHeight")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Jump Height</Text>
                <Text style={ms.subRowValue}>{jumpHeightLabel}</Text>
              </View>
              <ChevronRight size={16} color={colors.borderStrong} />
            </TouchableOpacity>
            {modifierRow("Override Speed",    speedSet,    speedSummary,    "speed",       speedKeys)}
            {modifierRow("Position Offset",   hasOffset,   offsetSummary,   "posOffset",   offsetKeys)}
            {modifierRow("Position Override", hasOverride, overrideSummary, "posOverride", overrideKeys)}
            {modifierRow("Tool Offset",       hasToolOff,  toolOffSummary,  "toolOffset",  toolOffKeys)}

            {draft!.type === "JumpL" &&
              modifierRow("Blend Apex Corners", !!draft!.blend, blendSummary, "blend", blendKeys, { blend: true })}
            {moveStopRow()}
          </>
        );
      }

      case "Tare":
      case "ReadLoadCell": {
        const lcIoDevices = ioDevices ?? [];
        const nid = draft!.loadCellDeviceId
          ?? lcIoDevices.find(n => (n.pins ?? []).some(p => p.type === "LoadCell"))?.id
          ?? lcIoDevices[0]?.id;
        const lcPins = (lcIoDevices.find(n => n.id === nid)?.pins ?? []).filter(p => p.type === "LoadCell");
        const isRead = draft!.type === "ReadLoadCell";
        // A weight is a number: no lists, strings, images, stopwatches or booleans.
        const numVars = (variables ?? []).filter(v => !isListVariable(v) && !v.isString && !v.isImage && !v.isStopwatch && !v.isBoolean);
        const unit = draft!.loadCellUnit ?? "g";
        return (
          <>
            {lcIoDevices.length > 1 && (
              <>
                <Text style={ms.fieldLabel}>NANO DEVICE</Text>
                <View style={ms.segRow}>
                  {lcIoDevices.map(n => {
                    const active = nid === n.id;
                    return (
                      <TouchableOpacity key={n.id} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                        onPress={() => set({ loadCellDeviceId: n.id, loadCellPin: undefined })} activeOpacity={0.8}>
                        <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{n.name || n.id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>LOAD CELL</Text>
            {lcPins.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.textFaint, marginTop: 4 }}>No load cells configured on this Nano — add one on the I/O page.</Text>
            ) : (
              <View style={ms.segRow}>
                {lcPins.map(p => {
                  const active = draft!.loadCellPin === p.pin;
                  return (
                    <TouchableOpacity key={p.pin} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                      onPress={() => set({ loadCellDeviceId: nid, loadCellPin: p.pin })} activeOpacity={0.8}>
                      <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{p.name || `Pin ${p.pin}`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {!isRead && (
              <Text style={[ms.hintText, { marginTop: 8 }]}>Zeros the selected load cell (sets its current reading to 0).</Text>
            )}
            {isRead && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>UNIT</Text>
                <View style={ms.segRow}>
                  {(["g", "kg", "oz", "lb", "N"] as const).map(u => {
                    const active = unit === u;
                    return (
                      <TouchableOpacity key={u} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                        onPress={() => set({ loadCellUnit: u })} activeOpacity={0.8}>
                        <Text style={[ms.segText, active && ms.segTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <VarSelectorButton
                  label="STORE IN VARIABLE"
                  value={draft!.variableName}
                  accent={accents.purple}
                  placeholder="None — tap to select"
                  onPress={() => setLoadCellVarPicker(true)}
                />
                <VarPickerModal
                  filter={isAssignableVariable}
                  visible={loadCellVarPicker}
                  onClose={() => setLoadCellVarPicker(false)}
                  variables={numVars}
                  selected={draft!.variableName}
                  onSelect={v => { if (v) set({ variableName: v.name }); setLoadCellVarPicker(false); }}
                  title="Store In Variable"
                  create={{ type: "number" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />
                <Text style={[ms.hintText, { marginTop: 8 }]}>
                  {`Reads the load cell weight (in ${unit}) into $${draft!.variableName ?? "the variable"} each time this step runs.`}
                </Text>
              </>
            )}
          </>
        );
      }
      case "StartRecording":
      case "StopRecording": {
        const lcIoDevices = ioDevices ?? [];
        const nid = draft!.loadCellDeviceId
          ?? lcIoDevices.find(n => (n.pins ?? []).some(p => p.type === "LoadCell"))?.id
          ?? lcIoDevices[0]?.id;
        const lcPins = (lcIoDevices.find(n => n.id === nid)?.pins ?? []).filter(p => p.type === "LoadCell");
        const isStart = draft!.type === "StartRecording";
        // Stop Recording fills the target with {t, v, r} records, so only an object list fits.
        const recVars = (variables ?? []).filter(isRecordListVariable);
        return (
          <>
            {lcIoDevices.length > 1 && (
              <>
                <Text style={ms.fieldLabel}>NANO DEVICE</Text>
                <View style={ms.segRow}>
                  {lcIoDevices.map(n => {
                    const active = nid === n.id;
                    return (
                      <TouchableOpacity key={n.id} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                        onPress={() => set({ loadCellDeviceId: n.id, loadCellPin: undefined })} activeOpacity={0.8}>
                        <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{n.name || n.id}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>LOAD CELL</Text>
            {lcPins.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.textFaint, marginTop: 4 }}>No load cells configured on this Nano — add one on the I/O page.</Text>
            ) : (
              <View style={ms.segRow}>
                {lcPins.map(p => {
                  const active = draft!.loadCellPin === p.pin;
                  return (
                    <TouchableOpacity key={p.pin} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                      onPress={() => set({ loadCellDeviceId: nid, loadCellPin: p.pin })} activeOpacity={0.8}>
                      <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{p.name || `Pin ${p.pin}`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {isStart ? (
              <>
                <VarSelectorButton
                  label="STORE INTO LIST VARIABLE"
                  value={draft!.recordVariableName}
                  accent={accents.cyan}
                  placeholder="None — tap to select"
                  onPress={() => setRecordVarPicker(true)}
                />
                <VarPickerModal
                  filter={isAssignableVariable}
                  visible={recordVarPicker}
                  onClose={() => setRecordVarPicker(false)}
                  variables={recVars}
                  selected={draft!.recordVariableName}
                  onSelect={v => { if (v) set({ recordVariableName: v.name }); setRecordVarPicker(false); }}
                  title="Store Into List Variable"
                  create={{ type: "list", elementType: "Record" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />
                <Text style={[ms.hintText, { marginTop: 8 }]}>
                  {`Captures every sample while recording; Stop Recording fills $${draft!.recordVariableName ?? "the variable"} with a list of {t, v, r} records.`}
                </Text>
              </>
            ) : (
              <Text style={[ms.hintText, { marginTop: 8 }]}>
                Stops the recording for this load cell and stores the captured samples into its list variable.
              </Text>
            )}
          </>
        );
      }
      case "ExportData": {
        const cols = draft!.exportColumns ?? [];
        const setCols = (rows: JsonKeyValue[]) => set({ exportColumns: rows.length ? rows : undefined });
        const fmt = (draft!.exportFormat ?? "csv").toLowerCase();
        const accentEx = "#0f766e";
        const exNumericVars = (variables ?? []).filter(v => !isListVariable(v) && !v.isString && !v.isImage);
        const exListVars    = (variables ?? []).filter(v => isListVariable(v));
        const exStringVars  = (variables ?? []).filter(v => v.isString === true);
        const exImageVars   = (variables ?? []).filter(v => v.isImage === true);
        const exAllVars     = [...exListVars, ...exNumericVars, ...exStringVars, ...exImageVars];
        return (
          <>
            <Text style={ms.hintText}>
              Write one or more variables to a file on the controller. A list variable becomes rows (CSV) or a JSON array.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>FORMAT</Text>
            <View style={ms.segRow}>
              {(["csv", "json"] as const).map(f => {
                const active = fmt === f;
                return (
                  <TouchableOpacity key={f} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ exportFormat: f })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{f.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>FILE PATH</Text>
            <TemplateInput
              value={draft!.exportPath ?? ""}
              onChange={v => set({ exportPath: v })}
              placeholder={fmt === "json" ? "exports/$time_ms.json" : "exports/$time_ms.csv"}
              style={ms.input}
              accent={accentEx}
              variables={variables}
              quickTokens={["$time_ms"]}
              create={{ type: "string" }} onCreateVariable={onSaveVariable} allVariables={variables}
            />
            <Text style={[ms.hintText, { marginTop: 6 }]}>
              Saved on the controller. $variable and $time_ms are filled in; relative paths are under the controller app folder (folders auto-created).
            </Text>

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>{fmt === "json" ? "FIELDS" : "COLUMNS"}</Text>
            <View style={{ borderLeftWidth: 3, borderLeftColor: accentEx, backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              {cols.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingVertical: 8, fontSize: 13, color: colors.textFaint, fontStyle: "italic" }}>
                  (no columns yet — add a variable)
                </Text>
              )}
              {cols.map((row, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingLeft: 12, paddingRight: 6, paddingVertical: 5 }}>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: "#0f172a", paddingHorizontal: 4, paddingVertical: 2, minWidth: 20 }}
                    value={row.key}
                    onChangeText={v => { const next = [...cols]; next[i] = { ...row, key: v }; setCols(next); }}
                    placeholder="column"
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="none"
                  />
                  <Text style={{ fontSize: 14, color: "#64748b", marginHorizontal: 5 }}>←</Text>
                  {row.listVar || row.imageVar ? (
                    <TouchableOpacity
                      style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 30 }}
                      onPress={() => setExportColumnPicker(i)} activeOpacity={0.75}>
                      {row.listVar ? <List size={12} color={accentEx} /> : <Camera size={12} color={accentEx} />}
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: accents.purple }} numberOfLines={1}>${row.listVar ?? row.imageVar}</Text>
                      {row.listVar && <Text style={{ fontSize: 11, color: "#94a3b8" }}>[ ]</Text>}
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TextInput
                        style={{ flex: 2, fontSize: 14, color: accents.purple, paddingHorizontal: 1, paddingVertical: 2, minWidth: 30 }}
                        value={row.expr}
                        onChangeText={v => { const next = [...cols]; next[i] = { ...row, expr: v }; setCols(next); }}
                        placeholder="$var or expr"
                        placeholderTextColor={colors.textFaint}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity onPress={() => setExportColumnPicker(i)} hitSlop={8} style={{ padding: 5 }} activeOpacity={0.7}>
                        <Search size={13} color="#94a3b8" />
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity onPress={() => setCols(cols.filter((_, j) => j !== i))} hitSlop={8} style={{ padding: 5 }}>
                    <Minus size={13} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingLeft: 12, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setCols([...cols, { key: "", expr: "" }])} activeOpacity={0.7}>
                <Plus size={12} color={colors.textFaint} />
                <Text style={{ fontSize: 12, color: colors.textFaint }}>add column</Text>
              </TouchableOpacity>
            </View>
            <Text style={[ms.hintText, { marginTop: 6 }]}>
              Each column maps a name to a variable or expression. A record list (like a recording) expands to its fields; multiple lists line up row-by-row.
            </Text>

            <VarPickerModal
              visible={exportColumnPicker !== null}
              title="Select Variable"
              variables={exAllVars}
              selected={exportColumnPicker !== null
                ? (cols[exportColumnPicker]?.listVar ?? cols[exportColumnPicker]?.imageVar ?? undefined)
                : undefined}
              onSelect={v => {
                if (exportColumnPicker === null || !v) return;
                const next = [...cols];
                const row = next[exportColumnPicker];
                const key = row.key || v.name;
                if (isListVariable(v)) next[exportColumnPicker] = { ...row, key, listVar: v.name, imageVar: undefined, expr: "" };
                else if (v.isImage) next[exportColumnPicker] = { ...row, key, imageVar: v.name, listVar: undefined, expr: "" };
                else next[exportColumnPicker] = { ...row, key, listVar: undefined, imageVar: undefined, expr: `$${v.name}` };
                setCols(next);
                setExportColumnPicker(null);
              }}
              onClose={() => setExportColumnPicker(null)}
              create={{ type: "list" }}
              onCreateVariable={onSaveVariable} allVariables={variables}
            />
          </>
        );
      }
      case "SetOutput": {
        const selectedCard = draft!.outputCard ?? "stb";
        const outputPins = selectedCard === "io"
          ? (ioDevices ?? []).flatMap(n => (n.pins ?? []).filter(p => p.type === "Output"))
          : [];
        return (
          <>
            <Text style={ms.fieldLabel}>CARD</Text>
            <View style={ms.segRow}>
              {([
                { key: "stb",   label: "STB4100", Icon: CircuitBoard, color: colors.success, enabled: ioConfig?.enableStbCard   ?? true  },
                { key: "relay", label: "Relay",   Icon: Radio,        color: "#0891b2", enabled: ioConfig?.enableRelayCard  ?? false },
                { key: "io",  label: "IO Device",    Icon: Cpu,          color: "#4f46e5", enabled: ioConfig?.enableIoDevices  ?? true  },
              ] as const).filter(c => c.enabled).map(({ key, label, Icon, color }) => {
                const active = selectedCard === key;
                return (
                  <TouchableOpacity key={key} style={[ms.seg, active && ms.segActive, { flex: 1, flexDirection: "column", alignItems: "center", gap: 2, paddingVertical: 6 }]}
                    onPress={() => set({
                      outputCard: key,
                      outputNumber: 1,
                      outputDeviceId:   key === "io"  ? (ioDevices?.[0]?.id ?? undefined) : undefined,
                    })}
                    activeOpacity={0.8}>
                    <Icon size={14} color={active ? color : colors.textMuted} />
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedCard === "stb" && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OUTPUT NUMBER</Text>
                <View style={ms.segRow}>
                  {[1, 2, 3, 4].map(n => {
                    const active = (draft!.outputNumber ?? 1) === n;
                    return (
                      <TouchableOpacity key={n} style={[ms.seg, active && ms.segActive]}
                        onPress={() => set({ outputNumber: n })} activeOpacity={0.8}>
                        <Text style={[ms.segText, active && ms.segTextActive]}>{n}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {selectedCard === "relay" && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>RELAY</Text>
                <View style={ms.segRow}>
                  {[1, 2, 3, 4].map(n => {
                    const active = (draft!.outputNumber ?? 1) === n;
                    const label  = relay?.names?.[n - 1] ?? `Relay ${n}`;
                    return (
                      <TouchableOpacity key={n} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                        onPress={() => set({ outputNumber: n })} activeOpacity={0.8}>
                        <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {selectedCard === "io" && (
              <>
                {(ioDevices ?? []).length > 1 && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 12 }]}>NANO DEVICE</Text>
                    <View style={ms.segRow}>
                      {(ioDevices ?? []).map(n => {
                        const active = (draft!.outputDeviceId ?? ioDevices?.[0]?.id) === n.id;
                        return (
                          <TouchableOpacity key={n.id} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                            onPress={() => set({ outputDeviceId: n.id, outputNumber: 1 })} activeOpacity={0.8}>
                            <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{n.name || n.id}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OUTPUT PIN</Text>
                {outputPins.length === 0 ? (
                  <Text style={{ fontSize: 13, color: colors.textFaint, marginTop: 4 }}>No output pins configured on this Nano</Text>
                ) : (
                  <View style={ms.segRow}>
                    {outputPins.map(p => {
                      const active = (draft!.outputNumber ?? outputPins[0]?.pin) === p.pin;
                      return (
                        <TouchableOpacity key={p.pin} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                          onPress={() => set({ outputNumber: p.pin })} activeOpacity={0.8}>
                          <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{p.name || `Pin ${p.pin}`}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ACTION</Text>
            <View style={ms.segRow}>
              {(["set", "toggle"] as const).map(a => {
                const active = (draft!.outputAction ?? "set") === a;
                return (
                  <TouchableOpacity key={a} style={[ms.seg, active && ms.segActive, { flex: 1 }]} activeOpacity={0.8}
                    onPress={() => set({ outputAction: a === "set" ? undefined : a, ...(a === "toggle" ? { pulseMs: undefined, pulseBlocking: undefined } : {}) })}
                    accessibilityRole="button" accessibilityLabel={a === "set" ? "Set the output" : "Toggle the output"}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{a === "set" ? "Set" : "Toggle"}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {draft!.outputAction === "toggle" ? (
              <Text style={ms.hintText}>Flips the output: on becomes off, off becomes on.</Text>
            ) : (
            <>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE</Text>
            {draft!.expressions?.outputValue != null ? (
              <>
                <ExpressionField
                  value={draft!.expressions.outputValue}
                  onChange={t => setExpr("outputValue", t.trim() ? t : undefined)}
                  title="Output value"
                  placeholder="$count > 3"
                  variables={variables}
                  contextVariables={contextVariables}
                  style={ms.input}
                />
                <Text style={ms.hintText}>On when the expression is non-zero (true), off when it is 0. Clear it to pick on or off.</Text>
              </>
            ) : (
              <>
                <View style={ms.switchRow}>
                  <Text style={ms.switchLabel}>{draft!.outputValue ? "ON" : "OFF"}</Text>
                  <Switch value={draft!.outputValue ?? false} onValueChange={v => set({ outputValue: v })}
                    trackColor={{ false: colors.border, true: colors.accent }} />
                </View>
                <TouchableOpacity onPress={() => setExpr("outputValue", draft!.outputValue ? "1" : "0")} activeOpacity={0.7}
                  style={{ marginTop: 6 }} accessibilityRole="button" accessibilityLabel="Use an expression for the value">
                  <Text style={{ fontSize: 12, fontWeight: "600", color: accents.purple }}>fx  Use an expression</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>PULSE</Text>
            <View style={ms.switchRow}>
              <Text style={ms.switchLabel}>
                {(draft!.pulseMs ?? 0) > 0 ? `${draft!.pulseMs} ms then ${draft!.outputValue ? "OFF" : "ON"}` : "Off  (hold state)"}
              </Text>
              <Switch
                value={(draft!.pulseMs ?? 0) > 0}
                onValueChange={v => {
                  const ms = v ? 500 : 0;
                  set({ pulseMs: ms > 0 ? ms : undefined });
                  setPulseMs(v ? "500" : "");
                }}
                trackColor={{ false: colors.border, true: "#f59e0b" }}
              />
            </View>
            {(draft!.pulseMs ?? 0) > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>PULSE DURATION  (ms)</Text>
                <View style={[ms.input, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: colors.text }}
                    value={pulseMsText}
                    onChangeText={v => {
                      if (v === "" || /^\d+$/.test(v)) {
                        setPulseMs(v);
                        const n = parseInt(v, 10);
                        set({ pulseMs: isNaN(n) || n <= 0 ? undefined : n });
                      }
                    }}
                    keyboardType="numeric"
                    selectTextOnFocus
                    placeholder="500"
                    placeholderTextColor="#c4c4c4"
                  />
                  <Text style={{ fontSize: 12, color: colors.textFaint, paddingLeft: 6 }}>ms</Text>
                </View>
                <View style={[ms.switchRow, { marginTop: 10 }]}>
                  <Text style={ms.switchLabel}>Block until pulse completes</Text>
                  <Switch
                    value={draft!.pulseBlocking ?? false}
                    onValueChange={v => set({ pulseBlocking: v || undefined })}
                    trackColor={{ false: colors.border, true: "#7c3aed" }}
                  />
                </View>
                <Text style={ms.hintText}>
                  Output goes {draft!.outputValue ? "ON" : "OFF"} immediately, then flips {draft!.outputValue ? "OFF" : "ON"} after the pulse.{" "}
                  {draft!.pulseBlocking ? "Program waits for the pulse to complete before continuing." : "Program continues without waiting."}
                </Text>
              </>
            )}
            </>
            )}
          </>
        );
      }

      case "Wait": {
        const waitMode  = draft!.waitMode ?? 'duration';
        const waitCond  = draft!.waitCondition ?? { combinator: 'ALL' as const, items: [] };
        const scalarVars = (variables ?? []).filter(v => !isListVariable(v) && !v.isStopwatch);
        return (
          <>
            <Text style={ms.fieldLabel}>MODE</Text>
            <View style={ms.segRow}>
              {(['duration', 'condition'] as const).map(m => (
                <TouchableOpacity key={m} style={[ms.seg, waitMode === m && ms.segActive, { flex: 1 }]}
                  onPress={() => set({ waitMode: m })} activeOpacity={0.8}>
                  <Text style={[ms.segText, waitMode === m && ms.segTextActive]}>{m === 'duration' ? 'Duration' : 'Condition'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {waitMode === 'duration' ? (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DURATION  (ms)</Text>
                <ExpressionInput style={ms.input} fieldKey="waitMs"
                  value={draft!.waitMs} expressions={draft!.expressions}
                  onChangeValue={v => set({ waitMs: v !== undefined ? Math.round(v) : undefined })}
                  onChangeExpr={setExpr} variables={variables} />
              </>
            ) : (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>WAIT UNTIL</Text>
                <ConditionGroupEditor
                  group={waitCond}
                  onChange={g => set({ waitCondition: g })}
                  variables={variables}
                  contextVariables={contextVariables}
                />
                <Text style={[ms.fieldLabel, { marginTop: 14 }]}>MAX TIMEOUT  (ms, 0 = no limit)</Text>
                <TextInput
                  style={ms.input}
                  value={draft!.waitTimeoutMs != null ? String(draft!.waitTimeoutMs) : ""}
                  onChangeText={t => set({ waitTimeoutMs: t ? (parseInt(t) || undefined) : undefined })}
                  keyboardType="numeric" placeholder="0" placeholderTextColor="#c4c4c4"
                  returnKeyType="done" selectTextOnFocus
                />
                <Text style={[ms.fieldLabel, { marginTop: 14 }]}>TIMEOUT FLAG VARIABLE  (optional)</Text>
                <Text style={ms.hintText}>Set to 1 if timed out, 0 if condition was met. Leave blank to ignore.</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Text style={{ fontSize: 13, color: accents.purple, fontWeight: "600", marginRight: 6 }}>$</Text>
                  <TouchableOpacity
                    style={[ms.input, { flex: 1, justifyContent: "center" }]}
                    onPress={() => setWaitTimeoutVarPicker(true)} activeOpacity={0.7}>
                    <Text style={{ color: draft!.waitTimeoutVariableName ? colors.text : colors.textFaint, fontSize: 14 }}>
                      {draft!.waitTimeoutVariableName ?? "none"}
                    </Text>
                  </TouchableOpacity>
                  {draft!.waitTimeoutVariableName && (
                    <TouchableOpacity onPress={() => set({ waitTimeoutVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                      <X size={14} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
                <VarPickerModal
                  filter={isAssignableVariable}
                  visible={waitTimeoutVarPicker}
                  onClose={() => setWaitTimeoutVarPicker(false)}
                  variables={scalarVars}
                  selected={draft!.waitTimeoutVariableName}
                  onSelect={v => { set({ waitTimeoutVariableName: v?.name }); setWaitTimeoutVarPicker(false); }}
                  title="Timeout Flag Variable"
                  showNone
                  create={{ type: "boolean" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />
                {catalogFields({ only: ["waitTimeoutAction"], grouped: false })}
                <Text style={ms.hintText}>
                  {draft!.waitTimeoutAction === "error"
                    ? "A timeout is an error (code waitTimeout): an enclosing Try can catch it, otherwise the program stops."
                    : "On a timeout the program carries on with the next step."}
                </Text>
              </>
            )}
          </>
        );
      }

      case "Loop": {
        const loopMode = draft!.loopMode ?? 'count';
        const loopSourceVars = (variables ?? []).filter(isListVariable);
        const scalarVarsLoop = (variables ?? []).filter(v => !isListVariable(v) && !v.isStopwatch);
        // Number and boolean elements are values in their own right, so the executor can hand
        // one to the value variable. Anything else only gets the index — see the hint below.
        const forEachSourceIsScalar = loopSourceVars.some(
          v => v.name === draft!.forEachVariableName && isScalarListVariable(v));
        const whileCond = draft!.loopWhileCondition ?? { combinator: 'ALL' as const, items: [] };
        return (
          <>
            <Text style={ms.fieldLabel}>MODE</Text>
            <View style={ms.segRow}>
              {(['count', 'forEach', 'while'] as const).map(m => (
                <TouchableOpacity key={m} style={[ms.seg, loopMode === m && ms.segActive, { flex: 1 }]}
                  onPress={() => set({ loopMode: m })} activeOpacity={0.8}>
                  <Text style={[ms.segText, loopMode === m && ms.segTextActive]}>
                    {m === 'count' ? 'Count' : m === 'forEach' ? 'For Each' : 'While'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loopMode === 'count' ? (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>REPEAT COUNT  (0 = infinite)</Text>
                <ExpressionInput style={ms.input} fieldKey="loopCount"
                  value={draft!.loopCount ?? 1} expressions={draft!.expressions}
                  onChangeValue={v => set({ loopCount: v !== undefined ? Math.round(v) : 1 })}
                  onChangeExpr={setExpr} variables={variables} />
                <Text style={[ms.fieldLabel, { marginTop: 14 }]}>INDEX VARIABLE  (optional)</Text>
                <Text style={ms.hintText}>Set to the current iteration number (0-based).</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Text style={{ fontSize: 13, color: accents.purple, fontWeight: "600", marginRight: 6 }}>$</Text>
                  <TouchableOpacity
                    style={[ms.input, { flex: 1, justifyContent: "center" }]}
                    onPress={() => setLoopIndexVarPicker(true)} activeOpacity={0.7}>
                    <Text style={{ color: draft!.forEachIndexVariableName ? colors.text : colors.textFaint, fontSize: 14 }}>
                      {draft!.forEachIndexVariableName ?? "none"}
                    </Text>
                  </TouchableOpacity>
                  {draft!.forEachIndexVariableName && (
                    <TouchableOpacity onPress={() => set({ forEachIndexVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                      <X size={14} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
                <VarPickerModal
                  filter={isAssignableVariable}
                  visible={loopIndexVarPicker}
                  onClose={() => setLoopIndexVarPicker(false)}
                  variables={scalarVarsLoop}
                  selected={draft!.forEachIndexVariableName}
                  onSelect={v => { set({ forEachIndexVariableName: v?.name }); setLoopIndexVarPicker(false); }}
                  title="Index Variable"
                  showNone
                  create={{ type: "number" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />
              </>
            ) : loopMode === 'forEach' ? (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ITERATE OVER</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: accents.purple, fontWeight: "600", marginRight: 6 }}>$</Text>
                  <TouchableOpacity
                    style={[ms.input, { flex: 1, justifyContent: "center" }]}
                    onPress={() => setForEachSourcePicker(true)} activeOpacity={0.7}>
                    <Text style={{ color: draft!.forEachVariableName ? colors.text : colors.textFaint, fontSize: 14 }}>
                      {draft!.forEachVariableName ?? "select a list variable"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <VarPickerModal
                  visible={forEachSourcePicker}
                  onClose={() => setForEachSourcePicker(false)}
                  variables={loopSourceVars}
                  selected={draft!.forEachVariableName}
                  onSelect={v => { set({ forEachVariableName: v?.name }); setForEachSourcePicker(false); }}
                  title="Source Variable"
                  create={{ type: "list" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />

                <Text style={[ms.fieldLabel, { marginTop: 14 }]}>VALUE VARIABLE  (optional)</Text>
                {/* Mirrors the executor: only an element that is itself a value can be
                    handed over, so on a point or record list this receives the index. */}
                <Text style={ms.hintText}>
                  {forEachSourceIsScalar
                    ? "Receives the current element each iteration."
                    : "Receives the current index each iteration — a point or object element is not a number, so read it with $name[$i].field."}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Text style={{ fontSize: 13, color: accents.purple, fontWeight: "600", marginRight: 6 }}>$</Text>
                  <TouchableOpacity
                    style={[ms.input, { flex: 1, justifyContent: "center" }]}
                    onPress={() => setForEachValuePicker(true)} activeOpacity={0.7}>
                    <Text style={{ color: draft!.forEachValueVariableName ? colors.text : colors.textFaint, fontSize: 14 }}>
                      {draft!.forEachValueVariableName ?? "none"}
                    </Text>
                  </TouchableOpacity>
                  {draft!.forEachValueVariableName && (
                    <TouchableOpacity onPress={() => set({ forEachValueVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                      <X size={14} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
                <VarPickerModal
                  filter={isAssignableVariable}
                  visible={forEachValuePicker}
                  onClose={() => setForEachValuePicker(false)}
                  variables={scalarVarsLoop}
                  selected={draft!.forEachValueVariableName}
                  onSelect={v => { set({ forEachValueVariableName: v?.name }); setForEachValuePicker(false); }}
                  title="Value Variable"
                  showNone
                  create={{ type: "number" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />

                <Text style={[ms.fieldLabel, { marginTop: 14 }]}>INDEX VARIABLE  (optional)</Text>
                <Text style={ms.hintText}>Receives the current iteration index (0-based).</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <Text style={{ fontSize: 13, color: accents.purple, fontWeight: "600", marginRight: 6 }}>$</Text>
                  <TouchableOpacity
                    style={[ms.input, { flex: 1, justifyContent: "center" }]}
                    onPress={() => setLoopIndexVarPicker(true)} activeOpacity={0.7}>
                    <Text style={{ color: draft!.forEachIndexVariableName ? colors.text : colors.textFaint, fontSize: 14 }}>
                      {draft!.forEachIndexVariableName ?? "none"}
                    </Text>
                  </TouchableOpacity>
                  {draft!.forEachIndexVariableName && (
                    <TouchableOpacity onPress={() => set({ forEachIndexVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                      <X size={14} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
                <VarPickerModal
                  filter={isAssignableVariable}
                  visible={loopIndexVarPicker}
                  onClose={() => setLoopIndexVarPicker(false)}
                  variables={scalarVarsLoop}
                  selected={draft!.forEachIndexVariableName}
                  onSelect={v => { set({ forEachIndexVariableName: v?.name }); setLoopIndexVarPicker(false); }}
                  title="Index Variable"
                  showNone
                  create={{ type: "number" }}
                  onCreateVariable={onSaveVariable} allVariables={variables}
                />
              </>
            ) : null}
            {loopMode === 'while' && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>REPEAT WHILE</Text>
                <Text style={ms.hintText}>Loop body runs as long as condition is true. Exits when condition becomes false.</Text>
                <ConditionGroupEditor
                  group={whileCond}
                  onChange={g => set({ loopWhileCondition: g })}
                  variables={variables}
                  contextVariables={contextVariables}
                />
              </>
            )}
            <Text style={[ms.hintText, { marginTop: 10 }]}>Add steps inside this loop from the builder after saving.</Text>
          </>
        );
      }

      case "StatusUpdate": {
        const hasVars = (variables ?? []).length > 0;
        const severity: 'Info' | 'Warning' | 'Error' =
          draft!.statusSeverity ??
          (draft!.statusWarning ? 'Warning' : draft!.statusError ? 'Error' : 'Info');
        const msgField =
          severity === 'Warning' ? 'statusWarning' :
          severity === 'Error'   ? 'statusError'   : 'statusMessage';
        const msgValue = draft![msgField] ?? '';
        const SEVERITIES = [
          { key: 'Info'    as const, label: 'Info'    },
          { key: 'Warning' as const, label: 'Warning' },
          { key: 'Error'   as const, label: 'Error'   },
        ];
        return (
          <>
            <Text style={ms.fieldLabel}>SEVERITY</Text>
            <View style={ms.segRow}>
              {SEVERITIES.map(({ key, label }) => {
                const active = severity === key;
                const color =
                  key === 'Warning' ? colors.warning :
                  key === 'Error'   ? colors.danger : colors.textMuted;
                return (
                  <TouchableOpacity key={key} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => {
                      const cur = draft![msgField] ?? '';
                      const newField =
                        key === 'Warning' ? 'statusWarning' :
                        key === 'Error'   ? 'statusError'   : 'statusMessage';
                      set({
                        statusSeverity: key,
                        statusMessage: newField === 'statusMessage' ? (cur || undefined) : undefined,
                        statusWarning: newField === 'statusWarning' ? (cur || undefined) : undefined,
                        statusError:   newField === 'statusError'   ? (cur || undefined) : undefined,
                      });
                    }} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && { color }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MESSAGE</Text>
            <TemplateInput
              style={ms.input}
              value={msgValue}
              onChange={v => set({ [msgField]: v || undefined })}
              placeholder={hasVars ? "e.g. Processing item $i of $total…" : "e.g. Picking part from tray…"}
              variables={variables}
              autoCapitalize="sentences"
              autoFocus
              create={{ type: "number" }} onCreateVariable={onSaveVariable} allVariables={variables}
            />
            <Text style={[ms.hintText, { marginTop: 8 }]}>
              {hasVars ? "Use $varName to embed variable values." : "Appears in the monitor while this step runs."}
            </Text>
          </>
        );
      }

      case "CallRoutine":
        return (
          <>
            <Text style={ms.fieldLabel}>ROUTINE</Text>
            {routines.length === 0 && (
              <Text style={ms.emptyHint}>No routines saved yet. Create one below.</Text>
            )}
            {routines.map((r, i) => {
              // Match by id when the step has one, otherwise fall back to name (legacy steps).
              const active = draft!.routineId ? draft!.routineId === r.id : draft!.routineName === r.name;
              return (
                <TouchableOpacity
                  key={r.id ?? r.name}
                  style={[ms.row, (i < routines.length - 1 || !!onCreateRoutine) && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ routineId: r.id, routineName: r.name })}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{r.name}</Text>
                    {!!r.description && <Text style={ms.rowDesc}>{r.description}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
            {onCreateRoutine && (
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 4 }}
                onPress={onCreateRoutine}
                activeOpacity={0.7}
              >
                <Plus size={16} color="#7c3aed" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#7c3aed" }}>Create New Routine…</Text>
              </TouchableOpacity>
            )}
            <RoutineParamsSection
              step={draft!}
              routine={routines.find(r => draft!.routineId ? r.id === draft!.routineId : r.name === draft!.routineName)}
              set={set}
              variables={variables}
              contextVariables={contextVariables}
              onSaveVariable={onSaveVariable}
            />
          </>
        );

      case "RunVision":
        return (
          <RunVisionStepFields
            draft={draft!}
            set={set}
            visionPrograms={visionPrograms}
            cameras={cameraDevices}
            variables={variables}
            onSaveVariable={onSaveVariable}
            onOpenWizard={camId => { onSave(draft!); onClose(); openCalibrationWizard(camId); }}
          />
        );

      case "SetSpeedL":
      case "SetSpeedJ":
        return (
          <>
            <Text style={[ms.hintText, { marginTop: 0, marginBottom: 4 }]}>
              {draft!.type === "SetSpeedL"
                ? "Applies to every later linear (MoveL) move until it is changed again."
                : "Applies to every later joint (MoveJ) move until it is changed again."}
            </Text>
            {catalogFields()}
          </>
        );

      case "SetBlendRadius":
        return (
          <>
            <Text style={[ms.hintText, { marginTop: 0, marginBottom: 4 }]}>
              The corner radius later blended MoveL steps use. A move can still set its own radius.
            </Text>
            {catalogFields()}
          </>
        );

      case "SetVariable":
        return <SetVariableFields draft={draft!} variables={variables} contextVariables={contextVariables} set={set} onCreateVariable={onCreateVariable} onSaveVariable={onSaveVariable} />;

      case "Label": {
        const otherLabels = (scopeSteps ?? [])
          .filter(s => s.type === "Label" && s.id !== draft!.id && s.labelName);
        const isDuplicate = !!draft!.labelName?.trim() &&
          otherLabels.some(s => s.labelName?.toLowerCase() === draft!.labelName?.trim().toLowerCase());
        return (
          <>
            <Text style={ms.hintText}>
              Give this marker a unique name. GoToLabel steps in this scope can jump back to it.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>LABEL NAME</Text>
            <TextInput
              style={[ms.input, isDuplicate && { borderColor: colors.danger, borderWidth: 1 }]}
              value={draft!.labelName ?? ""}
              onChangeText={v => set({ labelName: v || undefined })}
              placeholder="e.g. loop_start, retry…"
              placeholderTextColor={colors.textFaint}
              autoFocus
              autoCapitalize="none"
              returnKeyType="done"
            />
            {isDuplicate && (
              <Text style={ms.fieldError}>Another label in this scope already uses this name.</Text>
            )}
          </>
        );
      }

      case "GoToLabel": {
        const labelsInScope = (scopeSteps ?? [])
          .filter(s => s.type === "Label" && s.labelId && s.labelName);
        return (
          <>
            <Text style={ms.hintText}>
              Jumps to a Label in this scope. Can jump forward or backward — crossing into or out of a loop is not allowed.
            </Text>
            {labelsInScope.length === 0 && (
              <Text style={[ms.emptyHint, { marginTop: 12 }]}>
                No labels defined in this scope. Add a Label step first.
              </Text>
            )}
            {labelsInScope.length > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>JUMP TO</Text>
                {labelsInScope.map((s, i) => {
                  const active = draft!.labelId === s.labelId;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[ms.row, i < labelsInScope.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => set({ labelId: s.labelId, labelName: s.labelName })}
                      activeOpacity={0.7}
                    >
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{s.labelName}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </>
        );
      }

      case "SetTool": {
        const allTools = tools ?? [];
        return (
          <>
            <Text style={ms.fieldLabel}>ACTIVE TOOL</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
              Select which tool TCP offset to activate for subsequent move steps.
            </Text>
            {[{ id: undefined as string | undefined, name: 'none', label: 'None (clear tool)' }, ...allTools.map(t => ({ id: t.id, name: t.name, label: t.name }))].map((t, i, arr) => {
              const isNone = t.name === 'none';
              // Match by stable id when the step carries one (rename-proof), else by name.
              const active = isNone
                ? !draft!.toolId && !draft!.toolName
                : (draft!.toolId ? draft!.toolId === t.id : draft!.toolName === t.name);
              return (
                <TouchableOpacity
                  key={t.id ?? t.name}
                  style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set(isNone ? { toolId: undefined, toolName: undefined } : { toolId: t.id, toolName: t.name })}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{t.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {allTools.length === 0 && (
              <Text style={[ms.emptyHint, { marginTop: 8 }]}>No tools defined. Add tools in the Space tab first.</Text>
            )}
          </>
        );
      }

      case "SetLocal": {
        const allLocals = locals ?? [];
        return (
          <>
            <Text style={ms.fieldLabel}>ACTIVE LOCAL</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
              Select which local coordinate frame to activate for subsequent move steps.
            </Text>
            {[{ id: undefined as string | undefined, name: 'none', label: 'None (clear local)' }, ...allLocals.map(l => ({ id: l.id, name: l.name, label: l.name }))].map((l, i, arr) => {
              const isNone = l.name === 'none';
              // Match by stable id when the step carries one (rename-proof), else by name.
              const active = isNone
                ? !draft!.localId && !draft!.localName
                : (draft!.localId ? draft!.localId === l.id : draft!.localName === l.name);
              return (
                <TouchableOpacity
                  key={l.id ?? l.name}
                  style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set(isNone ? { localId: undefined, localName: undefined } : { localId: l.id, localName: l.name })}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{l.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {allLocals.length === 0 && (
              <Text style={[ms.emptyHint, { marginTop: 8 }]}>No locals defined. Add locals in the Space tab first.</Text>
            )}
          </>
        );
      }

      case "ClearLocal":
        return (
          <Text style={ms.hintText}>
            Clears the active local coordinate frame — subsequent move steps will target world coordinates.
          </Text>
        );

      case "RunHoming":
        return (
          <Text style={ms.hintText}>
            Runs the full homing sequence and waits for it to complete before continuing to the next step.
            The robot must be in a safe position before homing begins.
          </Text>
        );

      case "SetJointPosition": {
        const JOINTS = [
          { i: 0, label: "Joint 1  —  J1 base / X" },
          { i: 1, label: "Joint 2  —  Horizontal / Y" },
          { i: 2, label: "Joint 3  —  Vertical / Z" },
          { i: 3, label: "Joint 4  —  J4 / RZ" },
        ];
        const sel = draft!.jointIndex ?? 0;
        return (
          <>
            <Text style={ms.hintText}>
              Declares a joint to be at a known value right now — no motion. Manually homes a single
              joint when its position is known: read off the mechanism, or supplied by a sensor via an
              expression. The robot counts as homed once every joint has been referenced.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>JOINT</Text>
            {JOINTS.map((j, i) => {
              const active = sel === j.i;
              return (
                <TouchableOpacity
                  key={j.i}
                  style={[ms.row, i < JOINTS.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ jointIndex: j.i })}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{j.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE  (deg or mm)</Text>
            <ExpressionInput style={ms.input} fieldKey="jointValue"
              value={draft!.jointValue} expressions={draft!.expressions}
              onChangeValue={v => set({ jointValue: v })} onChangeExpr={setExpr} variables={variables} />
            <Text style={ms.hintText}>Use 0 to zero the joint.</Text>
          </>
        );
      }

      case "ThreadMove": {
        const pitch = draft!.threadPitch;
        const pitchLabel = pitch != null
          ? (() => {
              const preset = THREAD_PRESETS.find(p => Math.abs(p.pitch - pitch) < 0.001);
              return preset ? preset.label : `${pitch} mm/rev`;
            })()
          : null;
        const distExpr  = draft!.expressions?.threadDistance;
        const pitchExpr = draft!.expressions?.threadPitch;
        const rotDeg    = pitch != null && draft!.threadDistance != null
          ? ((draft!.threadDistance / pitch) * 360).toFixed(1)
          : null;
        const peckOn = draft!.threadPeck ?? false;
        return (
          <>
            <Text style={[ms.fieldLabel, { marginTop: 0 }]}>DISTANCE  (mm)</Text>
            <ExpressionInput style={ms.input} fieldKey="threadDistance"
              value={draft!.threadDistance} expressions={draft!.expressions}
              onChangeValue={v => set({ threadDistance: v })} onChangeExpr={setExpr}
              placeholder="e.g. -10" variables={variables} />
            <Text style={ms.hintText}>
              Positive = move away from workpiece (+Z). Negative = drive in (-Z).
              The tool rotates by (distance / pitch) x 360 on RZ simultaneously.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>PITCH  (mm / revolution)</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <ExpressionInput style={ms.input} fieldKey="threadPitch"
                  value={draft!.threadPitch} expressions={draft!.expressions}
                  onChangeValue={v => set({ threadPitch: v })} onChangeExpr={setExpr}
                  placeholder="required" variables={variables} />
              </View>
              <TouchableOpacity
                style={[ms.seg, { paddingHorizontal: 14, height: 40, justifyContent: 'center' }]}
                onPress={() => setThreadPresetPickerOpen(true)} activeOpacity={0.8}>
                <Text style={ms.segText}>Pick Size</Text>
              </TouchableOpacity>
            </View>
            {(pitchLabel != null || pitchExpr != null) && (
              <Text style={ms.hintText}>
                {pitchExpr ? `Expression: ${pitchExpr}` : pitchLabel}
                {rotDeg != null && !distExpr && !pitchExpr ? `  ->  ${rotDeg} rotation` : ''}
              </Text>
            )}
            <View style={[ms.switchRow, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={ms.switchLabel}>Pecking</Text>
                <Text style={[ms.hintText, { marginTop: 2, marginBottom: 0 }]}>
                  Advance in steps, retracting between each peck to clear chips.
                </Text>
              </View>
              <Switch
                value={peckOn}
                onValueChange={v => set({ threadPeck: v || undefined })}
                trackColor={{ false: colors.border, true: colors.accent }}
              />
            </View>
            {peckOn && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>PECK DEPTH  (mm deeper per peck)</Text>
                <ExpressionInput style={ms.input} fieldKey="threadPeckDepth"
                  value={draft!.threadPeckDepth} expressions={draft!.expressions}
                  onChangeValue={v => set({ threadPeckDepth: v })} onChangeExpr={setExpr}
                  placeholder="e.g. 1" variables={variables} />
                <Text style={ms.hintText}>
                  How much deeper each peck goes. The last peck covers any remaining distance.
                </Text>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>PECK RETRACT  (mm up per peck)</Text>
                <ExpressionInput style={ms.input} fieldKey="threadPeckRetract"
                  value={draft!.threadPeckRetract} expressions={draft!.expressions}
                  onChangeValue={v => set({ threadPeckRetract: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder="full retract" variables={variables} />
                <Text style={ms.hintText}>
                  How far to pull back after each peck. Leave blank to fully retract to the start
                  each peck. E.g. 1 mm deeper / 2 mm up = 1 mm down, 2 mm up, then 3 mm down, 2 mm up…
                </Text>
              </>
            )}
            <View style={[ms.switchRow, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={ms.switchLabel}>Reverse out after threading</Text>
                <Text style={[ms.hintText, { marginTop: 2, marginBottom: 0 }]}>
                  After reaching full depth, rotate back and return to the start position.
                </Text>
              </View>
              <Switch
                value={draft!.threadReverseOut ?? true}
                onValueChange={v => set({ threadReverseOut: v ? undefined : false })}
                trackColor={{ false: colors.border, true: colors.accent }}
              />
            </View>
            {(draft!.threadReverseOut ?? true) && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>EXIT HEIGHT  (mm past start)</Text>
                <ExpressionInput style={ms.input} fieldKey="threadExitHeight"
                  value={draft!.threadExitHeight} expressions={draft!.expressions}
                  onChangeValue={v => set({ threadExitHeight: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder="0" variables={variables} />
                <Text style={ms.hintText}>
                  Finish this far beyond the start on the way out, so the move exits higher than
                  it began. Leave blank to return to the start.
                </Text>
              </>
            )}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>SPEED  (deg/s)</Text>
            <ExpressionInput style={ms.input} fieldKey="speed"
              value={draft!.speed} expressions={draft!.expressions}
              onChangeValue={v => set({ speed: v })} onChangeExpr={setExpr}
              allowUndefined placeholder="default" variables={variables} />
            <Text style={ms.hintText}>
              Controls RZ rotation rate. Z velocity follows automatically from pitch.
            </Text>
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  (deg/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="accel"
                  value={draft!.accel} expressions={draft!.expressions}
                  onChangeValue={v => set({ accel: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder="default" variables={variables} />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>DECEL  (deg/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="decel"
                  value={draft!.decel} expressions={draft!.expressions}
                  onChangeValue={v => set({ decel: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder="default" variables={variables} />
              </View>
            </View>
          </>
        );
      }

      case "AuxMove": {
        const deviceId    = draft!.auxDeviceId ?? auxDevices[0]?.deviceId ?? "AUX_STEPPER_001";
        const axisIndex   = draft!.auxAxisIndex ?? 0;
        const isAbsolute  = draft!.auxAbsolute ?? false;
        const auxDevice   = auxDevices.find(d => d.deviceId === deviceId);
        const axisCfg     = auxDevice?.axes.find(a => a.axisIndex === axisIndex);
        const isPhysical  = !!axisCfg?.axisType;
        const unit        = isPhysical ? auxUnitLabel(axisCfg!) : "steps";
        const displayAxes = auxDevice?.axes.length ? auxDevice.axes : [0,1,2,3].map(n => ({ axisIndex: n, name: "" }));

        const valueLabel = isAbsolute
          ? `TARGET POSITION  (${unit})`
          : `OFFSET  (${unit})`;
        const valueHint = isAbsolute
          ? `Moves to this absolute position from the axis zero point. Positive = CW, negative = CCW.`
          : `Moves this distance relative to the current position. Positive = CW, negative = CCW.`;

        return (
          <>
            <Text style={[ms.fieldLabel, { marginTop: 0 }]}>DEVICE</Text>
            {auxDevices.length === 0 ? (
              <Text style={[ms.emptyHint, { marginTop: 4 }]}>No aux devices connected.</Text>
            ) : auxDevices.map((d, i) => {
              const active = deviceId === d.deviceId;
              return (
                <TouchableOpacity key={d.deviceId}
                  style={[ms.row, i < auxDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ auxDeviceId: d.deviceId })} activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]} numberOfLines={1}>
                      {d.deviceName || d.deviceId}
                    </Text>
                    {d.deviceName && d.deviceName !== d.deviceId
                      ? <Text style={ms.rowDesc}>{d.deviceId}</Text>
                      : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MOTOR</Text>
            {displayAxes.map((a, i) => {
              const active = axisIndex === a.axisIndex;
              const label  = a.name ? `${a.name}` : `Axis ${a.axisIndex}`;
              return (
                <TouchableOpacity key={a.axisIndex}
                  style={[ms.row, i < displayAxes.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ auxAxisIndex: a.axisIndex })} activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MODE</Text>
            <View style={ms.segRow}>
              {([{ label: "Relative offset", val: false }, { label: "Absolute position", val: true }] as const).map(({ label, val }) => {
                const active = isAbsolute === val;
                return (
                  <TouchableOpacity key={label} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ auxAbsolute: val || undefined })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>{valueLabel}</Text>
            {isPhysical
              ? <ExpressionInput style={ms.input} fieldKey="auxDistance"
                  value={draft!.auxDistance}
                  expressions={draft!.expressions}
                  onChangeValue={v => set({ auxDistance: v, auxUnit: unit })}
                  onChangeExpr={setExpr}
                  placeholder={isAbsolute ? "0" : "100"}
                  variables={variables} />
              : <ExpressionInput style={ms.input} fieldKey="auxSteps"
                  value={draft!.auxSteps}
                  expressions={draft!.expressions}
                  onChangeValue={v => set({ auxSteps: v !== undefined ? Math.round(v) : undefined })}
                  onChangeExpr={setExpr}
                  placeholder={isAbsolute ? "0" : "1600"}
                  variables={variables} />
            }
            <Text style={ms.hintText}>{valueHint}</Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VELOCITY  ({unit}/s)</Text>
            <ExpressionInput style={ms.input} fieldKey="auxVelocity"
              value={draft!.auxVelocity} expressions={draft!.expressions}
              onChangeValue={v => set({ auxVelocity: v })} onChangeExpr={setExpr}
              allowUndefined placeholder={isPhysical ? "10" : "1600"} variables={variables} />
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  ({unit}/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="auxAccel"
                  value={draft!.auxAccel} expressions={draft!.expressions}
                  onChangeValue={v => set({ auxAccel: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder={isPhysical ? "50" : "3200"} variables={variables} />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>DECEL  ({unit}/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="auxDecel"
                  value={draft!.auxDecel} expressions={draft!.expressions}
                  onChangeValue={v => set({ auxDecel: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder="same as accel" variables={variables} />
              </View>
            </View>
            <View style={[ms.switchRow, { marginTop: 14 }]}>
              <Text style={ms.switchLabel}>Wait until move completes</Text>
              <Switch
                value={draft!.auxWaitForDone !== false}
                onValueChange={v => set({ auxWaitForDone: v ? undefined : false })}
                trackColor={{ false: colors.border, true: "#7c3aed" }}
              />
            </View>
            <Text style={ms.hintText}>
              When on, the program waits for the aux move to finish before the next step.
              When off, the robot and aux axis can move simultaneously.
            </Text>
            <View style={{ marginTop: 14 }}>{moveStopRow()}</View>
          </>
        );
      }

      case "AuxContinuous": {
        const deviceId   = draft!.auxDeviceId ?? auxDevices[0]?.deviceId ?? "AUX_STEPPER_001";
        const axisIndex  = draft!.auxAxisIndex ?? 0;
        const auxDevice  = auxDevices.find(d => d.deviceId === deviceId);
        const axisCfg    = auxDevice?.axes.find(a => a.axisIndex === axisIndex);
        const isPhysical = !!axisCfg?.axisType;
        const unit       = isPhysical ? auxUnitLabel(axisCfg!) : "steps";
        const velocity   = draft!.auxVelocity ?? (isPhysical ? 10 : 800);
        const dir        = velocity < 0 ? -1 : 1;
        const displayAxes = auxDevice?.axes.length ? auxDevice.axes : [0,1,2,3].map(n => ({ axisIndex: n, name: "" }));

        return (
          <>
            <Text style={ms.hintText}>
              Start the aux axis running continuously at the given speed. Use an AuxStop step to stop it.
              CW = positive direction, CCW = negative.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DEVICE</Text>
            {auxDevices.length === 0 ? (
              <Text style={[ms.emptyHint, { marginTop: 4 }]}>No aux devices connected.</Text>
            ) : auxDevices.map((d, i) => {
              const active = deviceId === d.deviceId;
              return (
                <TouchableOpacity key={d.deviceId}
                  style={[ms.row, i < auxDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ auxDeviceId: d.deviceId })} activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]} numberOfLines={1}>
                      {d.deviceName || d.deviceId}
                    </Text>
                    {d.deviceName && d.deviceName !== d.deviceId
                      ? <Text style={ms.rowDesc}>{d.deviceId}</Text>
                      : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MOTOR</Text>
            {displayAxes.map((a, i) => {
              const active = axisIndex === a.axisIndex;
              const label  = a.name ? `${a.name}` : `Axis ${a.axisIndex}`;
              return (
                <TouchableOpacity key={a.axisIndex}
                  style={[ms.row, i < displayAxes.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ auxAxisIndex: a.axisIndex })} activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DIRECTION</Text>
            <View style={ms.segRow}>
              {([{ Icon: RotateCw, label: "CW", val: 1 }, { Icon: RotateCcw, label: "CCW", val: -1 }] as const).map(({ Icon, label, val }) => {
                const active = dir === val;
                return (
                  <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ auxVelocity: Math.abs(velocity || (isPhysical ? 10 : 800)) * val, auxUnit: isPhysical ? unit : undefined })}
                    activeOpacity={0.8}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <Icon size={15} color={active ? "#7c3aed" : colors.textMuted} />
                      <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VELOCITY  ({unit}/s)</Text>
            <ExpressionInput style={ms.input} fieldKey="auxVelocity"
              value={Math.abs(velocity) || undefined}
              expressions={draft!.expressions}
              onChangeValue={v => set({ auxVelocity: v !== undefined ? v * dir : undefined, auxUnit: isPhysical ? unit : undefined })}
              onChangeExpr={setExpr}
              placeholder={isPhysical ? "10" : "800"}
              variables={variables} />
            <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  ({unit}/s²)</Text>
            <ExpressionInput style={ms.input} fieldKey="auxAccel"
              value={draft!.auxAccel} expressions={draft!.expressions}
              onChangeValue={v => set({ auxAccel: v })} onChangeExpr={setExpr}
              allowUndefined placeholder={isPhysical ? "50" : "3200"} variables={variables} />
          </>
        );
      }

      case "AuxStop": {
        const stopAll     = !draft!.auxDeviceId;
        const deviceId    = draft!.auxDeviceId ?? auxDevices[0]?.deviceId ?? "AUX_STEPPER_001";
        const axisIndex   = draft!.auxAxisIndex ?? 0;
        const auxDevice   = auxDevices.find(d => d.deviceId === deviceId);
        const displayAxes = auxDevice?.axes.length ? auxDevice.axes : [0,1,2,3].map(n => ({ axisIndex: n, name: "" }));

        return (
          <>
            <Text style={ms.hintText}>
              Stop aux axis motion. Controlled stop ramps down gracefully; immediate halt cuts power instantly.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>TARGET</Text>
            <View style={ms.segRow}>
              {([{ label: "All axes", val: true }, { label: "Specific axis", val: false }] as const).map(({ label, val }) => {
                const active = stopAll === val;
                return (
                  <TouchableOpacity key={label} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => {
                      if (val) set({ auxDeviceId: undefined, auxAxisIndex: undefined });
                      else     set({ auxDeviceId: auxDevices[0]?.deviceId ?? deviceId, auxAxisIndex: 0 });
                    }} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!stopAll && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DEVICE</Text>
                {auxDevices.length === 0 ? (
                  <Text style={[ms.emptyHint, { marginTop: 4 }]}>No aux devices connected.</Text>
                ) : auxDevices.map((d, i) => {
                  const active = deviceId === d.deviceId;
                  return (
                    <TouchableOpacity key={d.deviceId}
                      style={[ms.row, i < auxDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => set({ auxDeviceId: d.deviceId })} activeOpacity={0.7}>
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <Text style={[ms.rowLabel, active && ms.rowLabelActive]} numberOfLines={1}>
                          {d.deviceName || d.deviceId}
                        </Text>
                        {d.deviceName && d.deviceName !== d.deviceId
                          ? <Text style={ms.rowDesc}>{d.deviceId}</Text>
                          : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MOTOR</Text>
                {displayAxes.map((a, i) => {
                  const active = axisIndex === a.axisIndex;
                  const label  = a.name ? `${a.name}` : `Axis ${a.axisIndex}`;
                  return (
                    <TouchableOpacity key={a.axisIndex}
                      style={[ms.row, i < displayAxes.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => set({ auxAxisIndex: a.axisIndex })} activeOpacity={0.7}>
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
            {!draft!.auxImmediate && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DECEL RATE  (steps/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="auxDecel"
                  value={draft!.auxDecel} expressions={draft!.expressions}
                  onChangeValue={v => set({ auxDecel: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder="5000" variables={variables} />
              </>
            )}
            <View style={[ms.switchRow, { marginTop: 14 }]}>
              <Text style={ms.switchLabel}>Immediate hard stop</Text>
              <Switch
                value={draft!.auxImmediate ?? false}
                onValueChange={v => set({ auxImmediate: v || undefined })}
                trackColor={{ false: colors.border, true: colors.danger }}
              />
            </View>
          </>
        );
      }

      case "AuxEnable": {
        const deviceId  = draft!.auxDeviceId ?? auxDevices[0]?.deviceId ?? "AUX_STEPPER_001";
        const motorOn   = draft!.auxEnable !== false;

        return (
          <>
            <Text style={ms.hintText}>
              Enable or disable the stepper motor drivers on an aux IO card. Disabling cuts power to all motors on the device.
            </Text>

            {auxDevices.length > 1 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DEVICE</Text>
                {auxDevices.map((d, i) => {
                  const active = deviceId === d.deviceId;
                  return (
                    <TouchableOpacity key={d.deviceId}
                      style={[ms.row, i < auxDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => set({ auxDeviceId: d.deviceId })} activeOpacity={0.7}>
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <Text style={[ms.rowLabel, active && ms.rowLabelActive]} numberOfLines={1}>
                          {d.deviceName || d.deviceId}
                        </Text>
                        {d.deviceName && d.deviceName !== d.deviceId
                          ? <Text style={ms.rowDesc}>{d.deviceId}</Text>
                          : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MOTOR STATE</Text>
            <View style={ms.segRow}>
              {([{ label: "Enable", val: true }, { label: "Disable", val: false }] as const).map(({ label, val }) => {
                const active = motorOn === val;
                return (
                  <TouchableOpacity key={label} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ auxEnable: val })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );
      }

      case "GripperAction":
      case "ConveyorAction":
      case "RotaryIndex": {
        const deviceId    = draft!.auxDeviceId ?? auxDevices[0]?.deviceId ?? "AUX_STEPPER_001";
        const axisIndex   = draft!.auxAxisIndex ?? 0;
        const auxDevice   = auxDevices.find(d => d.deviceId === deviceId);
        const displayAxes = auxDevice?.axes.length ? auxDevice.axes : [0,1,2,3].map(n => ({ axisIndex: n, name: "" }));

        const deviceAndMotor = (
          <>
            <Text style={[ms.fieldLabel, { marginTop: 0 }]}>DEVICE</Text>
            {auxDevices.length === 0 ? (
              <Text style={[ms.emptyHint, { marginTop: 4 }]}>No aux devices connected.</Text>
            ) : auxDevices.map((d, i) => {
              const active = deviceId === d.deviceId;
              return (
                <TouchableOpacity key={d.deviceId}
                  style={[ms.row, i < auxDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ auxDeviceId: d.deviceId })} activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]} numberOfLines={1}>
                      {d.deviceName || d.deviceId}
                    </Text>
                    {d.deviceName && d.deviceName !== d.deviceId
                      ? <Text style={ms.rowDesc}>{d.deviceId}</Text>
                      : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>MOTOR</Text>
            {displayAxes.map((a, i) => {
              const active = axisIndex === a.axisIndex;
              const label  = a.name ? `${a.name}` : `Axis ${a.axisIndex}`;
              return (
                <TouchableOpacity key={a.axisIndex}
                  style={[ms.row, i < displayAxes.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ auxAxisIndex: a.axisIndex })} activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        );

        const settingsHint = (
          <Text style={ms.hintText}>
            Move distance and speed come from this axis's role settings — set them on the I/O → Aux screen.
          </Text>
        );

        if (draft!.type === "GripperAction") {
          const action   = draft!.gripperAction ?? "Open";
          const gripAxis = auxDevice?.axes.find(a => a.axisIndex === axisIndex);
          const lo = gripAxis ? Math.min(gripAxis.gripperOpenMm || 0, gripAxis.gripperClosedMm || 0) : 0;
          const hi = gripAxis ? Math.max(gripAxis.gripperOpenMm || 0, gripAxis.gripperClosedMm || 0) : 0;
          return (
            <>
              {deviceAndMotor}
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ACTION</Text>
              <View style={ms.segRow}>
                {([{ label: "Open", val: "Open" }, { label: "Close", val: "Close" }, { label: "Grip to", val: "GripTo" }] as const).map(({ label, val }) => {
                  const active = action === val;
                  return (
                    <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                      onPress={() => set({ gripperAction: val })} activeOpacity={0.8}>
                      <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {action === "GripTo" && (
                <>
                  <Text style={[ms.fieldLabel, { marginTop: 12 }]}>TARGET GAP  (mm)</Text>
                  <ExpressionInput style={ms.input} fieldKey="gripTargetMm"
                    value={draft!.gripTargetMm} expressions={draft!.expressions}
                    onChangeValue={v => set({ gripTargetMm: v })} onChangeExpr={setExpr}
                    placeholder={hi > lo ? `${lo.toFixed(0)}–${hi.toFixed(0)}` : "30"} variables={variables} />
                  {hi > lo && <Text style={ms.hintText}>{`Jaw gap, clamped to ${lo.toFixed(0)}–${hi.toFixed(0)} mm.`}</Text>}
                </>
              )}
              <View style={ms.twoCol}>
                <View style={ms.twoColItem}>
                  <Text style={[ms.fieldLabel, { marginTop: 10 }]}>SPEED  (mm/s)</Text>
                  <ExpressionInput style={ms.input} fieldKey="auxVelocity"
                    value={draft!.auxVelocity} expressions={draft!.expressions}
                    onChangeValue={v => set({ auxVelocity: v })} onChangeExpr={setExpr}
                    allowUndefined placeholder="from settings" variables={variables} />
                </View>
                <View style={ms.twoColItem}>
                  <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  (mm/s²)</Text>
                  <ExpressionInput style={ms.input} fieldKey="auxAccel"
                    value={draft!.auxAccel} expressions={draft!.expressions}
                    onChangeValue={v => set({ auxAccel: v })} onChangeExpr={setExpr}
                    allowUndefined placeholder="from settings" variables={variables} />
                </View>
              </View>
              <Text style={ms.hintText}>
                Open and Close drive to the configured gap limits; Grip to drives to the gap above.
                Speed and accel fall back to the gripper's configured open/close time when left blank.
              </Text>
              <View style={{ marginTop: 14 }}>{moveStopRow()}</View>
            </>
          );
        }

        if (draft!.type === "ConveyorAction") {
          const action = draft!.conveyorAction ?? "RunForward";
          return (
            <>
              {deviceAndMotor}
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ACTION</Text>
              <View style={ms.segRow}>
                {([
                  { label: "Run Forward", val: "RunForward" },
                  { label: "Run Reverse", val: "RunReverse" },
                  { label: "Stop",        val: "Stop" },
                ] as const).map(({ label, val }) => {
                  const active = action === val;
                  return (
                    <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                      onPress={() => set({ conveyorAction: val })} activeOpacity={0.8}>
                      <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {settingsHint}
            </>
          );
        }

        // RotaryIndex
        const dir = draft!.rotaryDirection ?? 1;
        return (
          <>
            {deviceAndMotor}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DIRECTION</Text>
            <View style={ms.segRow}>
              {([{ label: "+", val: 1 }, { label: "−", val: -1 }] as const).map(({ label, val }) => {
                const active = dir === val;
                return (
                  <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ rotaryDirection: val })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>COUNT</Text>
            <ExpressionInput style={ms.input} fieldKey="rotaryCount"
              value={draft!.rotaryCount}
              expressions={draft!.expressions}
              onChangeValue={v => set({ rotaryCount: v !== undefined ? Math.round(v) : undefined })}
              onChangeExpr={setExpr}
              placeholder="1"
              variables={variables} />
            {settingsHint}
          </>
        );
      }

      case "IfCondition":
        return (
          <Text style={ms.hintText}>
            Edit conditions using the pencil icon on each branch. Add or remove Else If / Else branches from the block controls at the bottom.
          </Text>
        );

      case "StartBackground":
      case "StopBackground":
      case "WaitForBackground":
        return (
          <>
            <Text style={[ms.hintText, { marginTop: 0, marginBottom: 4 }]}>
              {draft!.type === "StartBackground"
                ? "Starts it in parallel; does nothing if it is already running."
                : draft!.type === "StopBackground"
                ? "Stops it; does nothing if it is not running."
                : "Blocks until it finishes; continues at once if it is not running."}
            </Text>
            {allPrograms.some(p => p.isBackground) ? catalogFields() : (
              <Text style={[ms.emptyHint, { marginTop: 4 }]}>
                No background programs yet. Turn on &quot;Background Program&quot; in a program&apos;s settings.
              </Text>
            )}
          </>
        );

      case "StopwatchControl":
        return (
          <>
            <Text style={[ms.hintText, { marginTop: 0, marginBottom: 4 }]}>
              A stopwatch variable holds elapsed milliseconds; read it in any expression.
            </Text>
            {catalogFields()}
          </>
        );

      case "SaveImage":
        return (
          <SaveImageFields
            onSaveVariable={onSaveVariable}
            draft={draft!}
            variables={variables}
            cameras={cameraDevices}
            set={set}
          />
        );

      case "HttpRequest": {
        const outbound = draft!.jsonOutbound ?? [];
        const inbound  = draft!.jsonInbound  ?? [];
        const accent   = "#0f766e";

        const setOutbound = (rows: JsonKeyValue[])       => set({ jsonOutbound: rows.length ? rows : undefined });
        const setInbound  = (rows: JsonInboundMapping[]) => set({ jsonInbound:  rows.length ? rows : undefined });

        const numericVars = (variables ?? []).filter(v => !isListVariable(v) && !v.isString && !v.isImage);
        const imageVars   = (variables ?? []).filter(v => v.isImage === true);
        // A list travels as a JSON array in either direction, so one 32-element board is
        // one field rather than 32. Ordered after the scalars because picking a scalar is
        // still the common case.
        const listVars    = (variables ?? []).filter(v => isListVariable(v));
        const allVars     = [...numericVars, ...listVars, ...imageVars];

        return (
          <>
            <Text style={ms.hintText}>
              POST a JSON body to a URL. Optionally map response fields back to program variables.
            </Text>

            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ENDPOINT URL</Text>
            <TextInput
              style={ms.input}
              value={draft!.jsonUrl ?? ""}
              onChangeText={v => set({ jsonUrl: v || undefined })}
              placeholder="https://api.example.com/robot"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="done"
            />

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>TIMEOUT (ms)</Text>
            <TextInput
              style={ms.input}
              value={draft!.jsonTimeoutMs != null ? String(draft!.jsonTimeoutMs) : ""}
              onChangeText={v => set({ jsonTimeoutMs: v ? parseInt(v) || undefined : undefined })}
              placeholder="10000"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              returnKeyType="done"
            />

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>RESPONSE MODE</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {([
                { label: "Wait for response", value: true  },
                { label: "Fire & continue",   value: false },
              ] as const).map(opt => {
                const active = (draft!.jsonWaitForResponse ?? true) === opt.value;
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: radii.sm, alignItems: "center",
                      borderWidth: 1.5, borderColor: active ? accent : colors.border,
                      backgroundColor: active ? "#f0fdfa" : colors.surfaceMuted }]}
                    onPress={() => set({ jsonWaitForResponse: opt.value })}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700",
                      color: active ? accent : colors.textMuted }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Outbound mapping ── */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 6 }}>
              <Globe size={13} color={accent} style={{ marginRight: 5 }} />
              <Text style={[ms.fieldLabel, { marginTop: 0, color: accent }]}>OUTBOUND FIELDS</Text>
            </View>
            <Text style={[ms.hintText, { marginBottom: 8 }]}>
              Each row becomes a JSON key. Value is a variable or expression (e.g. <Text style={{ fontFamily: "monospace" }}>$count * 2</Text>).
              Pick a list variable to send the whole list as a JSON array.
            </Text>
            {/* JSON block */}
            <View style={{ borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong,
              borderLeftWidth: 3, borderLeftColor: accent,
              backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                fontSize: 15, color: "#64748b" }}>{"{"}</Text>
              {outbound.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                  color: colors.textFaint, fontStyle: "italic" }}>
                  // no fields yet
                </Text>
              )}
              {outbound.map((row, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center",
                  paddingLeft: 26, paddingRight: 6, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 14, color: accent }}>"</Text>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: "#0f172a", paddingHorizontal: 1,
                      paddingVertical: 2, minWidth: 20 }}
                    value={row.key}
                    onChangeText={v => {
                      const next = [...outbound];
                      next[i] = { ...row, key: v };
                      setOutbound(next);
                    }}
                    placeholder="key"
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="next"
                    autoCapitalize="none"
                  />
                  <Text style={{ fontSize: 14, color: accent }}>"</Text>
                  <Text style={{ fontSize: 14, color: "#64748b", marginHorizontal: 5 }}>:</Text>
                  {row.listVar || row.imageVar ? (
                    // A whole-variable row has nothing to type into — the value is the
                    // variable itself, so the field is a chip that reopens the picker.
                    <TouchableOpacity
                      style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 30 }}
                      onPress={() => setJsonOutboundPicker(i)}
                      activeOpacity={0.75}
                    >
                      {row.listVar ? <List size={12} color={accent} /> : <Camera size={12} color={accent} />}
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: accents.purple }}
                        numberOfLines={1}>${row.listVar ?? row.imageVar}</Text>
                      {row.listVar && (
                        <Text style={{ fontSize: 11, color: "#94a3b8" }}>[ ]</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TextInput
                        style={{ flex: 2, fontSize: 14, color: accents.purple, paddingHorizontal: 1,
                          paddingVertical: 2, minWidth: 30 }}
                        value={row.expr}
                        onChangeText={v => {
                          const next = [...outbound];
                          next[i] = { ...row, expr: v };
                          setOutbound(next);
                        }}
                        placeholder="$var or expr"
                        placeholderTextColor={colors.textFaint}
                        returnKeyType="done"
                        autoCapitalize="none"
                      />
                      <TouchableOpacity onPress={() => setJsonOutboundPicker(i)}
                        hitSlop={8} style={{ padding: 5 }} activeOpacity={0.7}>
                        <Search size={13} color="#94a3b8" />
                      </TouchableOpacity>
                    </>
                  )}
                  {i < outbound.length - 1 && (
                    <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 2 }}>,</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setOutbound(outbound.filter((_, j) => j !== i))}
                    hitSlop={8} style={{ padding: 5 }}>
                    <Minus size={13} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5,
                  paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setOutbound([...outbound, { key: "", expr: "" }])}
                activeOpacity={0.7}
              >
                <Plus size={12} color={colors.textFaint} />
                <Text style={{ fontSize: 12, color: colors.textFaint }}>add field</Text>
              </TouchableOpacity>
              <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                fontSize: 15, color: "#64748b" }}>{"}"}</Text>
            </View>

            {/* ── Inbound mapping ── */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 6 }}>
              <Globe size={13} color={colors.accent} style={{ marginRight: 5 }} />
              <Text style={[ms.fieldLabel, { marginTop: 0, color: colors.accent }]}>INBOUND VARIABLES</Text>
            </View>
            <Text style={[ms.hintText, { marginBottom: 8 }]}>
              Map response JSON keys to program variables. Leave empty to ignore the response.
              A JSON array mapped onto a list variable replaces the list; read its length with <Text style={{ fontFamily: "monospace" }}>$name.length</Text>.
            </Text>
            {/* JSON block */}
            <View style={{ borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong,
              borderLeftWidth: 3, borderLeftColor: colors.accent,
              backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                fontSize: 15, color: "#64748b" }}>{"{"}</Text>
              {inbound.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                  color: colors.textFaint, fontStyle: "italic" }}>
                  // no mappings yet
                </Text>
              )}
              {inbound.map((row, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center",
                  paddingLeft: 26, paddingRight: 6, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 14, color: colors.accent }}>"</Text>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: "#0f172a", paddingHorizontal: 1,
                      paddingVertical: 2, minWidth: 20 }}
                    value={row.key}
                    onChangeText={v => {
                      const next = [...inbound];
                      next[i] = { ...row, key: v };
                      setInbound(next);
                    }}
                    placeholder="key"
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="done"
                    autoCapitalize="none"
                  />
                  <Text style={{ fontSize: 14, color: colors.accent }}>"</Text>
                  <ArrowRight size={16} color={colors.accent} style={{ marginHorizontal: 6 }} />
                  <TouchableOpacity
                    style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 5,
                      minWidth: 30 }}
                    onPress={() => setJsonInboundPicker(i)}
                    activeOpacity={0.75}
                  >
                    <Search size={12} color={row.variableName ? colors.accent : "#94a3b8"} />
                    <Text style={{ flex: 1, fontSize: 14,
                      fontWeight: row.variableName ? "700" : "400",
                      color: row.variableName ? accents.purple : colors.textFaint }} numberOfLines={1}>
                      {row.variableName ? `$${row.variableName}` : "search variables…"}
                    </Text>
                  </TouchableOpacity>
                  {i < inbound.length - 1 && (
                    <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 2 }}>,</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setInbound(inbound.filter((_, j) => j !== i))}
                    hitSlop={8} style={{ padding: 5 }}>
                    <Minus size={13} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5,
                  paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setInbound([...inbound, { key: "", variableName: "" }])}
                activeOpacity={0.7}
              >
                <Plus size={12} color={colors.textFaint} />
                <Text style={{ fontSize: 12, color: colors.textFaint }}>add mapping</Text>
              </TouchableOpacity>
              <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                fontSize: 15, color: "#64748b" }}>{"}"}</Text>
            </View>

            {/* Variable picker for inbound rows — numeric, list and image */}
            <VarPickerModal
              filter={isAssignableVariable}
              visible={jsonInboundPicker !== null}
              title="Select Variable"
              variables={allVars}
              selected={jsonInboundPicker !== null ? inbound[jsonInboundPicker]?.variableName : undefined}
              showNone
              onSelect={v => {
                if (jsonInboundPicker === null) return;
                const next = [...inbound];
                next[jsonInboundPicker] = { ...next[jsonInboundPicker], variableName: v?.name ?? "" };
                setInbound(next);
                setJsonInboundPicker(null);
              }}
              onClose={() => setJsonInboundPicker(null)}
              create={{ type: "number", label: "variable" }}
              onCreateVariable={onSaveVariable} allVariables={variables}
            />
            {/* Variable picker for outbound rows — a list or image replaces the row's value
                outright, a scalar appends into the expression being typed. */}
            <VarPickerModal
              visible={jsonOutboundPicker !== null}
              title="Select Variable"
              variables={allVars}
              selected={jsonOutboundPicker !== null
                ? (outbound[jsonOutboundPicker]?.listVar ?? outbound[jsonOutboundPicker]?.imageVar ?? undefined)
                : undefined}
              onSelect={v => {
                if (jsonOutboundPicker === null || !v) return;
                const next = [...outbound];
                const row  = next[jsonOutboundPicker];
                if (isListVariable(v)) {
                  next[jsonOutboundPicker] = { ...row, listVar: v.name, imageVar: undefined, expr: "" };
                } else if (v.isImage) {
                  next[jsonOutboundPicker] = { ...row, imageVar: v.name, listVar: undefined, expr: "" };
                } else {
                  // Appending only makes sense if an expression was already being built.
                  // Coming from a list or image row there is nothing to append to.
                  const cur = (row.listVar || row.imageVar) ? "" : row.expr.trimEnd();
                  next[jsonOutboundPicker] = { ...row, imageVar: undefined, listVar: undefined,
                    expr: cur ? `${cur} $${v.name}` : `$${v.name}` };
                }
                setOutbound(next);
                setJsonOutboundPicker(null);
              }}
              onClose={() => setJsonOutboundPicker(null)}
              create={{ type: "list" }}
              onCreateVariable={onSaveVariable} allVariables={variables}
            />
          </>
        );
      }

      case "CaptureImage": {
        const accentImg = accents.cyan;
        const imageVarsForCapture = (variables ?? []).filter(v => v.isImage === true);
        return (
          <>
            <Text style={ms.hintText}>
              Grab the current frame from a camera and store it as a base64 JPEG in an image variable.
              Use an <Text style={{ fontWeight: "700" }}>HTTP Request</Text> step after this to send it to a server.
            </Text>

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>CAMERA</Text>
            {cameraDevices.length === 0 ? (
              <Text style={ms.emptyHint}>No cameras configured. Add cameras in the Camera settings.</Text>
            ) : (
              <>
              {!cameraDevices.some(c => c.id === (draft!.captureImageCameraId ?? "")) && (
                <CautionNote style={{ marginBottom: 6 }}>No camera selected. Pick one below.</CautionNote>
              )}
              {cameraDevices.map((cam, i) => {
                const active = (draft!.captureImageCameraId ?? "") === cam.id;
                return (
                  <TouchableOpacity
                    key={cam.id}
                    style={[ms.row, i < cameraDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => set({ captureImageCameraId: cam.id })}
                    activeOpacity={0.7}
                  >
                    <Camera size={14} color={active ? accentImg : colors.textMuted} />
                    <Text style={[ms.rowLabel, { flex: 1 }, active && { color: accentImg }]}>{cam.name}</Text>
                    {active && <Check size={14} color={accentImg} />}
                  </TouchableOpacity>
                );
              })}
              </>
            )}

            <VarSelectorButton
              label="IMAGE VARIABLE"
              value={draft!.captureImageVariableName}
              accent={accentImg}
              placeholder="None — tap to select"
              onPress={() => setCaptureVarPicker(true)}
            />
            <VarPickerModal
              filter={isAssignableVariable}
              visible={captureVarPicker}
              onClose={() => setCaptureVarPicker(false)}
              variables={imageVarsForCapture}
              selected={draft!.captureImageVariableName}
              onSelect={v => { if (v) set({ captureImageVariableName: v.name }); setCaptureVarPicker(false); }}
              title="Image Variable"
              create={{ type: "image" }}
              onCreateVariable={onSaveVariable} allVariables={variables}
            />
          </>
        );
      }

      case "HttpReceive": {
        const accentRcv = "#0f766e";
        const rcvInbound = draft!.httpReceiveInbound ?? [];
        const numericVarsRcv = (variables ?? []).filter(v => !isListVariable(v) && !v.isString && !v.isImage);
        const setRcvInbound = (rows: JsonInboundMapping[]) =>
          set({ httpReceiveInbound: rows.length ? rows : undefined });
        const webhookUrl = robot?.ipAddress
          ? `http://${robot.ipAddress}:${robot.port ?? 9000}/webhook/${draft!.httpReceiveName || "<name>"}`
          : `/webhook/${draft!.httpReceiveName || "<name>"}`;
        return (
          <>
            <Text style={ms.hintText}>
              Wait for an HTTP POST to a named webhook endpoint. Other robots or external servers can trigger
              this step by POSTing JSON to the URL shown below.
            </Text>

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>WEBHOOK NAME</Text>
            <TextInput
              style={[ms.input, { marginTop: 6 }]}
              value={draft!.httpReceiveName ?? ""}
              onChangeText={v => set({ httpReceiveName: v || undefined })}
              placeholder="e.g. part-ready"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              returnKeyType="done"
            />
            {draft!.httpReceiveName ? (
              <View style={{ backgroundColor: colors.successSoft, borderRadius: radii.sm, borderWidth: 1,
                borderColor: colors.successBorder, padding: 10, marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: "#15803d", fontWeight: "600", marginBottom: 2 }}>
                  POST endpoint
                </Text>
                <Text style={{ fontSize: 12, color: "#166534", fontFamily: "monospace" }} selectable>
                  {webhookUrl}
                </Text>
              </View>
            ) : null}

            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>TIMEOUT (ms)</Text>
            <TextInput
              style={[ms.input, { marginTop: 6 }]}
              value={draft!.httpReceiveTimeoutMs != null ? String(draft!.httpReceiveTimeoutMs) : ""}
              onChangeText={v => {
                const n = parseInt(v, 10);
                set({ httpReceiveTimeoutMs: isNaN(n) ? undefined : n });
              }}
              placeholder="30000 (default)"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              returnKeyType="done"
            />

            {/* Inbound mapping */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 6 }}>
              <Globe size={13} color={accentRcv} style={{ marginRight: 5 }} />
              <Text style={[ms.fieldLabel, { marginTop: 0, color: accentRcv }]}>INBOUND VARIABLES</Text>
            </View>
            <Text style={[ms.hintText, { marginBottom: 8 }]}>
              Map incoming JSON keys to program variables.
            </Text>
            <View style={{ borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong,
              borderLeftWidth: 3, borderLeftColor: accentRcv,
              backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                fontSize: 15, color: "#64748b" }}>{"{"}</Text>
              {rcvInbound.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                  color: colors.textFaint, fontStyle: "italic" }}>
                  // no mappings yet
                </Text>
              )}
              {rcvInbound.map((row, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center",
                  paddingLeft: 26, paddingRight: 6, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 14, color: accentRcv }}>"</Text>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: "#0f172a", paddingHorizontal: 1,
                      paddingVertical: 2, minWidth: 20 }}
                    value={row.key}
                    onChangeText={v => {
                      const next = [...rcvInbound];
                      next[i] = { ...row, key: v };
                      setRcvInbound(next);
                    }}
                    placeholder="key"
                    placeholderTextColor={colors.textFaint}
                    returnKeyType="done"
                    autoCapitalize="none"
                  />
                  <Text style={{ fontSize: 14, color: accentRcv }}>"</Text>
                  <ArrowRight size={16} color={accentRcv} style={{ marginHorizontal: 6 }} />
                  <TouchableOpacity
                    style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 5, minWidth: 30 }}
                    onPress={() => setHttpReceiveInboundPicker(i)}
                    activeOpacity={0.75}
                  >
                    <Search size={12} color={row.variableName ? accentRcv : "#94a3b8"} />
                    <Text style={{ flex: 1, fontSize: 14,
                      fontWeight: row.variableName ? "700" : "400",
                      color: row.variableName ? accents.purple : colors.textFaint }} numberOfLines={1}>
                      {row.variableName ? `$${row.variableName}` : "search variables…"}
                    </Text>
                  </TouchableOpacity>
                  {i < rcvInbound.length - 1 && (
                    <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 2 }}>,</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setRcvInbound(rcvInbound.filter((_, j) => j !== i))}
                    hitSlop={8} style={{ padding: 5 }}>
                    <Minus size={13} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5,
                  paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setRcvInbound([...rcvInbound, { key: "", variableName: "" }])}
                activeOpacity={0.7}
              >
                <Plus size={12} color={colors.textFaint} />
                <Text style={{ fontSize: 12, color: colors.textFaint }}>add mapping</Text>
              </TouchableOpacity>
              <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                fontSize: 15, color: "#64748b" }}>{"}"}</Text>
            </View>

            <VarPickerModal
              filter={isAssignableVariable}
              visible={httpReceiveInboundPicker !== null}
              title="Select Variable"
              variables={numericVarsRcv}
              selected={httpReceiveInboundPicker !== null ? rcvInbound[httpReceiveInboundPicker]?.variableName : undefined}
              showNone
              onSelect={v => {
                if (httpReceiveInboundPicker === null) return;
                const next = [...rcvInbound];
                next[httpReceiveInboundPicker] = { ...next[httpReceiveInboundPicker], variableName: v?.name ?? "" };
                setRcvInbound(next);
                setHttpReceiveInboundPicker(null);
              }}
              onClose={() => setHttpReceiveInboundPicker(null)}
              create={{ type: "number" }}
              onCreateVariable={onSaveVariable} allVariables={variables}
            />
          </>
        );
      }

      case "Plugin":
        return (
          <PluginStepFields
            key={draft!.id}
            draft={draft!}
            set={set}
            variables={variables}
            contextVariables={contextVariables}
            onSaveVariable={onSaveVariable}
          />
        );

      case "MoveC":
        return (
          <>
            <TouchableOpacity style={ms.modRow} onPress={() => openSubPage("point")} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="End point">
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>End Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color={colors.borderStrong} />
            </TouchableOpacity>
            <View style={[ms.modRow, { flexDirection: "column", alignItems: "stretch" }]}>
              <Text style={ms.subRowLabel}>Via Point</Text>
              <Text style={[ms.hintText, { marginTop: 2 }]}>The arc passes through this point on its way from here to the end point.</Text>
              <TargetRefField
                label="Via point"
                pointId={draft!.viaPointId}
                pointName={draft!.viaPointName}
                expr={draft!.viaPointNameExpr}
                points={points}
                variables={variables}
                onSaveVariable={onSaveVariable}
                onPoint={p => set({ viaPointId: p?.id || undefined, viaPointName: p?.name, viaPointNameExpr: undefined })}
                onExpr={e => set({ viaPointNameExpr: e, ...(e ? { viaPointId: undefined, viaPointName: undefined } : {}) })}
              />
            </View>
            {modifierRow("Override Speed",    speedSet,    speedSummary,    "speed",       speedKeys)}
            {modifierRow("Position Offset",   hasOffset,   offsetSummary,   "posOffset",   offsetKeys)}
            {modifierRow("Position Override", hasOverride, overrideSummary, "posOverride", overrideKeys)}
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              {catalogFields({ only: ["arcTolerance"] })}
            </View>
          </>
        );

      case "Note":
        return (
          <>
            {catalogFields()}
            <Text style={ms.hintText}>
              {draft!.noteStyle === "section"
                ? "A section header: tap its chevron in the step list to fold the steps up to the next section."
                : "A note for whoever reads the program. It is never run."}
            </Text>
          </>
        );

      case "Switch":
        return (
          <>
            {catalogFields()}
            <Text style={ms.hintText}>
              Cases and their values are edited on the block in the step list. The first case with an
              equal value runs, otherwise Default; there is no fall-through.
            </Text>
          </>
        );

      case "Try":
        return (
          <>
            {catalogFields()}
            <Text style={ms.hintText}>
              Runtime failures (timeouts, vision, HTTP, plugins, prompts, Raise Error) are caught; motion
              faults and expression mistakes always stop the program. With no codes ticked, every
              catchable error is caught. An empty Catch ignores the error.
            </Text>
          </>
        );

      case "ListOp": {
        const list = (variables ?? []).find(v => v.name === draft!.variableName);
        const el = list ? variableList(list)?.elementType : undefined;
        const structured = el === "Point" || el === "Record";
        return (
          <>
            {catalogFields({
              skip: structured ? ["listValueExpr"] : el ? ["listFields", "listSortField"] : [],
              special: {
                listFields: () => (
                  <ListFieldsEditor step={draft!} set={set} elementType={el} variables={variables} contextVariables={contextVariables} />
                ),
              },
            })}
            {draft!.listAction === "append" && el === "Point" && !Object.keys(draft!.listFields ?? {}).length && (
              <Text style={ms.hintText}>With no fields set, Append adds the robot&apos;s current position.</Text>
            )}
          </>
        );
      }

      case "Unknown":
        return (
          <View style={{ padding: 16, backgroundColor: "#fef9c3", borderRadius: radii.sm, marginTop: 8 }}>
            <Text style={{ fontSize: 14, color: "#92400e", fontWeight: "600", marginBottom: 6 }}>
              Unrecognized Step Type
            </Text>
            <Text style={{ fontSize: 13, color: "#78350f", lineHeight: 19 }}>
              {draft!.unknownStepType
                ? `This step was saved with type "${draft!.unknownStepType}", which is no longer recognized.`
                : "This step has an unrecognized type and cannot be configured."}
              {"\n\n"}Delete this step to fix the program. The robot will skip it during execution.
            </Text>
          </View>
        );

      default:
        // Every other catalogued step (the v2 blocks and anything without a bespoke editor).
        return catalog.spec(draft!.type) ? catalogFields() : null;
    }
  }

  const subPageTitle: Record<NonNullable<SubPage>, string> = {
    point: "Select Point", speed: "Override Speed",
    posOffset: "Position Offset", toolOffset: "Tool Offset",
    posOverride: "Position Override", jumpHeight: "Jump Height",
    blend: draft.type === "JumpL" ? "Blend Apex Corners" : "Blend Into Next Move",
    moveStop: "Stop or Record on Condition",
  };

  // Move rows sit in one grouped card. Move Arc's via field grows while typing, so it is not
  // clipped into that card.
  const isMove     = draft.type === "MoveL"    || draft.type === "MoveJ"
                  || draft.type === "JumpL"    || draft.type === "JumpJ";
  // A Note's text is its comment, and it never runs — no separate description or status line.
  const isNote     = draft.type === "Note";

  // Problems the fields below do not show themselves (bespoke editors, program-level fields).
  const spec = catalog.spec(draft.type);
  const genericKeys = CATALOG_TYPES.has(draft.type)
    ? new Set((spec?.fields ?? []).filter(f => !f.hidden && isFieldShown(f, draft, spec)).flatMap(fieldClaims))
    : new Set<string>();
  const ownProblems = problems ?? [];
  const looseProblems = ownProblems.filter(p => !p.field || !genericKeys.has(p.field));

  const titleText = draft.name?.trim() || STEP_THEME[draft.type]?.label || "Configure Step";

  // ── Header: sub-page back + title, or the step name (tap to rename) ───────
  const titleNode = subPage ? (
    <Text style={[ms.title, { flex: 1, textAlign: "center", marginHorizontal: 8 }]} numberOfLines={1}>{subPageTitle[subPage]}</Text>
  ) : editingName ? (
    <TextInput
      style={[ms.title, { flex: 1, textAlign: "center", marginHorizontal: 8, paddingVertical: 2 }]}
      value={draft.name ?? ""}
      onChangeText={v => set({ name: v || undefined })}
      placeholder={STEP_THEME[draft.type]?.label ?? "Step name"}
      placeholderTextColor={colors.textFaint}
      autoFocus
      selectTextOnFocus
      returnKeyType="done"
      onSubmitEditing={() => setEditingName(false)}
      onBlur={() => setEditingName(false)}
    />
  ) : (
    <TouchableOpacity
      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 8 }}
      onPress={() => setEditingName(true)}
      activeOpacity={0.7}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Rename step"
    >
      <Text style={ms.title} numberOfLines={1}>{titleText}</Text>
      <Pencil size={14} color={colors.textFaint} />
    </TouchableOpacity>
  );

  // ── Body (shared by the centred modal and the phone page) ──────────────────
  const mainPage = (
    <>
      {/* Plugin steps open with what they are: plugin · step and its description. */}
      {draft.type === "Plugin" && <PluginStepHeader step={draft} />}

      {/* What this block does, from the catalog — one line, so every block explains itself. */}
      {!!spec?.description && draft.type !== "Plugin" && (
        <Text style={[ms.hintText, { marginTop: 0, marginBottom: 12 }]}>{spec.description}.</Text>
      )}

      {/* The controller's problems that no field below shows itself. */}
      {looseProblems.length > 0 && (
        <View style={sc.problemBox}>
          {looseProblems.map((p, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
              <AlertTriangle size={13} color={p.severity === "error" ? colors.danger : colors.warning} style={{ marginTop: 2 }} />
              <Text style={[sc.problemText, p.severity !== "error" && { color: colors.warning }]}>{p.message}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Description (a note for editors, never executed) — at the very top, collapsed to
          an "Add" button until it has content so it takes no room when unused. */}
      {!isNote && ((draft.comment || showComment) ? (
        <>
          <Text style={ms.fieldLabel}>DESCRIPTION  (optional)</Text>
          <TextInput
            style={[ms.input, { marginBottom: 14, minHeight: 56 }]}
            value={draft.comment ?? ""}
            onChangeText={v => set({ comment: v.trim() ? v : undefined })}
            placeholder="What this step does — a note for whoever edits next. Never executed."
            placeholderTextColor={colors.textFaint}
            multiline
            textAlignVertical="top"
            autoFocus={showComment && !draft.comment}
          />
        </>
      ) : (
        <TouchableOpacity style={[ms.modRowAdd, { marginBottom: 12 }]} onPress={() => setShowComment(true)} activeOpacity={0.7}>
          <Plus size={15} color={colors.textFaint} />
          <Text style={ms.modAddText}>Add description</Text>
        </TouchableOpacity>
      ))}

      {/* Status description — the optional runtime message shown in the monitor while this
          step runs. Same collapse-when-empty treatment. */}
      {draft.type !== "StatusUpdate" && draft.type !== "EndProgram" && !isNote && ((draft.statusMessage || showStatus) ? (
        <>
          <Text style={ms.fieldLabel}>STATUS DESCRIPTION  (optional)</Text>
          <View style={{ marginBottom: 14 }}>
            <TemplateInput
              style={ms.input}
              value={draft.statusMessage ?? ""}
              onChange={v => set({ statusMessage: v || undefined })}
              placeholder="Shown in monitor while this step runs"
              variables={variables}
              autoCapitalize="sentences"
              create={{ type: "number" }} onCreateVariable={onSaveVariable} allVariables={variables}
            />
          </View>
        </>
      ) : (
        <TouchableOpacity style={[ms.modRowAdd, { marginBottom: 12 }]} onPress={() => setShowStatus(true)} activeOpacity={0.7}>
          <Plus size={15} color={colors.textFaint} />
          <Text style={ms.modAddText}>Add status description</Text>
        </TouchableOpacity>
      ))}

      {/* Sub-row buttons for moves, inline body for everything else */}
      {isMove ? <View style={ms.subRowCard}>{renderMainBody()}</View> : renderMainBody()}
    </>
  );

  const scrollBody = (
    <ScrollView ref={kbScrollRef}
      onScroll={kbOnScroll}
      scrollEventThrottle={16}
      // flexShrink + minHeight:0 so the body yields to the pinned footer when the card is
      // capped (keyboard up) — the footer then never overlaps the fields, and the body scrolls.
      style={pageMode ? { flex: 1 } : { flexShrink: 1, minHeight: 0 }}
      showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      // Room to scroll a bottom field up above the keyboard (the body extends behind it).
      contentContainerStyle={pageMode
        ? { padding: 16, paddingBottom: Math.max(kbPadBottom, insets.bottom + 24) }
        : { paddingBottom: kbPadBottom }}>
      {subPage ? renderSubPage() : mainPage}
    </ScrollView>
  );

  // A sub-page confirms/cancels just its own edit. On the centred modal the main page saves or
  // cancels everything; the phone page has no footer — its edits are already in the program.
  const subPageFooter = (
    <View style={[ms.actions, pageMode && { paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }]}>
      <TouchableOpacity style={ms.cancelBtn} activeOpacity={0.7}
        onPress={() => { if (subPageSnapshot.current) setDraft(subPageSnapshot.current); setSubPage(null); }}>
        <Text style={ms.cancelText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity style={ms.saveBtn} activeOpacity={0.7} onPress={closeSubPageDone}>
        <Check size={15} color="white" />
        <Text style={ms.saveText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  const back = () => (subPage ? closeSubPageDone() : pageMode ? closePage() : onClose());

  return (
    <>
    {pageMode ? (
      <Modal visible={visible} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={back}>
        <View onLayout={kbOnCardLayout} style={[sc.page, { paddingTop: insets.top }, kbCardStyle]}>
          <View style={sc.pageHeader}>
            <TouchableOpacity onPress={back} hitSlop={12} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={subPage ? "Back to the step" : "Close step"}>
              <ArrowLeft size={20} color={colors.text} />
            </TouchableOpacity>
            {titleNode}
            {subPage ? <View style={{ width: 52 }} /> : (
              <TouchableOpacity onPress={closePage} hitSlop={8} activeOpacity={0.7} style={sc.doneBtn}
                accessibilityRole="button" accessibilityLabel="Done">
                <Text style={sc.doneText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
          {scrollBody}
          {subPage && subPageFooter}
        </View>
      </Modal>
    ) : (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={back}>
        <View style={ms.overlay}>
          {/* Backdrop sits BEHIND the card (not wrapping it) so the card's
              ScrollView owns its gestures cleanly — a Pressable wrapping the
              ScrollView blocks scrolling when a drag starts on a focused input. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={back} />
          <View style={wide ? ms.wideRow : { width: "100%", maxWidth: cardWidth }}>
          {wide && (
            <ExpressionHelperPanel
              variables={variables}
              contextVariables={contextVariables}
              contextLabel="Caller Variables"
              style={{ width: panelWidth, maxHeight: cardMaxHeight }}
            />
          )}
          <View onLayout={kbOnCardLayout} style={[ms.card, wide
            ? { width: wideCardWidth, maxWidth: wideCardWidth, maxHeight: cardMaxHeight }
            : { maxWidth: cardWidth, maxHeight: cardMaxHeight }, kbCardStyle]}>
            {/* Header */}
            <View style={ms.header}>
              {subPage ? (
                <TouchableOpacity onPress={closeSubPageDone} hitSlop={12} activeOpacity={0.7}>
                  <ArrowLeft size={18} color={colors.text} />
                </TouchableOpacity>
              ) : <View style={{ width: 18 }} />}
              {titleNode}
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>

            {scrollBody}

            {subPage ? subPageFooter : (
              <View style={ms.actions}>
                <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={ms.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={ms.saveBtn}
                  onPress={() => {
                    onSave(draft);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Check size={15} color="white" />
                  <Text style={ms.saveText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          </View>
        </View>
    </Modal>
    )}
    {/* Thread preset picker */}
    <BottomSheet visible={threadPresetPickerOpen} onClose={() => setThreadPresetPickerOpen(false)} title="Select Thread Size">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
        {(['metric', 'imperial'] as const).map(group => (
          <View key={group}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {group === 'metric' ? 'Metric' : 'Imperial UNC'}
            </Text>
            {THREAD_PRESETS.filter(p => p.group === group).map((p, i, arr) => {
              const active = draft?.threadPitch != null && Math.abs(draft.threadPitch - p.pitch) < 0.001;
              return (
                <TouchableOpacity key={p.label}
                  style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => { set({ threadPitch: p.pitch }); setThreadPresetPickerOpen(false); }}
                  activeOpacity={0.7}>
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{p.label}</Text>
                    <Text style={ms.rowDesc}>{p.pitch.toFixed(3)} mm / revolution</Text>
                  </View>
                  {active && <Check size={16} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>

    <VarPickerModal
      filter={isAssignableVariable}
      visible={moveStopPosVarPicker}
      onClose={() => setMoveStopPosVarPicker(false)}
      variables={moveStopPosVars}
      selected={draft?.moveStopPositionVariableName}
      title="Record Position Variable"
      showNone
      create={moveStopIsAux ? { type: "number" } : { type: "list", elementType: "Point" }}
      onCreateVariable={onSaveVariable} allVariables={variables}
      onSelect={v => { set({ moveStopPositionVariableName: v?.name }); setMoveStopPosVarPicker(false); }}
    />
    <VarPickerModal
      filter={isAssignableVariable}
      visible={moveStopFlagVarPicker}
      onClose={() => setMoveStopFlagVarPicker(false)}
      variables={moveStopFlagVars}
      selected={draft?.moveStopFlagVariableName}
      title="Fired Flag Variable"
      showNone
      create={{ type: "boolean" }}
      onCreateVariable={onSaveVariable} allVariables={variables}
      onSelect={v => { set({ moveStopFlagVariableName: v?.name }); setMoveStopFlagVarPicker(false); }}
    />
    </>
  );
}

// Load-cell shortcut chips on the stop-condition card — cyan, the condition editor's accent.
const stopCond = StyleSheet.create({
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: "#bae6fd", backgroundColor: colors.accentSoft,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: accents.cyan },
});

// The phone full-page editor and the problems box.
const sc = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  pageHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  doneBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.accent },
  doneText: { fontSize: 14, fontWeight: "700", color: colors.onAccent },
  problemBox: {
    gap: 4, padding: 10, marginBottom: 12, borderRadius: radii.sm,
    backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder,
  },
  problemText: { flex: 1, fontSize: 12, color: colors.danger, lineHeight: 16 },
  paramCard: {
    marginTop: 10, padding: 10, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted,
  },
  modeChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: accents.purpleSoft },
  modeChipText: { fontSize: 10, fontWeight: "800", color: accents.purple, letterSpacing: 0.4 },
});

// ── Routine parameters (CallRoutine) ─────────────────────────────────────────

const PARAM_MODE_LABEL: Record<NonNullable<ProgramVariable["paramMode"]>, string> = { in: "IN", out: "OUT", inOut: "IN-OUT" };

/** The caller variables a parameter's result may be copied into. */
const paramVarKinds = (p: ProgramVariable): string[] =>
  p.isString ? ["string"] : p.isBoolean ? ["boolean", "number"] : isListVariable(p) ? ["list"] : ["number"];

/**
 * One row per parameter of the called routine: an argument for `in` / `in-out` parameters
 * (worked out in the caller before the routine starts) and a target variable for `out` /
 * `in-out` ones (filled when it returns). Parameters are routine variables marked In, Out or
 * In-Out in the routine's variable editor.
 */
function RoutineParamsSection({ step, routine, set, variables, contextVariables, onSaveVariable }: {
  step: ProgramStep;
  routine: { variables?: ProgramVariable[] } | undefined;
  set: (fields: Partial<ProgramStep>) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
}) {
  if (!routine) return null;
  const params = (routine.variables ?? []).filter(v => !!v.paramMode);
  if (params.length === 0) {
    return (
      <Text style={[ms.hintText, { marginTop: 12 }]}>
        This routine takes no parameters. To pass values in or out, open the routine and mark a
        variable as an In, Out or In-Out parameter.
      </Text>
    );
  }
  const args = step.routineArgs ?? {};
  const outs = step.routineOutputs ?? [];
  const setArg = (name: string, value: string) => {
    const next = { ...args };
    if (value.trim()) next[name] = value; else delete next[name];
    set({ routineArgs: Object.keys(next).length ? next : undefined });
  };
  const setOut = (name: string, variableName: string | undefined) => {
    const next = outs.filter(o => o.key !== name);
    if (variableName) next.push({ key: name, variableName });
    set({ routineOutputs: next.length ? next : undefined });
  };
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={ms.fieldLabel}>PARAMETERS</Text>
      <Text style={ms.hintText}>Arguments are worked out here before the routine starts; results are copied back when it returns.</Text>
      {params.map(p => {
        const mode = p.paramMode!;
        const takesIn = mode === "in" || mode === "inOut";
        const givesOut = mode === "out" || mode === "inOut";
        const fallback = p.isString ? (p.stringValue ?? "") : (p.valueExpression?.trim() || String(p.value ?? 0));
        return (
          <View key={p.id} style={sc.paramCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: accents.purple, flex: 1 }}>${p.name}</Text>
              <View style={sc.modeChip}><Text style={sc.modeChipText}>{PARAM_MODE_LABEL[mode]}</Text></View>
            </View>
            {!!p.description && <Text style={[ms.hintText, { marginTop: 2 }]}>{p.description}</Text>}
            {takesIn && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 8 }]}>VALUE</Text>
                {p.isString ? (
                  <TemplateInput style={ms.input} value={args[p.name] ?? ""} onChange={v => setArg(p.name, v)}
                    placeholder={fallback ? `"${fallback}" (routine default)` : "text"} variables={variables}
                    create={{ type: "string" }} onCreateVariable={onSaveVariable} allVariables={variables} />
                ) : (
                  <ExpressionField value={args[p.name] ?? ""} onChange={v => setArg(p.name, v)}
                    title={`${p.name} argument`} placeholder={`${fallback} (routine default)`}
                    variables={variables} contextVariables={contextVariables} style={ms.input} />
                )}
              </>
            )}
            {givesOut && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 8 }]}>COPY RESULT TO</Text>
                <CatalogVarField field={{ label: `${p.name} result`, varKinds: paramVarKinds(p) }}
                  value={outs.find(o => o.key === p.name)?.variableName} onChange={v => setOut(p.name, v)}
                  variables={variables} onSaveVariable={onSaveVariable} write />
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Teach here (move target) ─────────────────────────────────────────────────

/**
 * Teach the move's target from where the robot is now: save the live position as a new point
 * (the step then links to it by id), or move the selected point to here after a confirm.
 */
function TeachHere({ points, selected, onTaught }: {
  points: { id: string; name: string }[];
  selected: { id: string; name: string } | undefined;
  onTaught: (name: string) => void;
}) {
  const connected = useConnected();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!connected) return null;
  const trimmed = name.trim();
  const taken = !!trimmed && points.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
  const saveNew = async () => {
    if (!trimmed || taken || busy) return;
    setBusy(true);
    try {
      await robotClient.sendCommand("TeachPoint", { name: trimmed });
      onTaught(trimmed);
      setNaming(false);
      setName("");
    } catch {
      appAlert("Point not saved", "The robot did not accept the new point. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const update = () => {
    if (!selected) return;
    appAlert(`Move "${selected.name}" here?`,
      "Its stored position is replaced with where the robot is now, so every step that uses this point goes there. The old position stays in the point's history.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Update Point", onPress: () => { robotClient.sendCommand("TeachPoint", { name: selected.name }).catch(() =>
          appAlert("Point not updated", "The robot did not accept the change. Check the connection and try again.")); } },
      ]);
  };
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <Text style={ms.fieldLabel}>TEACH FROM THE ROBOT</Text>
      {naming ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              style={[ms.input, { flex: 1, marginTop: 0 }]}
              value={name}
              onChangeText={setName}
              placeholder="New point name"
              placeholderTextColor={colors.textFaint}
              autoFocus
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={saveNew}
              aria-label="New point name"
            />
            <TouchableOpacity style={[ms.saveBtn, { flex: 0, paddingHorizontal: 14 }, (!trimmed || taken || busy) && { opacity: 0.4 }]}
              onPress={saveNew} disabled={!trimmed || taken || busy} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="Save point here">
              <Check size={15} color="white" />
              <Text style={ms.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
          {taken && <Text style={ms.fieldError}>A point with this name already exists — pick it above, or use another name.</Text>}
        </>
      ) : (
        <TouchableOpacity style={ms.modRowAdd} onPress={() => setNaming(true)} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel="Save current position as new point">
          <Crosshair size={15} color={colors.accent} />
          <Text style={[ms.modAddText, { color: colors.accent }]}>Save current position as a new point…</Text>
        </TouchableOpacity>
      )}
      {selected && (
        <TouchableOpacity style={ms.modRowAdd} onPress={update} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`Update ${selected.name} to here`}>
          <RotateCcw size={15} color={colors.textMuted} />
          <Text style={ms.modAddText}>Update &quot;{selected.name}&quot; to the current position</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── List element fields (ListOp) ─────────────────────────────────────────────

/** The fields a ListOp writes on a Point / Record element (`set field` writes just one). */
function ListFieldsEditor({ step, set, elementType, variables, contextVariables }: {
  step: ProgramStep;
  set: (fields: Partial<ProgramStep>) => void;
  elementType: string | undefined;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const suggest = elementType === "Point" ? ["x", "y", "z", "rz"] : [];
  return (
    <View>
      <Text style={[ms.fieldLabel, { marginTop: 12 }]}>{step.listAction === "setField" ? "FIELD" : "FIELDS"}</Text>
      <ExprMapField label="Field" value={step.listFields} onChange={v => set({ listFields: v })}
        variables={variables} contextVariables={contextVariables} suggest={suggest} keyPlaceholder="field" />
      <Text style={ms.hintText}>
        {step.listAction === "setField"
          ? "The one field of the element at the index to change, and its new value."
          : "Each field of the new element and the expression it gets."}
      </Text>
    </View>
  );
}
