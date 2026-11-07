import { ActionButton } from "@/src/components/ui/ActionButton";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { appAlert } from "@/src/components/ui/AppAlert";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { useBuiltPrograms, useConnected, usePoints, useProgramSummaries } from "@/src/providers/RobotProvider";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { isNotImplementedCommand, robotClient } from "@/src/services/RobotConnectService";
import { BuiltProgram, EditorMode, ListElementType, PluginStepContribution, Point, ProgramStep, ProgramVariable, StepType, ValidationProblem, imageDataUri, isStepEnabled, variableList } from "@/src/models/robotModels";
import { findStep, mapStepTree, walkSteps } from "@/src/models/stepTree";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  GitBranch,
  Play,
  Search,
  ShieldCheck,
  ChevronsRight,
  ClipboardPaste,
  Copy,
  Cpu,
  History as HistoryIcon,
  ImagePlus,
  Plus,
  Power,
  Repeat,
  Repeat2,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import React, { SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { StepConfigModal } from "@/src/components/ui/builder/StepConfigModal";
import { StepTypePicker } from "@/src/components/ui/builder/StepTypePicker";
import { usePluginContributions } from "@/src/components/ui/builder/usePluginContributions";
import { useStepCatalog } from "@/src/components/ui/builder/useStepCatalog";
import { useBreakpoints } from "@/src/components/ui/builder/useBreakpoints";
import * as TextView from "@/src/components/ui/builder/TextProgramView";
import { pluginStepFields } from "@/src/components/ui/builder/pluginSteps";
import { StepRow, InsertDivider } from "@/src/components/ui/builder/StepRow";
import { useDragReorder } from "@/src/components/ui/useDragReorder";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { insertAt, locateStep, mapStepsById, moveRefusal, moveStep, removeStepsById, replaceStepById, sameScope, topSelected } from "@/src/components/ui/builder/stepEdits";
import { conditionSummary } from "@/src/components/ui/builder/ConditionEditor";
import { VarType, VariableEditModal } from "@/src/components/ui/builder/VariableEditModal";
import { renameVariableInSteps, renameVariableInVariables } from "@/src/components/ui/builder/renameVariable";
import {
  STEP_THEME, ScopeFrame, backfillPointIds, bodyFrames, bodyOf, caseValuesText, categoryForStep, getStepsAtScope,
  isBlockStep, newId, newStep, setStepsAtScope, stepDetail, stepLabel,
} from "@/src/components/ui/builder/stepUtils";
import { cloneForPaste, detachedCopy, useStepClipboard } from "@/src/components/ui/builder/stepClipboard";
import { ms } from "@/src/components/ui/builder/builderStyles";
import { usePaneLayout, wide } from "@/src/components/ui/responsive";
import { useDocumentHistory } from "@/src/components/ui/builder/useDocumentHistory";
import { EMPTY_DOC, EditorDoc, docFromProgram, docSnapshot, programFromDoc, validScopeDepth } from "@/src/components/ui/builder/editorDocument";
import { EditorToolbar, ToolbarButton, useUndoShortcuts } from "@/src/components/ui/builder/EditorToolbar";
import { RevisionsSheet } from "@/src/components/ui/builder/RevisionsSheet";
import { findStepLocation, indexProblems, useProgramValidation } from "@/src/components/ui/builder/useProgramValidation";
import { ProblemsPill, ValidationPanel } from "@/src/components/ui/builder/ValidationPanel";
import { ExpressionEnvProvider } from "@/src/components/ui/builder/expressions/ExpressionEnv";
import { ActiveFieldProvider } from "@/src/components/ui/builder/expressions/ActiveField";
import { PropertiesSection } from "@/src/components/ui/builder/expressions/PropertiesSection";
import { accents, colors, InfoTip, PageHeader, radii, shadows, spacing, type } from "@/src/components/ui/kit";

/**
 * Lists are one variable type now, so the chip on a variable row names the element type
 * instead — which is the part that actually changes how the variable is used.
 */
const LIST_CHIP: Record<ListElementType, { label: string; color: string; bg: string; border: string }> = {
  Number:  { label: "LIST",    color: accents.purple, bg: accents.purpleSoft, border: accents.purpleBorder },
  Boolean: { label: "FLAGS",   color: colors.success, bg: colors.successSoft, border: colors.successBorder },
  Point:   { label: "POINTS",  color: accents.cyan, bg: accents.cyanSoft, border: accents.cyanBorder },
  Record:  { label: "OBJECTS", color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4" },
};

function describeList(list: { elementType: ListElementType; items: unknown[] }): string {
  const n = list.items.length;
  // Point and record lists are normally filled by RunVision at runtime, so an empty one
  // is the expected state rather than something the user forgot to populate.
  if (list.elementType === "Point")   return `List of points — ${n} item${n === 1 ? "" : "s"}, populated by RunVision`;
  if (list.elementType === "Record")  return `List of objects — ${n} item${n === 1 ? "" : "s"}, populated by RunVision`;
  if (list.elementType === "Boolean") return `List of booleans — ${n} item${n === 1 ? "" : "s"}`;
  return `List of numbers — ${n} item${n === 1 ? "" : "s"}`;
}

/**
 * The initial-value line under a variable's name, for the scalar types that can carry an
 * expression.
 *
 * An expression is shown verbatim rather than reduced to the number it last evaluated to.
 * That number is only the editor's cached fallback — showing it would read as a fixed
 * starting value and hide the fact that this variable is computed at all.
 */
function InitialValue({ v }: { v: ProgramVariable }) {
  const expr = v.valueExpression?.trim();
  return (
    <Text style={styles.varDesc}>
      {v.isBoolean ? "Boolean — initial: " : "Initial: "}
      {expr
        ? <Text style={{ color: accents.purple, fontWeight: "700" }}>{expr}</Text>
        : v.isBoolean ? (v.value !== 0 ? "True" : "False") : String(v.value)}
    </Text>
  );
}

/** Matches the Computed kind in VariableEditModal and the picker chip. */
const COMPUTED_TINT = "#be185d";

/**
 * The formula line of a computed variable, shown where a stored variable shows its
 * initial value. A computed variable has no initial value: the formula is what it is.
 */
function ComputedFormula({ v }: { v: ProgramVariable }) {
  return (
    <Text style={styles.varDesc} numberOfLines={2}>
      {v.isBoolean ? "Boolean — " : ""}
      <Text style={{ color: COMPUTED_TINT, fontWeight: "700" }}>{v.valueExpression?.trim() || "(no formula)"}</Text>
    </Text>
  );
}

/** Where a new or pasted step goes: the list (by scope from the program root) and the index. */
type InsertAt = { scope: ScopeFrame[]; index: number };

// ── Visible rows ──────────────────────────────────────────────────────────────
// The step list on screen is flattened into rows: the steps of the current scope, and — for a
// block whose chevron is open — a header row per body, that body's steps (indented), and an end
// row. Drag bars reorder over these rows, so a step can be dropped into, out of or across bodies;
// where it lands is read off the row it ends up below (see dropRow).

/** Bodies show inline up to two levels deep; deeper blocks keep their Enter pills. */
const MAX_INLINE_DEPTH = 2;
const INDENT = 14;

type StepFlatRow = {
  kind: "step"; id: string; step: ProgramStep; depth: number;
  /** The list it sits in, from the program root. */
  scope: ScopeFrame[]; index: number; listLen: number;
  expandable: boolean; expanded: boolean;
  /** An expanded block's first body (a drop right below the block lands at its top). */
  firstBody?: ScopeFrame[];
  /** Section notes: folded, and how many steps that hides. */
  folded?: boolean; hiddenCount?: number;
};
type BodyFlatRow = { kind: "body"; id: string; depth: number; parent: ProgramStep; frame: ScopeFrame; scope: ScopeFrame[]; count: number };
type EndFlatRow = { kind: "end"; id: string; depth: number; parent: ProgramStep; scope: ScopeFrame[]; index: number; listLen: number };
type FlatRow = StepFlatRow | BodyFlatRow | EndFlatRow;

function buildRows(
  list: ProgramStep[],
  scope: ScopeFrame[],
  expanded: ReadonlySet<string>,
  folded: ReadonlySet<string>,
  points: Point[] | undefined,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (items: ProgramStep[], at: ScopeFrame[], depth: number) => {
    let section: StepFlatRow | null = null;
    items.forEach((s, index) => {
      const isSection = s.type === "Note" && s.noteStyle === "section";
      if (isSection) {
        section = { kind: "step", id: s.id, step: s, depth, scope: at, index, listLen: items.length,
          expandable: false, expanded: false, folded: folded.has(s.id), hiddenCount: 0 };
        rows.push(section);
        return;
      }
      if (section?.folded) { section.hiddenCount = (section.hiddenCount ?? 0) + 1; return; }
      const expandable = isBlockStep(s) && depth < MAX_INLINE_DEPTH;
      const isOpen = expandable && expanded.has(s.id);
      const frames = isOpen ? bodyFrames(s, points).map(f => ({ ...f, stepId: s.id })) : [];
      rows.push({ kind: "step", id: s.id, step: s, depth, scope: at, index, listLen: items.length,
        expandable, expanded: isOpen, firstBody: frames[0] ? [...at, frames[0]] : undefined });
      if (!isOpen) return;
      for (const frame of frames) {
        const bodyScope = [...at, frame];
        const body = bodyOf(s, frame) ?? [];
        rows.push({ kind: "body", id: `${s.id}|${frame.kind}|${frame.branchId ?? ""}`, depth: depth + 1,
          parent: s, frame, scope: bodyScope, count: body.length });
        walk(body, bodyScope, depth + 1);
      }
      rows.push({ kind: "end", id: `${s.id}|end`, depth: depth + 1, parent: s, scope: at, index, listLen: items.length });
    });
  };
  walk(list, scope, 0);
  return rows;
}

// Step search: what a step can be found by — its block name, row label and summary, its own
// name and comment, and every value it stores (so `$count` finds the steps that use it, and a
// point's name the moves to it). Field names are not searched, only values.
const BODY_KEYS = new Set<string>(["loopSteps", "ifSteps", "elseSteps", "switchDefault", "trySteps", "catchSteps", "cncProgramSteps", "steps"]);
function stepValues(node: unknown, out: string[]) {
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return; }
  if (Array.isArray(node)) { node.forEach(x => stepValues(x, out)); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) if (!BODY_KEYS.has(k) && k !== "id" && k !== "type") stepValues(v, out);
  }
}
function searchText(step: ProgramStep, points: Point[] | undefined): string {
  const values: string[] = [];
  stepValues(step, values);
  return [
    STEP_THEME[step.type]?.label, stepLabel(step, points), stepDetail(step, undefined, undefined, points),
    ...values,
  ].filter(Boolean).join(" • ").toLowerCase();
}

/** The tint of a body header badge. */
function bodyTint(kind: ScopeFrame["kind"]): string {
  switch (kind) {
    case "ifTrue": case "switchCase": case "try": return accents.cyan;
    case "elseIf": return accents.purple;
    case "catch": return colors.danger;
    case "loop": return categoryForStep("Loop").color;
    default: return colors.textMuted;
  }
}

/** The header of a body shown inline: its badge, its condition / values, and add + enter. */
function BodyHeaderRow({ row, condition, onEdit, onAdd, onPaste, onEnter, disabled }: {
  row: BodyFlatRow;
  condition?: string;
  onEdit?: () => void;
  onAdd: () => void;
  onPaste?: () => void;
  onEnter: () => void;
  disabled?: boolean;
}) {
  const tint = bodyTint(row.frame.kind);
  const badge = row.frame.kind === "loop" ? "REPEAT"
    : row.frame.kind === "switchCase" ? "CASE"
    : row.frame.label;
  const text = row.frame.kind === "switchCase" ? caseValuesText(row.parent.switchCases?.find(c => c.id === row.frame.branchId)?.values)
    : row.frame.kind === "loop" ? ""
    : condition ?? "";
  return (
    <View style={styles.bodyHeader}>
      <View style={[styles.bodyBadge, { backgroundColor: tint }]}>
        <Text style={styles.bodyBadgeText}>{badge}</Text>
      </View>
      <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={onEdit ?? onEnter} activeOpacity={0.7} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={onEdit ? `Edit ${badge}` : `Enter ${badge}`}>
        <Text style={styles.bodyText} numberOfLines={1}>
          {text || (row.count === 0 ? "" : `${row.count} step${row.count === 1 ? "" : "s"}`)}
          {row.count === 0 ? <Text style={styles.bodyEmpty}>{text ? "  ·  empty" : "empty — add a step"}</Text> : null}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onAdd} hitSlop={6} disabled={disabled} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={`Add a step to ${badge}`}>
        <View style={styles.bodyAddBtn}><Plus size={11} color={colors.accent} /></View>
      </TouchableOpacity>
      {onPaste && (
        <TouchableOpacity onPress={onPaste} hitSlop={6} disabled={disabled} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`Paste into ${badge}`}>
          <View style={styles.bodyPasteBtn}><ClipboardPaste size={11} color={accents.purple} /></View>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onEnter} hitSlop={6} disabled={disabled} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel={`Open ${badge} on its own`}>
        <ChevronRight size={15} color={tint} />
      </TouchableOpacity>
    </View>
  );
}

export default function BuilderScreen() {
  const { name: editName, isRoutine: isRoutineParam, source: sourceParam, callerName: callerNameParam } = useLocalSearchParams<{ name?: string; isRoutine?: string; source?: string; callerName?: string }>();
  const builtPrograms = useBuiltPrograms();
  const connected     = useConnected();
  // Plugin steps/functions for the picker, config form and step labels; refetched on reconnect.
  usePluginContributions(connected);
  // The controller's step catalog (labels, typed fields, text syntax); refetched on reconnect.
  // An older controller has none — the built-in tables in stepUtils stand in.
  useStepCatalog(connected);
  const points        = usePoints();
  const paneLayout    = usePaneLayout();
  const isWide        = paneLayout !== "single";
  const isSplit       = paneLayout === "split";
  const isLocalMode   = sourceParam === 'local';

  const existing = !isLocalMode && editName
    ? builtPrograms.find(p => p.name === editName) ?? null
    : null;

  // ── Editable document + undo history ────────────────────────────────────
  // Everything the user can edit lives in one EditorDoc so undo/redo and the
  // unsaved-changes check see the same value. The setters below are the only
  // way to change it, and every one routes through history.commit.
  const history = useDocumentHistory<EditorDoc>(() => {
    const isRoutine = isRoutineParam === "1" || existing?.isRoutine === true;
    return existing ? docFromProgram(existing, { isRoutine }) : { ...EMPTY_DOC, isRoutine };
  }, { limit: 100 });
  const { doc, commit } = history;
  const {
    name: programName, description, steps, variables,
    isRoutine: isRoutineMode, isBackground: isBackgroundMode, killBackgroundOnStop,
  } = doc;

  const setSteps = useCallback((u: SetStateAction<ProgramStep[]>) =>
    commit(d => ({ ...d, steps: typeof u === "function" ? u(d.steps) : u })), [commit]);
  const setVariables = useCallback((u: SetStateAction<ProgramVariable[]>) =>
    commit(d => ({ ...d, variables: typeof u === "function" ? u(d.variables) : u })), [commit]);
  // Typing coalesces, so one undo reverts a burst of keystrokes rather than one letter.
  const setProgramName = (name: string) => commit(d => ({ ...d, name }), { coalesceKey: "name" });
  const setDescription = (description: string) => commit(d => ({ ...d, description }), { coalesceKey: "description" });
  const setIsRoutineMode        = (isRoutine: boolean)            => commit(d => ({ ...d, isRoutine }));
  const setIsBackgroundMode     = (isBackground: boolean)         => commit(d => ({ ...d, isBackground }));
  const setKillBackgroundOnStop = (killBackgroundOnStop: boolean) => commit(d => ({ ...d, killBackgroundOnStop }));

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [contextProgramName, setContextProgramName] = useState<string | undefined>(callerNameParam ?? undefined);
  const [contextPickerOpen,  setContextPickerOpen]  = useState(false);

  const [programId, setProgramId]     = useState<string | undefined>(existing?.id);
  // Blocks | Text — the program's preferred view (BuiltProgram.editorMode). A view switch is
  // not an edit: it is kept out of the undo document and saved with the program.
  const [editorMode, setEditorMode]   = useState<EditorMode>(existing?.editorMode ?? "blocks");
  const breakpoints = useBreakpoints(programId);
  const [coverImage, setCoverImage]   = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(isLocalMode && !!editName);

  // Snapshot of the last-saved document used to detect unsaved changes. Undoing
  // back to it reads as clean again.
  const [savedSnapshot, setSavedSnapshot] = useState(() => docSnapshot(history.doc));
  const markSaved = (d: EditorDoc) => setSavedSnapshot(docSnapshot(d));
  const isDirty = useMemo(() => docSnapshot(doc) !== savedSnapshot, [doc, savedSnapshot]);

  const contextVariables = useMemo(() => {
    if (!isRoutineMode || !contextProgramName) return [];
    return builtPrograms.find(p => p.name === contextProgramName)?.variables ?? [];
  }, [isRoutineMode, contextProgramName, builtPrograms]);

  // Load local program from AsyncStorage when editing in local mode
  useEffect(() => {
    if (!isLocalMode || !editName) return;
    Promise.all([
      LocalProgramService.getAll(),
      LocalProgramService.getImage(editName),
    ]).then(([programs, img]) => {
      const prog = programs.find(p => p.name === editName);
      if (prog) {
        const loaded = docFromProgram(prog);
        history.reset(loaded);
        markSaved(loaded);
        if (prog.id) setProgramId(prog.id);
        if (prog.editorMode) setEditorMode(prog.editorMode);
      }
      if (img) setCoverImage(img);
      setLocalLoading(false);
    });
  }, []);

  // Load existing cover image when editing a robot program
  useEffect(() => {
    if (!editName || isLocalMode) return;
    robotClient.getProgramImages()
      .then(imgs => { if (imgs[editName]) setCoverImage(imgs[editName]!); })
      .catch(() => {});
  }, [editName]);

  // (Re)load the robot program when it becomes available. Loading is not an
  // edit: it replaces the history and becomes the saved state.
  useEffect(() => {
    if (existing) {
      const loaded = docFromProgram(existing, { isRoutine: isRoutineMode || existing.isRoutine === true });
      history.reset(loaded);
      markSaved(loaded);
      if (existing.id) setProgramId(existing.id);
      if (existing.editorMode) setEditorMode(existing.editorMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.name]);

  // ── Cover image helpers ────────────────────────────────────────────────────

  async function processImage(uri: string): Promise<string> {
    // Get image dimensions so we can square-crop from the centre
    const info = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
    const { width, height } = info;
    const side = Math.min(width, height);
    const cropActions: ImageManipulator.Action[] = [
      {
        crop: {
          originX: Math.floor((width  - side) / 2),
          originY: Math.floor((height - side) / 2),
          width:  side,
          height: side,
        },
      },
      { resize: { width: 400, height: 400 } },
    ];
    const result = await ImageManipulator.manipulateAsync(uri, cropActions, {
      compress: 0.72,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return result.base64!;
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      appAlert("Permission needed", "Camera access is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled) return;
    const b64 = await processImage(result.assets[0].uri);
    setCoverImage(b64);
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert("Permission needed", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      mediaTypes: "images",
    });
    if (result.canceled) return;
    const b64 = await processImage(result.assets[0].uri);
    setCoverImage(b64);
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────

  // Shared across builder instances so a copy made inside a pushed routine
  // survives backing out to the parent program (and pastes across programs).
  const [clipboard, setClipboard] = useStepClipboard();

  // The clipboard only ever holds detached copies (stepClipboard.detachedCopy), so a later edit
  // can never reach into it; a paste clones again with fresh ids for every nested step.
  function pasteStep(at: InsertAt) {
    if (clipboard.length === 0) return;
    const clones = clipboard.map(cloneForPaste);
    setSteps(prev => insertAt(prev, at.scope, at.index, clones));
  }

  // ── Multi-select mode ─────────────────────────────────────────────────────

  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function enterSelect(id: string) {
    if (selectMode) { toggleSelect(id); return; }
    setSelectMode(true);
    setSelectedIds([id]);
  }
  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function exitSelect() {
    setSelectMode(false);
    setSelectedIds([]);
  }

  // The selected steps that are not inside another selected one, in program order. Rows of an
  // inline body can be selected with the list they sit in.
  function selectedInOrder(): ProgramStep[] {
    return topSelected(getStepsAtScope(steps, scopeStackRef.current), new Set(selectedIds));
  }

  function copySelected() {
    const sel = selectedInOrder();
    if (sel.length === 0) return;
    // Store detached copies so the clipboard is immune to later edits/re-renders.
    setClipboard(sel.map(detachedCopy));
    exitSelect();
  }

  // Cut = copy the selection to the clipboard, then remove it from the program.
  // No confirmation: it's non-destructive (still on the clipboard to paste back).
  function cutSelected() {
    const sel = selectedInOrder();
    if (sel.length === 0) return;
    setClipboard(sel.map(detachedCopy));
    const ids = new Set(sel.map(s => s.id));
    setSteps(prev => removeStepsById(prev, ids));
    exitSelect();
  }

  /**
   * The list the selection sits in and the selected steps in it, when they all share one list
   * (wrapping and Make Routine need that); otherwise explains why not and returns null.
   */
  function selectionInOneList(): { scope: ScopeFrame[]; picked: ProgramStep[]; firstIdx: number } | null {
    const sel = selectedInOrder();
    if (sel.length === 0) return null;
    const locs = sel.map(s => locateStep(steps, s.id)).filter((l): l is NonNullable<typeof l> => !!l);
    const scope = locs[0]?.scope;
    if (!scope || locs.some(l => !sameScope(l.scope, scope))) {
      appAlert("Pick steps from one list", "Wrapping and Make Routine work on steps that sit in the same list. Select steps from one block or one level.");
      return null;
    }
    return { scope, picked: sel, firstIdx: Math.min(...locs.map(l => l.index)) };
  }

  // Wrap the selected steps into a new block, in place: they move (ids kept) into its first
  // body — a Loop's steps, an If's IF branch or a Try's TRY — and the block takes the place of
  // the first one.
  function wrapSelected(type: "Loop" | "IfCondition" | "Try") {
    const one = selectionInOneList();
    if (!one) return;
    const ids = new Set(one.picked.map(s => s.id));
    const base = newStep(type);
    const block: ProgramStep = type === "Loop" ? { ...base, loopSteps: one.picked }
      : type === "IfCondition" ? { ...base, ifSteps: one.picked }
      : { ...base, trySteps: one.picked };
    setSteps(prev => {
      const list = getStepsAtScope(prev, one.scope);
      const rebuilt: ProgramStep[] = [];
      list.forEach((s, i) => {
        if (i === one.firstIdx) rebuilt.push(block);
        if (!ids.has(s.id)) rebuilt.push(s);
      });
      return setStepsAtScope(prev, one.scope, rebuilt);
    });
    // The new block shows its body inline so the moved steps stay in view.
    setExpanded(prev => new Set(prev).add(block.id));
    exitSelect();
    if (type === "IfCondition") setIfEdit(r => ({ stepId: block.id, key: "if", tick: (r?.tick ?? 0) + 1 }));
  }

  // Disable (or, when every selected step is already disabled, enable) the selection. A
  // disabled step is skipped at run time with its whole body.
  function toggleSelectedEnabled() {
    if (selectedIds.length === 0) return;
    const sel = selectedInOrder();
    const enable = sel.length > 0 && sel.every(s => !isStepEnabled(s));
    setSteps(prev => mapStepsById(prev, new Set(selectedIds), s => ({ ...s, enabled: enable ? undefined : false })));
    exitSelect();
  }

  function deleteSelected() {
    const n = selectedIds.length;
    if (n === 0) return;
    appAlert("Delete Steps", `Remove ${n} step${n !== 1 ? "s" : ""}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        setSteps(prev => removeStepsById(prev, new Set(selectedIds)));
        exitSelect();
      } },
    ]);
  }

  // Replace the selected steps in place with a single CallRoutine step.
  function replaceSelectedWithRoutineCall(routineId: string, routineName: string) {
    const one = selectionInOneList();
    if (!one) return;
    const ids = new Set(one.picked.map(s => s.id));
    setSteps(prev => {
      const list = getStepsAtScope(prev, one.scope);
      const call: ProgramStep = { ...newStep("CallRoutine"), routineId, routineName };
      const rebuilt: ProgramStep[] = [];
      list.forEach((s, i) => {
        if (i === one.firstIdx) rebuilt.push(call);
        if (!ids.has(s.id)) rebuilt.push(s);
      });
      return setStepsAtScope(prev, one.scope, rebuilt);
    });
  }

  const [makeRoutineOpen,   setMakeRoutineOpen]   = useState(false);
  const [routineNameInput,  setRoutineNameInput]  = useState("");
  const [makingRoutine,     setMakingRoutine]     = useState(false);

  const routineNameValid = routineNameInput.trim().length > 0
    && !builtPrograms.some(p => p.name.toLowerCase() === routineNameInput.trim().toLowerCase());

  function openMakeRoutine() {
    if (selectedIds.length === 0) return;
    if (!selectionInOneList()) return;
    if (!connected) {
      appAlert("Not Connected", "Connect to the robot to save a routine.");
      return;
    }
    setRoutineNameInput("");
    setMakeRoutineOpen(true);
  }

  async function confirmMakeRoutine() {
    const name = routineNameInput.trim();
    if (!routineNameValid || makingRoutine) return;
    setMakingRoutine(true);
    try {
      const routineId = newId();
      const routineSteps = selectedInOrder().map(cloneForPaste);
      const prog: BuiltProgram = {
        id: routineId,
        name,
        description: "",
        steps: routineSteps,
        isRoutine: true,
        lastUpdatedUnixMs: Date.now(),
      };
      await robotClient.saveBuiltProgram(prog).catch(() => {});
      setMakeRoutineOpen(false);
      appAlert("Routine Created", `Replace the selected step${selectedIds.length !== 1 ? "s" : ""} with a call to "${name}"?`, [
        { text: "Keep Steps", style: "cancel", onPress: exitSelect },
        { text: "Replace", onPress: () => { replaceSelectedWithRoutineCall(routineId, name); exitSelect(); } },
      ]);
    } finally {
      setMakingRoutine(false);
    }
  }

  // ── Variable editor state ─────────────────────────────────────────────────

  const [varModalOpen,   setVarModalOpen]   = useState(false);
  const [editingVar,     setEditingVar]     = useState<ProgramVariable | null>(null);
  const [newVarDefault,  setNewVarDefault]  = useState<VarType | undefined>(undefined);

  function openNewVar(defaultType?: VarType) {
    setEditingVar(null); setNewVarDefault(defaultType); setVarModalOpen(true);
  }
  function openEditVar(v: ProgramVariable) { setEditingVar(v); setVarModalOpen(true); }

  function saveVar(v: ProgramVariable) {
    // A rename must rewrite every `$name` reference across the program (and bare-name target fields),
    // or the links orphan — the name is the symbol in the expression language. Done atomically with
    // the variable-list update so steps + variables stay consistent in one commit.
    //
    // Whether this is a rename is read off the stored variable with the same id, not off the
    // editor's state: the step modal's pickers create variables through this same function, and
    // a stale `editingVar` would otherwise turn a brand-new variable into a rename of the last one
    // edited — rewriting every reference to it.
    commit(d => {
      const prev = d.variables.find(x => x.id === v.id);
      const isRename = !!prev && prev.name !== v.name;
      let variables = prev ? d.variables.map(x => (x.id === v.id ? v : x)) : [...d.variables, v];
      let steps = d.steps;
      if (isRename) {
        variables = renameVariableInVariables(variables, prev.name, v.name);
        steps = renameVariableInSteps(d.steps, prev.name, v.name);
      }
      return { ...d, variables, steps };
    });
  }

  function deleteVar(id: string) {
    setVariables(prev => prev.filter(v => v.id !== id));
  }

  // ── UI state ──────────────────────────────────────────────────────────────

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [configOpen, setConfigOpen]         = useState(false);
  const [editingStep, setEditingStep]       = useState<ProgramStep | null>(null);

  // When creating a routine from a CallRoutine step, remember which step and the
  // routine ids that existed beforehand, so we can auto-select the new one on return.
  const [pendingRoutine, setPendingRoutine] = useState<{ stepId: string; beforeIds: string[] } | null>(null);

  useEffect(() => {
    if (!pendingRoutine) return;
    const added = builtPrograms.find(p => p.isRoutine && p.id && !pendingRoutine.beforeIds.includes(p.id));
    if (!added) return;
    const target = findStep(steps, pendingRoutine.stepId);
    if (target) {
      const updated = { ...target, routineId: added.id, routineName: added.name };
      updateStep(updated);
      setEditingStep(updated);
      setConfigOpen(true);
    }
    setPendingRoutine(null);
  }, [builtPrograms, pendingRoutine, steps]);

  // ── Scope navigation ──────────────────────────────────────────────────────

  const [scopeStack, setScopeStack] = useState<ScopeFrame[]>([]);
  const scopeStackRef = useRef<ScopeFrame[]>([]);
  useEffect(() => { scopeStackRef.current = scopeStack; }, [scopeStack]);

  const currentSteps = useMemo(() => getStepsAtScope(steps, scopeStack), [steps, scopeStack]);

  // Mirror currentSteps in a ref so drag callbacks always see the latest scoped array
  const currentStepsRef = useRef(currentSteps);
  useEffect(() => { currentStepsRef.current = currentSteps; }, [currentSteps]);

  function popScope() {
    scrollYRef.current = 0;
    exitSelect();
    setScopeStack(prev => prev.slice(0, -1));
  }

  // For the Label / Go To Label pickers: the list the edited step sits in (it may be in a body
  // shown inline, not the list on screen).
  const editingLoc = useMemo(() => (editingStep ? locateStep(steps, editingStep.id) : null), [editingStep, steps]);
  const editingScope = editingLoc ? getStepsAtScope(steps, editingLoc.scope) : currentSteps;
  const editingStepIndex = editingLoc?.index ?? -1;

  const insertTargetRef = useRef<InsertAt>({ scope: [], index: 0 });

  // Auto-scroll while dragging. Both refs point at the single steps ScrollView in the wide layout.
  const scrollViewRef      = useRef<ScrollView | null>(null);
  const scopeScrollViewRef = useRef<ScrollView | null>(null);
  const scrollYRef         = useRef(0);
  const autoScrollTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  function startAutoScroll(dir: 1 | -1) {
    if (autoScrollTimer.current) return;
    autoScrollTimer.current = setInterval(() => {
      scrollYRef.current = Math.max(0, scrollYRef.current + dir * 8);
      const ref = scopeStackRef.current.length > 0 ? scopeScrollViewRef : scrollViewRef;
      ref.current?.scrollTo({ y: scrollYRef.current, animated: false });
    }, 16);
  }

  function stopAutoScroll() {
    if (autoScrollTimer.current) { clearInterval(autoScrollTimer.current); autoScrollTimer.current = null; }
  }

  // ── Inline bodies, sections, search (view state — not part of the document) ─

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [foldedSections, setFoldedSections] = useState<ReadonlySet<string>>(() => new Set());
  const toggleIn = (set: (u: (p: ReadonlySet<string>) => ReadonlySet<string>) => void, id: string) =>
    set(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [ifEdit, setIfEdit] = useState<{ stepId: string; key: string; tick: number } | null>(null);
  const [caseEdit, setCaseEdit] = useState<{ stepId: string; caseId: string; tick: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<ProgramStep | null>(null);

  // ── Step helpers ──────────────────────────────────────────────────────────

  function openTypePicker(at: InsertAt) {
    insertTargetRef.current = at;
    setTypePickerOpen(true);
  }

  function addStep(type: StepType) {
    insertNewStep(newStep(type));
  }

  function addPluginStep(c: PluginStepContribution) {
    insertNewStep({ ...newStep("Plugin"), ...pluginStepFields(c) });
  }

  function insertNewStep(step: ProgramStep) {
    const at = insertTargetRef.current;
    setSteps(prev => insertAt(prev, at.scope, at.index, [step]));

    if (step.type === "IfCondition") {
      // Nothing to configure on the step itself — go straight to its IF condition.
      setIfEdit(r => ({ stepId: step.id, key: "if", tick: (r?.tick ?? 0) + 1 }));
      return;
    }
    // Bodies, notes and the flow words with no settings open nothing; the rest open the editor.
    if (step.type === "Return" || step.type === "PauseProgram" || step.type === "ClearLocal" || step.type === "RunHoming") return;
    setEditingStep(step);
    setConfigOpen(true);
  }

  // Edits find the step by id anywhere in the tree (it may sit in a body shown inline). A live
  // edit from the phone step page coalesces per step, so one undo reverts a burst of changes.
  function updateStep(updated: ProgramStep, opts?: { live?: boolean }) {
    commit(d => ({ ...d, steps: replaceStepById(d.steps, updated) }),
      opts?.live ? { coalesceKey: `step:${updated.id}` } : undefined);
  }

  function deleteStep(id: string) {
    setSteps(prev => removeStepsById(prev, new Set([id])));
  }

  function toggleStepEnabled(step: ProgramStep) {
    updateStep({ ...step, enabled: isStepEnabled(step) ? false : undefined });
  }

  // ── Visible rows + drag bars ──────────────────────────────────────────────

  const rows = useMemo(
    () => buildRows(currentSteps, scopeStack, expanded, foldedSections, points),
    [currentSteps, scopeStack, expanded, foldedSections, points]);
  const draggedRef = useRef<string | null>(null);
  const rowDrag = useDragReorder(rows, next => dropRow(next));
  const rowRefs = useRef<Map<string, View>>(new Map());
  const rowRef = (id: string) => (v: View | null) => { if (v) rowRefs.current.set(id, v); else rowRefs.current.delete(id); };
  const rowLayout = (id: string) => rowDrag.onRowLayout(id);
  const dragHandlers = {
    onStart: (id: string) => { draggedRef.current = id; rowDrag.handle.onStart(id); },
    onMove: (id: string, dy: number, absY: number) => {
      rowDrag.handle.onMove(id, dy);
      const ZONE = 110;
      if (absY < ZONE) startAutoScroll(-1);
      else if (absY > Dimensions.get("window").height - ZONE) startAutoScroll(1);
      else stopAutoScroll();
    },
    onEnd: (id: string) => { stopAutoScroll(); rowDrag.handle.onEnd(id); draggedRef.current = null; },
  };

  // A dropped step lands below the row it ends up under: at the top of a body (under its
  // header), after a block (under its end row), at the top of an open block's first body (right
  // under the block), or after any other step in that step's list.
  function dropRow(next: FlatRow[]) {
    const id = draggedRef.current;
    const k = next.findIndex(r => r.id === id);
    const moved = next[k];
    if (!moved || moved.kind !== "step") return;
    const prev = k > 0 ? next[k - 1] : undefined;
    const dest: InsertAt =
      !prev                                            ? { scope: scopeStackRef.current, index: 0 }
      : prev.kind === "body"                           ? { scope: prev.scope, index: 0 }
      : prev.kind === "end"                            ? { scope: prev.scope, index: prev.index + 1 }
      : prev.expanded && prev.firstBody                ? { scope: prev.firstBody, index: 0 }
      :                                                  { scope: prev.scope, index: prev.index + 1 };
    const why = moveRefusal(moved.step, dest.scope);
    if (why === "intoItself") {
      appAlert("Can't move a block into itself", "Drop it outside its own steps, or close the block first.");
      return;
    }
    if (why === "loopControlOutsideLoop") {
      appAlert("Break / Next needs a loop", "It only works inside a Loop's steps — keep it in a loop body.");
      return;
    }
    if (sameScope(moved.scope, dest.scope) && (dest.index === moved.index || dest.index === moved.index + 1)) return;
    setSteps(p => moveStep(p, moved.scope, moved.index, dest.scope, dest.index));
  }

  // ── Search ────────────────────────────────────────────────────────────────

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hitIdx, setHitIdx] = useState(0);
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as string[];
    return [...walkSteps(steps)].filter(({ step }) => searchText(step, points).includes(q)).map(x => x.step.id);
  }, [query, steps, points]);
  const hitSet = useMemo(() => new Set(hits), [hits]);

  // Show a hit: when it is not on screen, open the list it sits in; then scroll to it.
  function gotoHit(i: number) {
    if (hits.length === 0) return;
    const n = ((i % hits.length) + hits.length) % hits.length;
    setHitIdx(n);
    const id = hits[n];
    if (!rows.some(r => r.id === id)) {
      const loc = locateStep(steps, id);
      if (loc) { exitSelect(); setScopeStack(loc.scope); }
    }
    // Measured on screen (layout offsets are parent-relative), then scrolled by the difference.
    setTimeout(() => {
      const node = rowRefs.current.get(id);
      const ref = scopeStackRef.current.length > 0 ? scopeScrollViewRef : scrollViewRef;
      node?.measureInWindow((_x, y) => {
        ref.current?.scrollTo({ y: Math.max(0, scrollYRef.current + y - 220), animated: true });
      });
    }, 220);
  }

  // ── Run from here, breakpoints, the running step ─────────────────────────

  const programSummaries = useProgramSummaries();
  const runSummary = programSummaries.find(p => p.name === (editName ?? programName.trim()));
  const isActive = !!runSummary && ["Starting", "Running", "Stopping", "Stopped"].includes(runSummary.status);
  const runningStepId = isActive ? (runSummary?.pausedAtStepId ?? runSummary?.currentStepId ?? undefined) : undefined;

  function toggleBreakpoint(step: ProgramStep) {
    if (!programId) {
      appAlert("Save first", "Breakpoints are kept per saved program. Save this program once, then set them.");
      return;
    }
    const on = !breakpoints.has(step.id);
    breakpoints.toggle(step.id);
    // A running program picks the change up straight away (an older controller ignores it).
    if (isActive) {
      const next = on ? [...breakpoints.list, step.id] : breakpoints.list.filter(x => x !== step.id);
      robotClient.setBreakpoints(next).catch(() => {});
    }
  }

  async function runFromHere(step: ProgramStep) {
    if (isLocalMode) {
      appAlert("Robot program required", "Save this program to the robot to run it.");
      return;
    }
    if (validation.errorCount > 0) { setProblemsOpen(true); return; }
    if (!(await save())) return;
    const name = programName.trim();
    try {
      await robotClient.executeBuiltProgramDebug(name, { startAtStepId: step.id, breakpoints: breakpoints.list });
      router.push(`/(tabs)/program/monitor-program?name=${encodeURIComponent(name)}`);
    } catch (e) {
      if (isNotImplementedCommand(e)) {
        appAlert("Not available on this controller yet",
          "This controller can't start a program from a chosen step yet. Update the controller software, or run the program from the top.");
      } else {
        appAlert("Could not start", e instanceof Error ? e.message : "The controller did not start the program.");
      }
    }
  }

  // ── Save / Run ────────────────────────────────────────────────────────────

  function buildProg(): BuiltProgram {
    const prog = programFromDoc(doc, programId, Date.now());
    // The builder doesn't edit the display page, but SaveBuiltProgram replaces the whole
    // program — so carry the robot's current page through, or saving from here wipes it.
    // Prefer the id match: builtPrograms refreshes after the page editor saves.
    const onRobot = (programId ? builtPrograms.find(p => p.id === programId) : undefined) ?? existing;
    const page = onRobot ? {
      displayPageHtml:   onRobot.displayPageHtml,
      displayPageMode:   onRobot.displayPageMode,
      displayPageLayout: onRobot.displayPageLayout,
    } : {};
    // Self-migration: stamp a stable pointId onto any move step that still
    // references a point only by name, so renaming that point won't break it.
    return { ...prog, ...page, editorMode, steps: backfillPointIds(prog.steps, points) };
  }

  async function save(): Promise<boolean> {
    // The document as it is being saved: edits made while the save is in
    // flight must still read as unsaved afterwards.
    const savedDoc = doc;
    const name = programName.trim();
    if (!name) {
      appAlert("Name required", "Please give the program a name.");
      return false;
    }
    const prog = buildProg();
    if (isLocalMode) {
      if (editName && editName !== name) await LocalProgramService.delete(editName);
      await LocalProgramService.save(prog);
      // Capture the ID that was generated during save (for new programs)
      if (!prog.id) {
        const saved = (await LocalProgramService.getAll()).find(p => p.name === name);
        if (saved?.id) setProgramId(saved.id);
      }
      if (coverImage) await LocalProgramService.saveImage(name, coverImage);
    } else {
      try {
        await robotClient.saveBuiltProgram(prog);
      } catch {
        appAlert(
          "Save Failed",
          "The program could not be saved to the robot — the controller may need to be restarted. Save a local draft so you don't lose your work?",
          [
            {
              text: "Save Local Draft",
              onPress: async () => {
                await LocalProgramService.save(prog);
                if (coverImage) await LocalProgramService.saveImage(name, coverImage).catch(() => {});
                router.replace("/(tabs)/program/phone-programs");
              },
            },
            { text: "Stay in Builder", style: "cancel" },
          ]
        );
        return false;
      }
      if (coverImage) await robotClient.saveProgramImage(name, coverImage).catch(() => {});
    }
    markSaved(savedDoc);
    return true;
  }

  async function saveToRobot() {
    const name = programName.trim();
    if (!name) { appAlert("Name required", "Please give the program a name."); return; }
    if (savingToRobot) return;
    setSavingToRobot(true);
    try {
      const prog = buildProg();
      await robotClient.saveBuiltProgram(prog);
      if (coverImage) await robotClient.saveProgramImage(name, coverImage).catch(() => {});
      appAlert("Saved to Robot", `"${name}" has been saved to the robot.`);
    } catch {
      appAlert("Save Failed", "The program could not be saved to the robot. Check that the controller is running and restart it if you updated the software.");
    } finally {
      setSavingToRobot(false);
    }
  }

  const [saving, setSaving]             = useState(false);
  const [savingToRobot, setSavingToRobot] = useState(false);

  // A brand-new program arrives here with no `name` param, so this is the only
  // save that can be the first one. Land the user on the monitor page for it
  // rather than the list. Local drafts and routines aren't monitorable — the
  // monitor resolves programs out of the robot repository.
  const isFirstSave = !editName && !isLocalMode && !isRoutineMode;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      if (!(await save())) return;
      if (isFirstSave) {
        // Kick the repository refresh off but don't await it — the monitor
        // resolves the program itself if it arrives before the fetch lands.
        robotClient.getBuiltPrograms().catch(() => {});
        router.replace(`/(tabs)/program/monitor-program?name=${encodeURIComponent(programName.trim())}`);
        return;
      }
      router.back();
    }
    finally { setSaving(false); }
  }

  // Leave the builder screen entirely (with the unsaved-changes prompt).
  // In wide mode the main header back always does this — exiting a nested
  // scope is handled by the scope header above the steps pane instead.
  function exitBuilder() {
    if (selectMode) { exitSelect(); return; }
    // Always back to the program list this program belongs to, not one step back in history.
    const listHref = headerCrumbs[headerCrumbs.length - 2].href as string;
    const leaveBuilder = () => router.dismissTo(listHref as never);
    if (!isDirty) { leaveBuilder(); return; }
    appAlert(
      "Unsaved Changes",
      "You have unsaved changes. Exit without saving?",
      [
        { text: "Save & Exit", onPress: async () => { if (await save()) leaveBuilder(); } },
        { text: "Discard",     style: "destructive", onPress: leaveBuilder },
        { text: "Cancel",      style: "cancel" },
      ]
    );
  }

  function handleBack() {
    if (selectMode) { exitSelect(); return; }
    if (scopeStackRef.current.length > 0) { popScope(); return; }
    exitBuilder();
  }

  // Guarded crumb navigation for the wide header — ancestor crumbs (Program,
  // Programs/Local Programs/Routines) must go through the same unsaved-changes
  // prompt as the Exit button rather than navigating straight away.
  function guardedNavigate(href: string) {
    if (selectMode) exitSelect();
    if (!isDirty) { router.navigate(href as never); return; }
    appAlert(
      "Unsaved Changes",
      "You have unsaved changes. Leave without saving?",
      [
        { text: "Save & Leave", onPress: async () => { if (await save()) router.navigate(href as never); } },
        { text: "Discard",      style: "destructive", onPress: () => router.navigate(href as never) },
        { text: "Cancel",       style: "cancel" },
      ]
    );
  }

  // Keep a stable ref so the BackHandler effect can always call the latest version.
  const handleBackRef = useRef(handleBack);
  handleBackRef.current = handleBack;

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, []));

  async function handleRun() {
    // Errors would stop the run on the controller anyway; show them instead.
    // Saving stays allowed with errors (see handleSave).
    if (validation.errorCount > 0) { setProblemsOpen(true); return; }
    if (!(await save())) return;
    const name = programName.trim();
    await robotClient.executeBuiltProgram(name).catch(() => {});
    router.push(`/(tabs)/program/monitor-program?name=${encodeURIComponent(name)}`);
  }

  // ── CNC builder handoff ───────────────────────────────────────────────────
  // The CNC builder edits the robot's saved copy of the program, so the
  // program must be saved before opening it, and the generated toolpath must
  // be pulled back into this screen's local state on return.

  const pendingCncStepRef = useRef<string | null>(null);

  // Re-entry guard — the pre-open save takes a moment, and each extra tap in
  // that window would push another CNC builder onto the navigation stack.
  // Released when this screen regains focus.
  const openingCncRef = useRef(false);
  useFocusEffect(useCallback(() => { openingCncRef.current = false; }, []));

  async function openCncBuilder(stepId: string) {
    if (openingCncRef.current) return;
    openingCncRef.current = true;
    if (isLocalMode) {
      openingCncRef.current = false;
      appAlert("Robot Program Required", "The CNC builder edits the program saved on the robot. Save this program to the robot first, then edit the robot copy.");
      return;
    }
    if (!(await save())) {
      openingCncRef.current = false;
      return;
    }
    pendingCncStepRef.current = stepId;
    router.push({ pathname: '/(tabs)/program/cnc-builder', params: { programName: programName.trim(), stepId } });
  }

  useFocusEffect(useCallback(() => {
    const stepId = pendingCncStepRef.current;
    if (!stepId || isLocalMode) return;
    const prog = builtPrograms.find(p => p.name === programName.trim());
    const savedStep = prog ? findStepById(prog.steps, stepId) : null;
    if (!savedStep) return;
    const next = applyCncFieldsById(steps, stepId, savedStep);
    if (JSON.stringify(next) === JSON.stringify(steps)) return;
    const nextDoc = { ...doc, steps: next };
    commit(nextDoc);
    // The robot copy was saved just before the handoff, so after pulling the
    // toolpath back the local state matches the robot again.
    markSaved(nextDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtPrograms, doc, isLocalMode]));

  // ── Undo / redo ───────────────────────────────────────────────────────────

  function undo() { exitSelect(); history.undo(); }
  function redo() { exitSelect(); history.redo(); }

  // An undo can remove the block the user is inside; step back out to the
  // deepest scope that still exists.
  useEffect(() => {
    const depth = validScopeDepth(steps, scopeStackRef.current);
    if (depth < scopeStackRef.current.length) setScopeStack(prev => prev.slice(0, depth));
  }, [steps]);

  // ── Expressions ───────────────────────────────────────────────────────────
  // Symbols and live values are resolved against the saved robot program: a
  // routine borrows its variable-context program, a local draft has none.
  const expressionProgramName = isLocalMode ? undefined
    : isRoutineMode ? contextProgramName
    : (editName ?? (programName.trim() || undefined));
  const expressionVariables = useMemo(
    () => contextVariables.length > 0 ? [...variables, ...contextVariables] : variables,
    [variables, contextVariables]);

  // ── Validation ────────────────────────────────────────────────────────────
  // The controller checks the unsaved document (debounced) so problems show up
  // while editing. A controller without ValidateBuiltProgram hides all of it.

  // Timestamp 0: it is not saved, and a stable value keeps the memo meaningful.
  const validationProgram = useMemo(() => programFromDoc(doc, programId, 0), [doc, programId]);
  const validation   = useProgramValidation(validationProgram, connected);
  const validationProblems = validation.problems;
  const problemIndex = useMemo(() => indexProblems(steps, validationProblems), [steps, validationProblems]);
  const [problemsOpen, setProblemsOpen] = useState(false);

  // ── Revisions ─────────────────────────────────────────────────────────────
  // Only a program already on the robot has stored revisions, under the name
  // it was opened with.
  const [historyOpen, setHistoryOpen] = useState(false);
  const canShowHistory = !isLocalMode && !!editName && connected;

  // A restore is saved on the robot already, so it becomes the saved state, and
  // it is committed like any edit so Undo brings back what was here before.
  function applyRestoredRevision(program: BuiltProgram) {
    const restored = docFromProgram(program, { isRoutine: program.isRoutine ?? isRoutineMode });
    exitSelect();
    setScopeStack([]);
    commit(restored);
    markSaved(restored);
    if (program.id) setProgramId(program.id);
  }

  // Keyboard shortcuts act on the program only while no dialog is on top of it.
  const dialogOpen = configOpen || varModalOpen || typePickerOpen || makeRoutineOpen
    || contextPickerOpen || settingsModalOpen || problemsOpen || historyOpen;
  useUndoShortcuts({ enabled: !dialogOpen && !localLoading, onUndo: undo, onRedo: redo });

  // Jump to the step a problem is on: enter its block and open its config.
  function openProblem(p: ValidationProblem) {
    setProblemsOpen(false);
    const loc = findStepLocation(steps, p.stepId);
    if (!loc) return;
    exitSelect();
    scrollYRef.current = 0;
    setScopeStack(loc.scope);
    // Let the sheet finish closing first: iOS will not present a modal while
    // another one is still dismissing.
    setTimeout(() => { setEditingStep(loc.step); setConfigOpen(true); }, 350);
  }

  // Blocks ↔ Text. Text shows the whole program, so leave any block scope and selection.
  // Leaving Text asks the text view first: it applies the text, or asks what to do with text
  // that has errors, and answers false to stay. (Read off the module so a build whose text view
  // has no guard yet still switches.)
  async function changeEditorMode(mode: EditorMode, opts?: { checked?: boolean }) {
    if (mode === editorMode) return;
    if (editorMode === "text" && !opts?.checked) {
      const leave = (TextView as unknown as { requestLeaveTextView?: () => Promise<boolean> }).requestLeaveTextView;
      if (leave && !(await leave())) return;
    }
    exitSelect();
    if (mode === "text") setScopeStack([]);
    setEditorMode(mode);
  }

  // A parsed text program becomes the document in ONE undoable edit.
  function applyTextProgram(p: BuiltProgram) {
    commit(d => ({ ...d, steps: p.steps ?? [], variables: p.variables ?? [] }));
  }

  const editorTools = (variant: "header" | "bar") => (
    <EditorToolbar
      variant={variant}
      canUndo={history.canUndo}
      canRedo={history.canRedo}
      onUndo={undo}
      onRedo={redo}
      editorMode={editorMode}
      onEditorModeChange={m => { void changeEditorMode(m); }}
    >
      {validation.supported && (
        <ProblemsPill
          errorCount={validation.errorCount}
          warningCount={validation.warningCount}
          onPress={() => setProblemsOpen(true)}
        />
      )}
      {editorMode === "blocks" && (
        <ToolbarButton label="Find" onPress={() => { setSearchOpen(o => !o); if (searchOpen) setQuery(""); }}>
          <Search size={16} color={searchOpen ? colors.accent : colors.textSecondary} />
        </ToolbarButton>
      )}
      {canShowHistory && (
        <ToolbarButton label="History" onPress={() => { exitSelect(); setHistoryOpen(true); }}>
          <HistoryIcon size={16} color={colors.textSecondary} />
        </ToolbarButton>
      )}
    </EditorToolbar>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (localLoading) {
    return (
      <View style={styles.container}>
        <PageHeader
          title="Loading…"
          subtitle="Reading the local program from this device"
          crumbs={[{ label: "Program", href: "/program" }, { label: "Local Programs", href: "/(tabs)/program/phone-programs" }, { label: "Loading…" }]}
        />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: colors.textFaint }}>Loading local program…</Text>
        </View>
      </View>
    );
  }

  const inScope = scopeStack.length > 0;

  // Narrow mode titles the whole screen after the scope; wide mode keeps the
  // builder title and shows the scope in the steps-pane header instead.
  const builderTitle = inScope && !isWide
    ? scopeStack[scopeStack.length - 1].label
    : `${isRoutineMode ? "Routine" : isBackgroundMode ? "Background" : "Program"} Builder${isLocalMode ? " · Local" : ""}`;

  // ── Shared render fragments (used by both narrow and wide layouts) ────────

  const breadcrumbTrail = inScope ? (
    <>
      <TouchableOpacity onPress={() => { exitSelect(); setScopeStack([]); }} hitSlop={8} activeOpacity={0.7}>
        <Text style={styles.scopeBreadcrumbRoot}>Program</Text>
      </TouchableOpacity>
      {scopeStack.slice(0, -1).map((frame, fi) => (
        <React.Fragment key={fi}>
          <ChevronRight size={12} color={colors.textFaint} />
          <TouchableOpacity onPress={() => { exitSelect(); setScopeStack(prev => prev.slice(0, fi + 1)); }} hitSlop={8} activeOpacity={0.7}>
            <Text style={styles.scopeBreadcrumbItem}>{frame.label}</Text>
          </TouchableOpacity>
        </React.Fragment>
      ))}
      <ChevronRight size={12} color={colors.textFaint} />
      <Text style={styles.scopeBreadcrumbCurrent}>{scopeStack[scopeStack.length - 1].label}</Text>
    </>
  ) : null;

  const breadcrumb = inScope ? (
    <View style={styles.scopeBreadcrumb}>{breadcrumbTrail}</View>
  ) : null;

  const metaSection = (
    <View style={styles.metaCard}>
      <TextInput
        style={styles.nameInput}
        value={programName}
        onChangeText={setProgramName}
        placeholder={isRoutineMode ? "Routine name…" : isBackgroundMode ? "Background program name…" : "Program name…"}
        placeholderTextColor={colors.textFaint}
        returnKeyType="next"
      />
      <View style={styles.metaSep} />
      <TextInput
        style={styles.descInput}
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optional)"
        placeholderTextColor={colors.textFaint}
        returnKeyType="done"
      />
      <View style={styles.metaSep} />

      {/* Cover image row — hidden for routines and background programs */}
      {!isRoutineMode && !isBackgroundMode && (
        <>
          <View style={styles.imageRow}>
            <View style={styles.imagePreviewWrap}>
              {coverImage ? (
                <Image
                  source={{ uri: imageDataUri(coverImage)! }}
                  style={styles.imagePreview}
                />
              ) : (
                <View style={styles.imagePreviewPlaceholder}>
                  <ImagePlus size={22} color={colors.borderStrong} />
                </View>
              )}
            </View>
            <View style={styles.imageActions}>
              <TouchableOpacity style={styles.imageBtn} onPress={pickFromCamera} activeOpacity={0.75}>
                <Camera size={15} color={colors.accent} />
                <Text style={styles.imageBtnText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageBtn} onPress={pickFromLibrary} activeOpacity={0.75}>
                <ImagePlus size={15} color={colors.accent} />
                <Text style={styles.imageBtnText}>Photo Library</Text>
              </TouchableOpacity>
            </View>
          </View>
          {!isLocalMode && (
            <>
              <View style={styles.metaSep} />
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
                onPress={() => setSettingsModalOpen(true)}
                activeOpacity={0.7}
              >
                <SlidersHorizontal size={16} color={colors.textMuted} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, flex: 1 }}>Program Settings</Text>
                {isBackgroundMode && (
                  <View style={{ backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: colors.success }}>BACKGROUND</Text>
                  </View>
                )}
                <ChevronRight size={15} color={colors.textFaint} />
              </TouchableOpacity>
            </>
          )}
        </>
      )}

      {/* Settings button for routines/background programs (no image row) */}
      {!isLocalMode && (isRoutineMode || isBackgroundMode) && (
        <>
          <View style={styles.metaSep} />
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
            onPress={() => setSettingsModalOpen(true)}
            activeOpacity={0.7}
          >
            <SlidersHorizontal size={16} color={colors.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, flex: 1 }}>Program Settings</Text>
            {isBackgroundMode && (
              <View style={{ backgroundColor: colors.successSoft, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.success }}>BACKGROUND</Text>
              </View>
            )}
            <ChevronRight size={15} color={colors.textFaint} />
          </TouchableOpacity>
        </>
      )}

      {/* Variable context picker — routine mode only */}
      {isRoutineMode && (
        <>
          <View style={styles.metaSep} />
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
            onPress={() => setContextPickerOpen(true)}
            activeOpacity={0.7}
          >
            <ChevronsRight size={16} color={colors.textMuted} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, flex: 1 }}>Variable Context</Text>
            <Text style={{ fontSize: 12, color: contextProgramName ? colors.accent : colors.textFaint, maxWidth: 160 }} numberOfLines={1}>
              {contextProgramName ?? "None"}
            </Text>
            <ChevronRight size={15} color={colors.textFaint} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const variablesSection = (
    <>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>VARIABLES</Text>
        {variables.length > 0 && <Text style={styles.sectionCount}>{variables.length}</Text>}
        <View style={{ flex: 1 }} />
        <InfoTip text="Variables hold values the program can read and change while it runs. Reference one from any numeric field, and tick 'show on monitor' to watch it live." />
      </View>
      <View style={styles.variablesCard}>
        {variables.length === 0 ? (
          <Text style={styles.varEmptyText}>
            No variables yet. Tap + to define reusable values you can reference in any numeric field.
          </Text>
        ) : (
          variables.map((v, i) => {
            const vList = variableList(v);
            // Coerced to a real boolean: an empty-string expression would otherwise fall
            // through as "" and React Native throws on a bare string outside a <Text>.
            const hasExpr = !v.isComputed && !!v.valueExpression?.trim();
            return (
            <React.Fragment key={v.id}>
              {i > 0 && <View style={styles.varSep} />}
              <TouchableOpacity style={styles.varRow} onPress={() => openEditVar(v)} activeOpacity={0.7}>
                <View style={styles.varInfo}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.varName}>${v.name}</Text>
                    {/* One chip for every list, labelled by what its elements are —
                        that is what decides how the variable is indexed. */}
                    {vList && (
                      <View style={{ backgroundColor: LIST_CHIP[vList.elementType].bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: LIST_CHIP[vList.elementType].border }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: LIST_CHIP[vList.elementType].color, letterSpacing: 0.3 }}>
                          {LIST_CHIP[vList.elementType].label}
                        </Text>
                      </View>
                    )}
                    {v.isBoolean && (
                      <View style={{ backgroundColor: colors.successSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.successBorder }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: colors.success, letterSpacing: 0.3 }}>BOOL</Text>
                      </View>
                    )}
                    {/* A computed variable is a formula read live, not a stored value with a
                        computed start — so it gets its own badge, not the fx one below. */}
                    {v.isComputed && (
                      <View style={{ backgroundColor: "#fdf2f8", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#fbcfe8" }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: COMPUTED_TINT, letterSpacing: 0.3 }}>ƒ COMPUTED</Text>
                      </View>
                    )}
                    {/* Marks a computed starting value. It lives up here with the chips
                        rather than only in the line below because a variable with a
                        description shows that instead of its initial value — and "this
                        one is computed" is worth knowing either way. */}
                    {hasExpr && (
                      <View style={{ backgroundColor: accents.purpleSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: accents.purpleBorder }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", fontStyle: "italic", color: accents.purple, letterSpacing: 0.3 }}>fx</Text>
                      </View>
                    )}
                    {/* A routine parameter: how it passes values with the caller. */}
                    {!!v.paramMode && (
                      <View style={{ backgroundColor: colors.successSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.successBorder }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: colors.success, letterSpacing: 0.3 }}>
                          {v.paramMode === "inOut" ? "IN-OUT" : v.paramMode.toUpperCase()} PARAM
                        </Text>
                      </View>
                    )}
                    {v.isGlobal && (
                      <View style={{ backgroundColor: colors.warningSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.warningBorder }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: colors.warning, letterSpacing: 0.3 }}>GLOBAL</Text>
                      </View>
                    )}
                    {v.displayOnMonitor && (
                      <View style={{ backgroundColor: colors.accentSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.accentBorder }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: colors.accent, letterSpacing: 0.3 }}>MONITOR</Text>
                      </View>
                    )}
                    {v.isStopwatch && (
                      <View style={{ backgroundColor: "#e0f2fe", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#7dd3fc" }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: accents.cyan, letterSpacing: 0.3 }}>STOPWATCH</Text>
                      </View>
                    )}
                    {v.isPersistent && (
                      <View style={{ backgroundColor: accents.purpleSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: accents.purpleBorder }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: accents.purple, letterSpacing: 0.3 }}>PERSIST</Text>
                      </View>
                    )}
                  </View>
                  {v.isComputed ? (
                    <>
                      <ComputedFormula v={v} />
                      {v.description ? <Text style={styles.varDesc}>{v.description}</Text> : null}
                    </>
                  ) : v.description ? (
                    <Text style={styles.varDesc}>{v.description}</Text>
                  ) : vList ? (
                    <Text style={styles.varDesc}>{describeList(vList)}</Text>
                  ) : v.isBoolean ? (
                    <InitialValue v={v} />
                  ) : v.isStopwatch ? (
                    <Text style={styles.varDesc}>Stopwatch — elapsed ms</Text>
                  ) : v.isString ? (
                    <Text style={styles.varDesc}>String — initial: {v.stringValue ? `"${v.stringValue}"` : "empty"}</Text>
                  ) : v.isImage ? (
                    <Text style={styles.varDesc}>Image — from CaptureImage or an HTTP response</Text>
                  ) : (
                    <InitialValue v={v} />
                  )}
                </View>
                <DeleteIconButton
                  size={14}
                  onPress={() => appAlert("Delete Variable", `Remove $${v.name}? This can't be undone.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteVar(v.id) },
                  ])}
                />
              </TouchableOpacity>
            </React.Fragment>
            );
          })
        )}
        <TouchableOpacity
          style={[styles.varAddBtn, variables.length > 0 && styles.varAddBtnBorder]}
          onPress={() => openNewVar()} activeOpacity={0.7}
        >
          <Plus size={13} color={accents.purple} />
          <Text style={styles.varAddText}>Add Variable</Text>
        </TouchableOpacity>
      </View>
      <PropertiesSection />
    </>
  );

  const textView = (
    <TextView.TextProgramView
      program={validationProgram}
      onApply={applyTextProgram}
      // The text view's own "back to Blocks" has already run its guard.
      onSwitchToBlocks={() => { void changeEditorMode("blocks", { checked: true }); }}
      connected={connected}
      problems={validationProblems}
      breakpoints={breakpoints}
      runningStepId={runningStepId}
    />
  );

  const dragging = rowDrag.dragging;
  const atScope = (scope: ScopeFrame[], index: number): InsertAt => ({ scope, index });
  const canPaste = clipboard.length > 0;

  const searchBar = searchOpen && (
    <View style={styles.searchBar}>
      <Search size={15} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        value={query}
        onChangeText={t => { setQuery(t); setHitIdx(0); }}
        placeholder="Find steps — name, block, $variable or point"
        placeholderTextColor={colors.textFaint}
        autoFocus
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={() => gotoHit(hitIdx)}
        aria-label="Find steps"
      />
      {query.trim() !== "" && (
        <Text style={styles.searchCount}>{hits.length ? `${hitIdx + 1} of ${hits.length}` : "none"}</Text>
      )}
      <TouchableOpacity onPress={() => gotoHit(hitIdx - 1)} disabled={!hits.length} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Previous match">
        <ChevronUp size={17} color={hits.length ? colors.textSecondary : colors.borderStrong} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => gotoHit(hitIdx + 1)} disabled={!hits.length} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Next match">
        <ChevronDown size={17} color={hits.length ? colors.textSecondary : colors.borderStrong} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setSearchOpen(false); setQuery(""); }} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Close search">
        <X size={16} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );

  const stepsSection = editorMode === "text" && !inScope ? textView : (
    <>
      {currentSteps.length === 0 ? (
        <View style={styles.emptySteps}>
          <Cpu size={32} color={colors.borderStrong} />
          <Text style={styles.emptyStepsText}>{inScope ? "No steps in this block" : "No steps yet"}</Text>
          <Text style={styles.emptyStepsHint}>
            {inScope
              ? "Add the steps that should run inside this block."
              : "Add your first block — moves, logic, I/O and vision are all in the picker."}
          </Text>
        </View>
      ) : (
        <View style={styles.stepsList}>
          <InsertDivider
            onPress={() => openTypePicker(atScope(scopeStack, 0))}
            onPaste={canPaste ? () => pasteStep(atScope(scopeStack, 0)) : undefined}
            disabled={dragging}
          />
          {rows.map((r, i) => {
            const drop = rowDrag.dropAt(r.id, i);
            const nested = r.depth > 0;
            const indent = nested ? { marginLeft: (r.depth - 1) * INDENT + 6, paddingLeft: INDENT - 6, borderLeftWidth: 2, borderLeftColor: colors.border } : undefined;
            const dropStyle = [drop === "above" && styles.dropAbove, drop === "below" && styles.dropBelow];

            if (r.kind === "body") {
              const ifCond = r.frame.kind === "ifTrue" ? r.parent.condition
                : r.frame.kind === "elseIf" ? r.parent.elseIfBranches?.find(b => b.id === r.frame.branchId)?.condition : undefined;
              const editable = r.frame.kind === "ifTrue" || r.frame.kind === "elseIf" || r.frame.kind === "switchCase";
              return (
                <View key={r.id} onLayout={rowLayout(r.id)} style={[indent, dropStyle]}>
                  <BodyHeaderRow
                    row={r}
                    condition={ifCond ? (ifCond.items?.length ? conditionSummary(ifCond) : "Set condition…") : undefined}
                    disabled={dragging}
                    onEdit={!editable ? undefined : () => {
                      if (r.frame.kind === "switchCase") setCaseEdit(c => ({ stepId: r.parent.id, caseId: r.frame.branchId!, tick: (c?.tick ?? 0) + 1 }));
                      else setIfEdit(c => ({ stepId: r.parent.id, key: r.frame.kind === "ifTrue" ? "if" : r.frame.branchId!, tick: (c?.tick ?? 0) + 1 }));
                    }}
                    onAdd={() => openTypePicker(atScope(r.scope, 0))}
                    onPaste={canPaste ? () => pasteStep(atScope(r.scope, 0)) : undefined}
                    onEnter={() => { exitSelect(); scrollYRef.current = 0; setScopeStack(r.scope); }}
                  />
                </View>
              );
            }

            if (r.kind === "end") {
              const lastAtRoot = r.depth === 1 && r.index === r.listLen - 1;
              return (
                <View key={r.id} onLayout={rowLayout(r.id)} style={dropStyle}>
                  <View style={[styles.blockEnd, { marginLeft: (r.depth - 1) * INDENT, borderColor: categoryForStep(r.parent.type).color }]} />
                  {!lastAtRoot && (
                    <View style={r.depth > 1 ? { marginLeft: (r.depth - 2) * INDENT + 6, paddingLeft: INDENT - 6, borderLeftWidth: 2, borderLeftColor: colors.border } : undefined}>
                      <InsertDivider
                        onPress={() => openTypePicker(atScope(r.scope, r.index + 1))}
                        onPaste={canPaste ? () => pasteStep(atScope(r.scope, r.index + 1)) : undefined}
                        disabled={dragging}
                      />
                    </View>
                  )}
                </View>
              );
            }

            const step = r.step;
            return (
              <View key={r.id} ref={rowRef(r.id)} onLayout={rowLayout(r.id)} style={indent}>
                <StepRow
                  step={step}
                  index={r.index}
                  isLast={r.depth === 0 && r.index === r.listLen - 1}
                  selectMode={selectMode}
                  selected={selectedIds.includes(step.id)}
                  onLongPress={() => enterSelect(step.id)}
                  onToggleSelect={() => toggleSelect(step.id)}
                  isBeingDragged={rowDrag.isDragged(step.id)}
                  dropAt={drop}
                  isDragging={dragging}
                  drag={dragHandlers}
                  onEdit={() => { setEditingStep(step); setConfigOpen(true); }}
                  onCopy={() => setClipboard([detachedCopy(step)])}
                  onMore={() => setRowMenu(step)}
                  onToggleEnabled={() => toggleStepEnabled(step)}
                  onInsertAfter={() => openTypePicker(atScope(r.scope, r.index + 1))}
                  onPasteAfter={canPaste ? () => pasteStep(atScope(r.scope, r.index + 1)) : undefined}
                  onEnterScope={frame => { exitSelect(); scrollYRef.current = 0; setScopeStack([...r.scope, frame]); }}
                  onUpdateStep={updateStep}
                  ifEditRequest={ifEdit?.stepId === step.id ? { key: ifEdit.key, tick: ifEdit.tick } : undefined}
                  caseEditRequest={caseEdit?.stepId === step.id ? { caseId: caseEdit.caseId, tick: caseEdit.tick } : undefined}
                  variables={variables}
                  contextVariables={contextVariables.length > 0 ? contextVariables : undefined}
                  onEnterRoutine={!isRoutineMode ? (routineName) => {
                    router.push({ pathname: '/(tabs)/program/builder', params: { name: routineName, isRoutine: '1', callerName: programName } });
                  } : undefined}
                  onOpenCncBuilder={stepId => { void openCncBuilder(stepId); }}
                  problems={problemIndex.get(step.id)}
                  points={points}
                  breakpoint={breakpoints.has(step.id)}
                  running={runningStepId === step.id}
                  searchHit={hitSet.has(step.id)}
                  expanded={r.expanded}
                  onToggleExpand={r.expandable ? () => toggleIn(setExpanded, step.id) : undefined}
                  sectionCollapsed={r.folded}
                  hiddenCount={r.hiddenCount}
                  onToggleSection={step.type === "Note" && step.noteStyle === "section" ? () => toggleIn(setFoldedSections, step.id) : undefined}
                />
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.addRow}>
        <AnimatedPressable
          style={styles.addCard}
          onPress={() => openTypePicker(atScope(scopeStack, currentSteps.length))}
        >
          <Plus size={16} color={colors.accent} />
          <Text style={styles.addCardText}>Add Step</Text>
        </AnimatedPressable>
        {canPaste && (
          <AnimatedPressable
            style={styles.pasteCard}
            onPress={() => pasteStep(atScope(scopeStack, currentSteps.length))}
          >
            <ClipboardPaste size={16} color={accents.purple} />
            <Text style={styles.pasteCardText}>{clipboard.length > 1 ? `Paste ${clipboard.length}` : "Paste"}</Text>
          </AnimatedPressable>
        )}
      </View>
    </>
  );

  // On wide screens the save actions live in the header instead of a bottom
  // bar — the bar's floating buttons can clip off-screen at some widths.
  // Exit is here too: the wide header has no back arrow, and leaving the
  // builder must still go through the unsaved-changes prompt.
  const headerActions = isWide ? (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {editorTools("header")}
      <ActionButton
        label={inScope ? "Leave Block" : "Exit"}
        icon={<ArrowLeft size={14} color={colors.textSecondary} />}
        style={styles.headerExitBtn}
        textStyle={styles.headerExitText}
        onPress={inScope ? popScope : exitBuilder}
      />
      {isLocalMode && connected && (
        <ActionButton
          label="Save to Robot"
          icon={<Upload size={14} color={colors.success} />}
          loading={savingToRobot}
          style={styles.headerUploadBtn}
          textStyle={styles.headerUploadText}
          spinnerColor={colors.success}
          onPress={saveToRobot}
        />
      )}
      <ActionButton
        label="Save"
        icon={<Wrench size={14} color={colors.onAccent} />}
        loading={saving}
        style={styles.headerSaveBtn}
        textStyle={styles.headerSaveText}
        spinnerColor={colors.onAccent}
        onPress={handleSave}
      />
    </View>
  ) : undefined;

  // ── Header ────────────────────────────────────────────────────────────────
  // PageHeader owns chrome both wide and narrow. Narrow's back press runs
  // `handleBack` (pop a scope, or prompt on unsaved changes) via onBack; wide's
  // ancestor crumbs run `guardedNavigate` via onNavigate — both routes through
  // the same unsaved-changes prompt as the header's Exit button.

  const rootStepCount = steps.length;
  const headerSubtitle = inScope
    ? `${currentSteps.length} step${currentSteps.length !== 1 ? "s" : ""} in this block`
    : `${programName.trim() ? programName.trim() : "Untitled"} · ${rootStepCount} step${rootStepCount !== 1 ? "s" : ""}` +
      `${variables.length > 0 ? ` · ${variables.length} variable${variables.length !== 1 ? "s" : ""}` : ""}` +
      `${isDirty ? " · unsaved changes" : ""}`;

  const headerCrumbs = [
    { label: "Program", href: "/program" },
    ...(isRoutineMode
      ? [{ label: "Routines", href: "/program/routines" }]
      : isLocalMode
        ? [{ label: "Local Programs", href: "/(tabs)/program/phone-programs" }]
        : [{ label: "Programs", href: "/(tabs)/program/robot-programs" }]),
    { label: builderTitle },
  ];

  // Narrow's back affordance should read "Back" (a single scope pop) rather
  // than jump straight to the parent list name when inside a nested block.
  const narrowCrumbs = inScope
    ? [{ label: "Back" }, { label: builderTitle }]
    : headerCrumbs;

  return (
    <ExpressionEnvProvider programName={expressionProgramName} variables={expressionVariables} enabled={connected}>
    <ActiveFieldProvider>
    <View style={styles.container}>
      {isWide ? (
        <PageHeader
          title={builderTitle}
          subtitle={headerSubtitle}
          crumbs={headerCrumbs}
          right={headerActions}
          onNavigate={guardedNavigate}
        />
      ) : (
        <PageHeader
          title={builderTitle}
          subtitle={headerSubtitle}
          crumbs={narrowCrumbs}
          onBack={handleBack}
        />
      )}
      {!isWide && editorTools("bar")}
      {!isWide && searchBar && <View style={styles.searchWrap}>{searchBar}</View>}

      {/* Multi-select toolbar */}
      {selectMode && (
        <View style={styles.selectBar}>
          <TouchableOpacity onPress={exitSelect} hitSlop={10} activeOpacity={0.7}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.selectCount}>{selectedIds.length} selected</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.selectActions}
            contentContainerStyle={styles.selectActionsContent}
            keyboardShouldPersistTaps="handled"
          >
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={copySelected}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
          >
            <Copy size={16} color={colors.accent} />
            <Text style={styles.selectActionText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={cutSelected}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
          >
            <Scissors size={16} color={colors.accent} />
            <Text style={styles.selectActionText}>Cut</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={() => wrapSelected("Loop")}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
            accessibilityLabel="Wrap in a Loop"
          >
            <Repeat size={16} color={accents.cyan} />
            <Text style={[styles.selectActionText, { color: accents.cyan }]}>Loop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={() => wrapSelected("IfCondition")}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
            accessibilityLabel="Wrap in an If"
          >
            <GitBranch size={16} color={accents.cyan} />
            <Text style={[styles.selectActionText, { color: accents.cyan }]}>If</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={() => wrapSelected("Try")}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
            accessibilityLabel="Wrap in a Try"
          >
            <ShieldCheck size={16} color={accents.cyan} />
            <Text style={[styles.selectActionText, { color: accents.cyan }]}>Try</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={openMakeRoutine}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
          >
            <Repeat2 size={16} color={accents.purple} />
            <Text style={[styles.selectActionText, { color: accents.purple }]}>Routine</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={toggleSelectedEnabled}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
          >
            <Power size={16} color={colors.textSecondary} />
            <Text style={[styles.selectActionText, { color: colors.textSecondary }]}>
              {selectedIds.length > 0 && selectedInOrder().every(s => !isStepEnabled(s)) ? "Enable" : "Disable"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selectAction, selectedIds.length === 0 && styles.selectActionDisabled]}
            onPress={deleteSelected}
            disabled={selectedIds.length === 0}
            activeOpacity={0.7}
          >
            <Trash2 size={16} color={colors.danger} />
          </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {isWide ? (
        /* ── Wide layout: program info + variables left, step editor right ── */
        <>
          <View style={styles.wideRow}>
            <ScrollView
              style={[styles.widePaneLeft, isSplit && wide.paneSplit]}
              contentContainerStyle={styles.widePaneLeftContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {metaSection}
              {variablesSection}
            </ScrollView>
            <View style={styles.widePaneRight}>
              {searchBar && <View style={styles.searchWrap}>{searchBar}</View>}
              {/* Scope header — back arrow + breadcrumb, scoped to the steps pane */}
              {inScope && (
                <View style={[styles.scopeBreadcrumb, styles.scopeHeaderWide]}>
                  <TouchableOpacity style={styles.scopeBackBtn} onPress={popScope} hitSlop={8} activeOpacity={0.7}>
                    <ArrowLeft size={16} color={colors.text} />
                  </TouchableOpacity>
                  <View style={styles.scopeTrailWrap}>{breadcrumbTrail}</View>
                </View>
              )}
              <ScrollView
                ref={el => { scrollViewRef.current = el; scopeScrollViewRef.current = el; }}
                contentContainerStyle={[styles.content, styles.wideStepsContent]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={!rowDrag.dragging}
                onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
              >
                {!inScope && (
                  <View style={styles.sectionLabelRow}>
                    <Text style={styles.sectionLabel}>STEPS</Text>
                    <Text style={styles.sectionCount}>{currentSteps.length}</Text>
                    <View style={{ flex: 1 }} />
                    <InfoTip text="Tap Add Step to open the block picker — blocks are grouped by category. Drag a step by its bar to move it, also into and out of blocks opened with their chevron. ⋮ on a step runs from it or sets a breakpoint. Long-press to select several, then copy, cut, disable, wrap them in a Loop, If or Try, or save them as a routine." />
                  </View>
                )}
                {stepsSection}
              </ScrollView>
            </View>
          </View>
        </>
      ) : inScope ? (
        <>
          {breadcrumb}
          <ScrollView
            ref={scopeScrollViewRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!rowDrag.dragging}
            onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
          >
            {stepsSection}
          </ScrollView>

          {isLocalMode && connected && (
            <View style={styles.bottomBar}>
              <ActionButton
                label="Save to Robot"
                icon={<Upload size={15} color={colors.success} />}
                loading={savingToRobot}
                style={styles.uploadBtn}
                textStyle={styles.uploadBtnText}
                spinnerColor={colors.success}
                onPress={saveToRobot}
              />
            </View>
          )}
        </>
      ) : (
        <>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!rowDrag.dragging}
        onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {metaSection}
        {variablesSection}

        {/* Steps (root level) */}
        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>STEPS</Text>
          <Text style={styles.sectionCount}>{currentSteps.length}</Text>
          <View style={{ flex: 1 }} />
          <InfoTip text="Tap Add Step to open the block picker — blocks are grouped by category. Drag a step by its bar to move it, also into and out of blocks opened with their chevron. ⋮ on a step runs from it or sets a breakpoint. Long-press to select several, then copy, cut, disable, wrap them in a Loop, If or Try, or save them as a routine." />
        </View>
        {stepsSection}
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isLocalMode && connected && (
          <ActionButton
            label="Save to Robot"
            icon={<Upload size={15} color={colors.success} />}
            loading={savingToRobot}
            style={styles.uploadBtn}
            textStyle={styles.uploadBtnText}
            spinnerColor={colors.success}
            onPress={saveToRobot}
          />
        )}
        <ActionButton
          label="Save"
          icon={<Wrench size={16} color={colors.accent} />}
          loading={saving}
          style={styles.saveBtn}
          textStyle={styles.saveBtnText}
          spinnerColor={colors.accent}
          onPress={handleSave}
        />
      </View>
        </>
      )}

      <BottomSheet visible={rowMenu !== null} onClose={() => setRowMenu(null)}
        title={rowMenu ? (rowMenu.name?.trim() || stepLabel(rowMenu, points)) : ""}>
        {rowMenu && (() => {
          const m = rowMenu;
          const item = (label: string, sub: string, icon: React.ReactNode, onPress: () => void, danger?: boolean) => (
            <TouchableOpacity key={label} style={styles.menuRow} activeOpacity={0.7}
              onPress={() => { setRowMenu(null); setTimeout(onPress, 250); }}
              accessibilityRole="button" accessibilityLabel={label}>
              {icon}
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
                <Text style={styles.menuSub}>{sub}</Text>
              </View>
            </TouchableOpacity>
          );
          return (
            <View>
              {!isBackgroundMode && !isRoutineMode && item("Run from here", "Save, then start the program at this step",
                <Play size={17} color={colors.success} />, () => { void runFromHere(m); })}
              {item(breakpoints.has(m.id) ? "Remove breakpoint" : "Add breakpoint",
                "The program pauses before this step; Continue goes on",
                <CircleDot size={17} color={colors.danger} />, () => toggleBreakpoint(m))}
              {item(isStepEnabled(m) ? "Disable step" : "Enable step",
                isStepEnabled(m) ? "Skip it (and its steps) when the program runs" : "Run it again",
                <Power size={17} color={colors.textSecondary} />, () => toggleStepEnabled(m))}
              {isBlockStep(m) && bodyFrames(m).length > 0 && !rows.some(r => r.kind === "step" && r.id === m.id && r.expandable) && item(
                "Open block", "Show only this block's steps",
                <ChevronRight size={17} color={colors.textSecondary} />,
                () => { const loc = locateStep(steps, m.id); const f = bodyFrames(m)[0]; if (loc && f) setScopeStack([...loc.scope, { ...f, stepId: m.id }]); })}
              {item("Delete step", "Remove it and everything inside it",
                <Trash2 size={17} color={colors.danger} />, () => appAlert("Delete Step", "Remove this step?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteStep(m.id) },
                ]), true)}
            </View>
          );
        })()}
      </BottomSheet>
      <StepTypePicker
        visible={typePickerOpen}
        onPick={addStep}
        onPickPlugin={addPluginStep}
        onClose={() => setTypePickerOpen(false)}
        isBackgroundMode={isBackgroundMode}
      />
      <StepConfigModal
        visible={configOpen}
        step={editingStep}
        variables={variables}
        contextVariables={contextVariables.length > 0 ? contextVariables : undefined}
        scopeSteps={editingScope}
        stepIndex={editingStepIndex}
        onSave={updateStep}
        problems={editingStep ? problemIndex.get(editingStep.id)?.own : undefined}
        onClose={() => setConfigOpen(false)}
        onCreateVariable={openNewVar}
        onSaveVariable={saveVar}
        onCreateRoutine={() => {
          if (editingStep) {
            setPendingRoutine({
              stepId: editingStep.id,
              beforeIds: builtPrograms.filter(p => p.isRoutine && p.id).map(p => p.id!) as string[],
            });
          }
          setConfigOpen(false);
          router.push({ pathname: "/(tabs)/program/builder", params: { isRoutine: "1" } });
        }}
      />
      {canShowHistory && (
        <RevisionsSheet
          visible={historyOpen}
          programName={editName!}
          hasUnsavedChanges={isDirty}
          onClose={() => setHistoryOpen(false)}
          onRestored={applyRestoredRevision}
        />
      )}
      <ValidationPanel
        visible={problemsOpen}
        problems={validation.problems}
        onClose={() => setProblemsOpen(false)}
        onSelect={openProblem}
      />
      <VariableEditModal
        visible={varModalOpen}
        variable={editingVar}
        defaultType={editingVar == null ? newVarDefault : undefined}
        variables={variables}
        isRoutine={isRoutineMode}
        onSave={saveVar}
        onClose={() => { setVarModalOpen(false); setEditingVar(null); }}
      />

      {/* Make Routine from selected steps */}
      <Modal visible={makeRoutineOpen} transparent animationType="fade" onRequestClose={() => setMakeRoutineOpen(false)}>
        <Pressable style={ms.overlay} onPress={() => setMakeRoutineOpen(false)}>
          <Pressable style={ms.card} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>New Routine</Text>
              <TouchableOpacity onPress={() => setMakeRoutineOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: 10, lineHeight: 18 }}>
              Save the {selectedIds.length} selected step{selectedIds.length !== 1 ? "s" : ""} as a reusable routine.
            </Text>
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Text style={ms.fieldLabel}>NAME</Text>
              <TextInput
                style={ms.input}
                value={routineNameInput}
                onChangeText={setRoutineNameInput}
                placeholder="e.g. PickAndPlace"
                placeholderTextColor={colors.textFaint}
                autoFocus
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={confirmMakeRoutine}
              />
              {routineNameInput.trim().length > 0 && !routineNameValid && (
                <Text style={ms.fieldError}>A program or routine with this name already exists.</Text>
              )}
            </View>
            <View style={[ms.actions, { marginTop: 16 }]}>
              <TouchableOpacity style={ms.cancelBtn} onPress={() => setMakeRoutineOpen(false)} activeOpacity={0.7}>
                <Text style={ms.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ms.saveBtn, (!routineNameValid || makingRoutine) && { opacity: 0.4 }]}
                onPress={confirmMakeRoutine}
                disabled={!routineNameValid || makingRoutine}
                activeOpacity={0.7}
              >
                <Repeat2 size={15} color={colors.onAccent} />
                <Text style={ms.saveText}>Create Routine</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>


      {/* Variable context picker modal — routine mode only */}
      <Modal visible={contextPickerOpen} transparent animationType="fade" onRequestClose={() => setContextPickerOpen(false)}>
        <Pressable style={ms.overlay} onPress={() => setContextPickerOpen(false)}>
          <Pressable style={[ms.card, { maxHeight: '70%' }]} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>Variable Context</Text>
              <TouchableOpacity onPress={() => setContextPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingBottom: 8 }}>
              Pick a program whose variables will be available in this routine's expressions and conditions.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[ms.row, ms.rowBorder, !contextProgramName && ms.rowActive]}
                onPress={() => { setContextProgramName(undefined); setContextPickerOpen(false); }}
                activeOpacity={0.7}
              >
                <View style={[ms.radioRing, !contextProgramName && ms.radioRingActive]}>
                  {!contextProgramName && <View style={ms.radioDot} />}
                </View>
                <View style={ms.rowText}>
                  <Text style={[ms.rowLabel, !contextProgramName && ms.rowLabelActive]}>None</Text>
                  <Text style={ms.rowDesc}>Use only this routine's own variables</Text>
                </View>
              </TouchableOpacity>
              {builtPrograms.filter(p => !p.isRoutine && !p.isBackground).map((p, i, arr) => {
                const active = contextProgramName === p.name;
                return (
                  <TouchableOpacity
                    key={p.id ?? p.name}
                    style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => { setContextProgramName(p.name); setContextPickerOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <View style={[ms.radioRing, active && ms.radioRingActive]}>
                      {active && <View style={ms.radioDot} />}
                    </View>
                    <View style={ms.rowText}>
                      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{p.name}</Text>
                      {p.description ? <Text style={ms.rowDesc}>{p.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Program Settings modal */}
      <Modal visible={settingsModalOpen} transparent animationType="fade" onRequestClose={() => setSettingsModalOpen(false)}>
        <Pressable style={ms.overlay} onPress={() => setSettingsModalOpen(false)}>
          <Pressable style={[ms.card, { maxHeight: "70%" }]} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>Program Settings</Text>
              <TouchableOpacity onPress={() => setSettingsModalOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Background program */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.background }}>
                <View style={{ flex: 1, marginRight: spacing.lg }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Background Program</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
                    Runs in parallel — cannot move the robot or change tools/speed
                  </Text>
                </View>
                <Switch
                  value={isBackgroundMode}
                  onValueChange={v => { setIsBackgroundMode(v); if (v) setIsRoutineMode(false); }}
                  trackColor={{ false: colors.border, true: colors.success }}
                />
              </View>

              {/* Stop backgrounds on finish — only for non-background, non-routine programs */}
              {!isRoutineMode && !isBackgroundMode && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 }}>
                  <View style={{ flex: 1, marginRight: spacing.lg }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Stop Backgrounds on Finish</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
                      Kill all running background programs when this program ends
                    </Text>
                  </View>
                  <Switch
                    value={killBackgroundOnStop}
                    onValueChange={setKillBackgroundOnStop}
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
              )}
            </ScrollView>

            <View style={[ms.actions, { marginTop: 8 }]}>
              <TouchableOpacity style={ms.saveBtn} onPress={() => setSettingsModalOpen(false)} activeOpacity={0.7}>
                <Check size={15} color={colors.onAccent} />
                <Text style={ms.saveText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
    </ActiveFieldProvider>
    </ExpressionEnvProvider>
  );
}

// ── CNC handoff helpers ───────────────────────────────────────────────────────

/** Find a step by id anywhere in the nested step tree (every body kind, via stepTree). */
function findStepById(steps: ProgramStep[], id: string): ProgramStep | null {
  return findStep(steps, id) ?? null;
}

/** Copy the CNC toolpath fields from `src` onto the step with `id`, anywhere in the tree. */
function applyCncFieldsById(steps: ProgramStep[], id: string, src: ProgramStep): ProgramStep[] {
  return steps.map(root => mapStepTree(root, s => s.id !== id ? s
    : { ...s, cncDxfFile: src.cncDxfFile, cncSafeZ: src.cncSafeZ, cncSpec: src.cncSpec, cncProgramSteps: src.cncProgramSteps }));
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  // ── Wide (desktop) two-pane layout ──────────────────────────────────────────
  wideRow: {
    flex: 1, flexDirection: "row",
    width: "100%", maxWidth: 1200, alignSelf: "center",
  },
  widePaneLeft: {
    width: 380, flexGrow: 0, flexShrink: 0,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border,
  },
  widePaneLeftContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  widePaneRight: { flex: 1 },
  wideStepsContent: { width: "100%", maxWidth: 720, alignSelf: "center" },
  // Compact header-slot save buttons (wide layout only).
  headerSaveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.sm, paddingHorizontal: 20, minWidth: 96,
    ...shadows.soft,
  },
  headerSaveText: { fontSize: 14, fontWeight: "700", color: colors.onAccent },
  headerUploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, backgroundColor: colors.successSoft, borderRadius: radii.md,
    borderWidth: 1.5, borderColor: "#86efac",
    paddingVertical: spacing.sm, paddingHorizontal: 14,
  },
  headerUploadText: { fontSize: 13, fontWeight: "600", color: colors.success },

  // Multi-select toolbar
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  selectCount: { fontSize: 15, fontWeight: "700", color: colors.text },
  selectActions: { flex: 1 },
  selectActionsContent: { gap: spacing.sm, alignItems: "center", flexGrow: 1, justifyContent: "flex-end" },
  selectAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
  },
  selectActionText: { fontSize: 13, fontWeight: "700", color: colors.accent },
  selectActionDisabled: { opacity: 0.4 },

  metaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadows.soft,
  },
  nameInput: {
    fontSize: 17, fontWeight: "700", color: colors.text,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
  },
  metaSep:  { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  descInput: {
    fontSize: 14, color: colors.textMuted,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },

  // Cover image row
  imageRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 14,
  },
  imagePreviewWrap: {
    width: 72, height: 72, borderRadius: radii.md, overflow: "hidden",
  },
  imagePreview: { width: 72, height: 72 },
  imagePreviewPlaceholder: {
    width: 72, height: 72, borderRadius: radii.md,
    backgroundColor: colors.background, borderWidth: 1.5,
    borderColor: colors.border, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
  },
  imageActions: { flex: 1, gap: spacing.sm },
  imageBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.accentBorder, borderRadius: radii.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.accentSoft,
  },
  imageBtnText: { fontSize: 13, fontWeight: "600", color: colors.accent },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8,
  },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerExitBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerExitText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  sectionCount: {
    fontSize: 11, fontWeight: "700", color: colors.textFaint,
    backgroundColor: colors.surface, borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 1,
  },

  emptySteps: {
    backgroundColor: colors.surface, borderRadius: radii.lg, paddingVertical: spacing.xxl,
    alignItems: "center", gap: spacing.sm,
    ...shadows.soft,
  },
  emptyStepsText: { fontSize: 14, color: colors.textFaint },
  emptyStepsHint: {
    fontSize: 12.5, color: colors.textFaint, textAlign: "center",
    paddingHorizontal: spacing.xl, lineHeight: 17, opacity: 0.85,
  },

  // ── Variables card ──────────────────────────────────────────────────────────

  variablesCard: {
    backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden",
    ...shadows.soft,
    paddingVertical: spacing.xs,
  },
  varRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  varSep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 14 },
  varInfo: { flex: 1, minWidth: 0 },
  // Purple is the variables/routine accent used throughout this screen (name,
  // "fx" computed-value badge, Add Variable, paste) — now the kit's accents.purple.
  varName: { fontSize: 14, fontWeight: "700", color: accents.purple },
  varDesc: { fontSize: 12, color: colors.textFaint },
  varEmptyText: {
    fontSize: 13, color: colors.textFaint, paddingHorizontal: 14, paddingVertical: spacing.md,
    lineHeight: 18,
  },
  varAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: spacing.md,
  },
  varAddBtnBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  varAddText: { fontSize: 13, fontWeight: "600", color: accents.purple },

  // ── Step cards ──────────────────────────────────────────────────────────────

  stepsList: {
    // each StepRow is its own card; InsertDivider provides spacing
  },
  dropAbove: { borderTopWidth: 2.5, borderTopColor: colors.accent },
  dropBelow: { borderBottomWidth: 2.5, borderBottomColor: colors.accent },
  // A body shown inline: its header row, and the cap that closes the block.
  bodyHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6, paddingRight: 4,
  },
  bodyBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  bodyBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: colors.onAccent },
  bodyText: { fontSize: 12, color: colors.textSecondary },
  bodyEmpty: { fontSize: 12, color: colors.textFaint, fontStyle: "italic" },
  bodyAddBtn: {
    width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder,
  },
  bodyPasteBtn: {
    width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: accents.purpleSoft, borderWidth: 1, borderColor: accents.purpleBorder,
  },
  blockEnd: {
    height: 8, marginTop: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 8,
    width: 28, opacity: 0.6,
  },
  // Step search
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 6 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, width: "100%", maxWidth: 720, alignSelf: "center" },
  searchCount: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  // Row actions sheet
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  menuLabel: { fontSize: 15, fontWeight: "600", color: colors.text },
  menuSub: { fontSize: 12, color: colors.textFaint, marginTop: 1 },

  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    ...shadows.soft,
    overflow: "hidden",
  },

  stepCardHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14,
    gap: 10,
  },

  stepCardIcon: {
    width: 36, height: 36, borderRadius: radii.md,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  stepCardIconSmall: { width: 30, height: 30, borderRadius: radii.md },

  stepCardText:   { flex: 1, minWidth: 0, gap: 1 },
  stepCardType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  stepCardName:   { fontSize: 14, fontWeight: "600", color: colors.text },
  stepCardDetail: { fontSize: 12, color: colors.textMuted },
  stepCardStatus: { fontSize: 12, color: colors.accentFaded, fontStyle: "italic" },
  cardAction:     { padding: spacing.xs },

  dragHandle: {
    paddingHorizontal: 2,
    justifyContent: "center", alignItems: "center",
  },

  // Drag visual feedback
  draggingItem: { opacity: 0.35 },
  dropTargetItemTop: {
    borderTopWidth: 2.5,
    borderTopColor: colors.accent,
  },
  dropTargetItemBottom: {
    borderBottomWidth: 2.5,
    borderBottomColor: colors.accent,
  },

  // ── Inner card (inside loop) ─────────────────────────────────────────────────

  innerCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
    paddingLeft: 10, paddingRight: spacing.sm, paddingVertical: spacing.md,
    gap: spacing.sm,
  },

  // ── Loop expanded body ───────────────────────────────────────────────────────

  loopCardBody: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    gap: spacing.xs,
  },
  // Purple, matching the variables/routine accent above — no kit token.
  loopEmptyText: {
    fontSize: 12, color: "#c4b5fd", fontStyle: "italic",
    paddingVertical: 6,
  },
  loopAddRow: {
    flexDirection: "row", gap: spacing.sm,
    paddingTop: spacing.sm, marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  loopAddBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: 10,
    borderWidth: 1, borderRadius: radii.sm,
    backgroundColor: "transparent",
  },
  loopAddText: { fontSize: 12, fontWeight: "600" },

  // Insert divider
  insertDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 2, gap: 6,
  },
  insertDividerInner: { paddingHorizontal: spacing.sm, paddingVertical: 1 },
  insertLine: { flex: 1, height: 1, backgroundColor: colors.border },
  insertBtn: {
    width: 18, height: 18, borderRadius: radii.sm,
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder,
    justifyContent: "center", alignItems: "center",
  },
  insertPasteBtn: {
    width: 18, height: 18, borderRadius: radii.sm,
    backgroundColor: accents.purpleSoft, borderWidth: 1, borderColor: accents.purpleBorder,
    justifyContent: "center", alignItems: "center",
  },

  addRow: {
    flexDirection: "row", gap: 10,
  },
  addCard: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderWidth: 1.5, borderColor: colors.accent, borderRadius: radii.lg,
    paddingVertical: 14, backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: colors.accent },
  pasteCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderWidth: 1.5, borderColor: accents.purple, borderRadius: radii.lg,
    paddingVertical: 14, paddingHorizontal: spacing.lg, backgroundColor: "transparent",
  },
  pasteCardText: { fontSize: 14, fontWeight: "600", color: accents.purple },

  // ── Scope overlay breadcrumb ───────────────────────────────────────────────

  scopeBreadcrumb: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  scopeBreadcrumbRoot: { fontSize: 12, fontWeight: "600", color: colors.accent },
  scopeBreadcrumbItem: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  scopeBreadcrumbCurrent: { fontSize: 12, fontWeight: "700", color: colors.text },

  // Wide-mode scope header — lives above the steps pane, not the whole screen
  scopeHeaderWide: { gap: 10, paddingVertical: spacing.sm, flexWrap: "nowrap" },
  scopeBackBtn: {
    width: 30, height: 30, borderRadius: radii.md, backgroundColor: colors.background,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  scopeTrailWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs,
  },

  bottomBar: {
    flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: spacing.lg,
    paddingTop: 10, paddingBottom: 14,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  stopBtn: {
    width: 48, height: 48, borderRadius: radii.md, backgroundColor: colors.dangerSoft,
    justifyContent: "center", alignItems: "center",
  },
  saveBtn: {
    width: "33%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderWidth: 1.5, borderColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md, backgroundColor: colors.accentSoft,
  },
  saveBtnText: { fontSize: 15, fontWeight: "600", color: colors.accent },
  uploadBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderWidth: 1.5, borderColor: colors.success, borderRadius: radii.md,
    paddingVertical: spacing.md, backgroundColor: colors.successSoft,
  },
  uploadBtnText: { fontSize: 15, fontWeight: "600", color: colors.success },
  runBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: spacing.md,
  },
  runBtnText: { fontSize: 15, fontWeight: "700", color: colors.onAccent },
});


