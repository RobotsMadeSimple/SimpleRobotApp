import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useBuiltPrograms, useConnected } from "@/src/providers/RobotProvider";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { robotClient } from "@/src/services/RobotConnectService";
import { BuiltProgram, ProgramStep, ProgramVariable, StepType } from "@/src/models/robotModels";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  Camera,
  Check,
  ChevronRight,
  ChevronsRight,
  ClipboardPaste,
  Cpu,
  ImagePlus,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { StepRow, InsertDivider } from "@/src/components/ui/builder/StepRow";
import { VariableEditModal } from "@/src/components/ui/builder/VariableEditModal";
import { newId, getStepsAtScope, setStepsAtScope, ScopeFrame, InsertTarget, DragInfo } from "@/src/components/ui/builder/stepUtils";
import { ms } from "@/src/components/ui/builder/builderStyles";

export default function BuilderScreen() {
  const { name: editName, isRoutine: isRoutineParam, source: sourceParam, callerName: callerNameParam } = useLocalSearchParams<{ name?: string; isRoutine?: string; source?: string; callerName?: string }>();
  const builtPrograms = useBuiltPrograms();
  const connected     = useConnected();
  const isLocalMode   = sourceParam === 'local';

  const existing = !isLocalMode && editName
    ? builtPrograms.find(p => p.name === editName) ?? null
    : null;

  const [isRoutineMode, setIsRoutineMode] = useState(
    () => isRoutineParam === "1" || (!isLocalMode && builtPrograms.find(p => p.name === editName)?.isRoutine === true)
  );
  const [isBackgroundMode,   setIsBackgroundMode]   = useState(
    () => !isLocalMode && builtPrograms.find(p => p.name === editName)?.isBackground === true
  );
  const [killBackgroundOnStop, setKillBackgroundOnStop] = useState(
    () => !isLocalMode ? (builtPrograms.find(p => p.name === editName)?.killBackgroundOnStop ?? true) : true
  );

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [contextProgramName, setContextProgramName] = useState<string | undefined>(callerNameParam ?? undefined);
  const [contextPickerOpen,  setContextPickerOpen]  = useState(false);

  const [programName, setProgramName] = useState(existing?.name ?? "");
  const [programId, setProgramId]     = useState<string | undefined>(existing?.id);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [steps, setSteps]             = useState<ProgramStep[]>(existing?.steps ?? []);
  const [variables, setVariables]     = useState<ProgramVariable[]>(existing?.variables ?? []);
  const [coverImage, setCoverImage]   = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(isLocalMode && !!editName);

  // Snapshot of the last-saved state used to detect unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({ name: existing?.name ?? "", description: existing?.description ?? "", steps: existing?.steps ?? [], variables: existing?.variables ?? [] })
  );
  const isDirty = useMemo(
    () => JSON.stringify({ name: programName.trim(), description, steps, variables }) !== savedSnapshot,
    [programName, description, steps, variables, savedSnapshot]
  );

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
        const hydratedSteps = rehydrateIds(prog.steps);
        const loadedVars    = prog.variables ?? [];
        setProgramName(prog.name);
        setDescription(prog.description);
        setSteps(hydratedSteps);
        setVariables(loadedVars);
        setIsRoutineMode(prog.isRoutine ?? false);
        setIsBackgroundMode(prog.isBackground ?? false);
        setKillBackgroundOnStop(prog.killBackgroundOnStop ?? true);
        if (prog.id) setProgramId(prog.id);
        setSavedSnapshot(JSON.stringify({ name: prog.name, description: prog.description, steps: hydratedSteps, variables: loadedVars }));
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

  // Assign fresh IDs to any steps that lost theirs during server round-trip
  function rehydrateIds(src: ProgramStep[]): ProgramStep[] {
    return src.map(s => ({
      ...s,
      id: s.id || newId(),
      loopSteps:      s.loopSteps      ? rehydrateIds(s.loopSteps)      : s.loopSteps,
      ifSteps:        s.ifSteps        ? rehydrateIds(s.ifSteps)        : s.ifSteps,
      elseSteps:      s.elseSteps      ? rehydrateIds(s.elseSteps)      : s.elseSteps,
      elseIfBranches: s.elseIfBranches ? s.elseIfBranches.map(b => ({ ...b, id: b.id || newId(), steps: rehydrateIds(b.steps) })) : s.elseIfBranches,
    }));
  }

  useEffect(() => {
    if (existing) {
      setProgramName(existing.name);
      setDescription(existing.description);
      setSteps(rehydrateIds(existing.steps));
      setVariables(existing.variables ?? []);
      setIsBackgroundMode(existing.isBackground ?? false);
      setKillBackgroundOnStop(existing.killBackgroundOnStop ?? true);
    }
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
      Alert.alert("Permission needed", "Camera access is required to take a photo.");
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
      Alert.alert("Permission needed", "Photo library access is required.");
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

  const [clipboard, setClipboard] = useState<ProgramStep | null>(null);

  function cloneStepWithNewIds(step: ProgramStep): ProgramStep {
    return {
      ...step,
      id: newId(),
      loopSteps:      step.loopSteps?.map(cloneStepWithNewIds),
      ifSteps:        step.ifSteps?.map(cloneStepWithNewIds),
      elseSteps:      step.elseSteps?.map(cloneStepWithNewIds),
      elseIfBranches: step.elseIfBranches?.map(b => ({ ...b, id: newId(), steps: b.steps.map(cloneStepWithNewIds) })),
    };
  }

  function pasteStep(target: InsertTarget) {
    if (!clipboard) return;
    const step = cloneStepWithNewIds(clipboard);
    setSteps(prev => {
      const scoped = getStepsAtScope(prev, scopeStackRef.current);
      let newScoped: ProgramStep[];
      if (target.mode === "append") {
        newScoped = [...scoped, step];
      } else {
        const arr = [...scoped];
        arr.splice(target.afterIndex + 1, 0, step);
        newScoped = arr;
      }
      return setStepsAtScope(prev, scopeStackRef.current, newScoped);
    });
  }

  // ── Variable editor state ─────────────────────────────────────────────────

  const [varModalOpen,   setVarModalOpen]   = useState(false);
  const [editingVar,     setEditingVar]     = useState<ProgramVariable | null>(null);

  function openNewVar()  { setEditingVar(null); setVarModalOpen(true); }
  function openEditVar(v: ProgramVariable) { setEditingVar(v); setVarModalOpen(true); }

  function saveVar(v: ProgramVariable) {
    setVariables(prev => {
      const idx = prev.findIndex(x => x.id === v.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = v; return next; }
      return [...prev, v];
    });
  }

  function deleteVar(id: string) {
    setVariables(prev => prev.filter(v => v.id !== id));
  }

  // ── UI state ──────────────────────────────────────────────────────────────

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [configOpen, setConfigOpen]         = useState(false);
  const [editingStep, setEditingStep]       = useState<ProgramStep | null>(null);

  // ── Scope navigation ──────────────────────────────────────────────────────

  const [scopeStack, setScopeStack] = useState<ScopeFrame[]>([]);
  const scopeStackRef = useRef<ScopeFrame[]>([]);
  useEffect(() => { scopeStackRef.current = scopeStack; }, [scopeStack]);

  const currentSteps = useMemo(() => getStepsAtScope(steps, scopeStack), [steps, scopeStack]);

  // Mirror currentSteps in a ref so drag callbacks always see the latest scoped array
  const currentStepsRef = useRef(currentSteps);
  useEffect(() => { currentStepsRef.current = currentSteps; }, [currentSteps]);

  function pushScope(frame: ScopeFrame) {
    scrollYRef.current = 0;
    setScopeStack(prev => [...prev, frame]);
  }

  function popScope() {
    scrollYRef.current = 0;
    setScopeStack(prev => prev.slice(0, -1));
  }

  // For Label/GoToLabel pickers — the editing step is always in currentSteps
  const editingScope = currentSteps;
  const editingStepIndex = useMemo(() => {
    if (!editingStep) return -1;
    return currentSteps.findIndex(s => s.id === editingStep.id);
  }, [editingStep, currentSteps]);

  const [insertTarget, setInsertTarget]   = useState<InsertTarget>({ mode: "append" });
  const insertTargetRef = useRef<InsertTarget>({ mode: "append" });

  // ── Drag state ────────────────────────────────────────────────────────────

  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  // Auto-scroll while dragging
  const scrollViewRef      = useRef<ScrollView>(null);
  const scopeScrollViewRef = useRef<ScrollView>(null);
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

  // Heights of every row (step.id → px) — measured via onLayout
  const itemHeightsRef = useRef<Map<string, number>>(new Map());

  const handleItemLayout = useCallback((id: string, height: number) => {
    itemHeightsRef.current.set(id, height);
  }, []);

  function calcDropIndex(fromIndex: number, dy: number, arr: ProgramStep[]): number {
    if (fromIndex < 0 || arr.length < 2) return Math.max(0, Math.min(arr.length - 1, fromIndex));
    const DEFAULT_H = 52;
    let target = fromIndex;
    let accumulated = 0;

    if (dy > 0) {
      for (let i = fromIndex + 1; i < arr.length; i++) {
        const h = itemHeightsRef.current.get(arr[i].id) ?? DEFAULT_H;
        if (dy > accumulated + h / 2) { target = i; accumulated += h; }
        else break;
      }
    } else {
      for (let i = fromIndex - 1; i >= 0; i--) {
        const h = itemHeightsRef.current.get(arr[i].id) ?? DEFAULT_H;
        if (-dy > accumulated + h / 2) { target = i; accumulated += h; }
        else break;
      }
    }
    return target;
  }

  function handleDragStart(stepId: string) {
    const idx  = currentStepsRef.current.findIndex(s => s.id === stepId);
    const info: DragInfo = { id: stepId, fromIndex: idx, toIndex: idx };
    dragRef.current = info;
    setDrag(info);
  }

  function handleDragMove(stepId: string, dy: number, absY: number) {
    const d = dragRef.current;
    if (!d || d.id !== stepId) return;

    const newTo = calcDropIndex(d.fromIndex, dy, currentStepsRef.current);
    if (newTo !== d.toIndex) {
      const updated = { ...d, toIndex: newTo };
      dragRef.current = updated;
      setDrag(updated);
    }

    const screenH = Dimensions.get('window').height;
    const ZONE = 110;
    if (absY < ZONE) startAutoScroll(-1);
    else if (absY > screenH - ZONE) startAutoScroll(1);
    else stopAutoScroll();
  }

  function handleDragEnd(stepId: string) {
    stopAutoScroll();
    const d = dragRef.current;
    if (d && d.id === stepId && d.toIndex !== d.fromIndex) {
      moveScopedStepTo(d.fromIndex, d.toIndex);
    }
    dragRef.current = null;
    setDrag(null);
  }

  // ── Step helpers ──────────────────────────────────────────────────────────

  function defaultStep(type: StepType): ProgramStep {
    return {
      id: newId(), type,
      name: undefined,
      pointName: undefined,
      speed: undefined, accel: undefined, decel: undefined,
      offsetX: undefined, offsetY: undefined, offsetZ: undefined,
      offsetRX: undefined, offsetRY: undefined, offsetRZ: undefined,
      toolOffsetX: undefined, toolOffsetY: undefined, toolOffsetZ: undefined,
      toolOffsetRX: undefined, toolOffsetRY: undefined, toolOffsetRZ: undefined,
      outputNumber: 1, outputValue: true,
      waitMs: 500,
      loopCount: 1, loopSteps: type === "Loop" ? [] : undefined,
      statusMessage: undefined, statusWarning: undefined, statusError: undefined, statusSeverity: undefined,
      routineName: undefined,
      visionProgramId: undefined, visionProgramName: undefined, visionZoneId: undefined, visionZoneVar: undefined, visionOutputs: undefined,
      varPointName: undefined, varPointIndex: undefined,
      variableName: undefined, variableExpr: undefined,
      expressions: undefined,
      labelId: type === "Label" ? newId() : undefined,
      labelName: undefined,
      condition: type === "IfCondition" ? { combinator: 'ALL' as const, items: [] } : undefined,
      ifSteps:   type === "IfCondition" ? [] : undefined,
      toolName:  undefined,
      localName: undefined,
      saveImagePath: undefined,
      saveImageCameraId: undefined,
      backgroundProgramName: undefined,
      backgroundProgramId: undefined,
      threadDistance: undefined,
      threadPitch: undefined,
      threadPeck: undefined,
      threadPeckDepth: undefined,
      threadReverseOut: undefined,
      cncDxfFile: undefined,
      cncSafeZ: undefined,
      cncProgramSteps: type === "CncProgram" ? [] : undefined,
    };
  }

  function openTypePicker(target: InsertTarget) {
    insertTargetRef.current = target;
    setInsertTarget(target);
    setTypePickerOpen(true);
  }

  function addStep(type: StepType) {
    const target = insertTargetRef.current;
    const step = defaultStep(type);

    setSteps(prev => {
      const scoped = getStepsAtScope(prev, scopeStackRef.current);
      let newScoped: ProgramStep[];
      if (target.mode === "append") {
        newScoped = [...scoped, step];
      } else {
        const arr = [...scoped];
        arr.splice(target.afterIndex + 1, 0, step);
        newScoped = arr;
      }
      return setStepsAtScope(prev, scopeStackRef.current, newScoped);
    });

    setEditingStep(step);
    setConfigOpen(true);
  }

  function updateStep(updated: ProgramStep) {
    setSteps(prev => {
      const scoped    = getStepsAtScope(prev, scopeStackRef.current);
      const newScoped = scoped.map(s => s.id === updated.id ? updated : s);
      return setStepsAtScope(prev, scopeStackRef.current, newScoped);
    });
  }

  function deleteStep(id: string) {
    setSteps(prev => {
      const scoped    = getStepsAtScope(prev, scopeStackRef.current);
      const newScoped = scoped.filter(s => s.id !== id);
      return setStepsAtScope(prev, scopeStackRef.current, newScoped);
    });
  }

  function moveScopedStepTo(from: number, to: number) {
    setSteps(prev => {
      const scoped = [...getStepsAtScope(prev, scopeStackRef.current)];
      const [removed] = scoped.splice(from, 1);
      scoped.splice(to, 0, removed);
      return setStepsAtScope(prev, scopeStackRef.current, scoped);
    });
  }

  // ── Save / Run ────────────────────────────────────────────────────────────

  function buildProg(): BuiltProgram {
    return {
      id: programId,
      name: programName.trim(),
      description: description.trim(),
      steps,
      variables: variables.length > 0 ? variables : undefined,
      lastUpdatedUnixMs: Date.now(),
      isRoutine: isRoutineMode,
      isBackground: isBackgroundMode || undefined,
      killBackgroundOnStop: (!isRoutineMode && !isBackgroundMode) ? (killBackgroundOnStop || undefined) : undefined,
    };
  }

  async function save(): Promise<boolean> {
    const name = programName.trim();
    if (!name) {
      Alert.alert("Name required", "Please give the program a name.");
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
      await robotClient.saveBuiltProgram(prog).catch(() => {});
      if (coverImage) await robotClient.saveProgramImage(name, coverImage).catch(() => {});
    }
    setSavedSnapshot(JSON.stringify({ name, description: description.trim(), steps, variables }));
    return true;
  }

  async function saveToRobot() {
    const name = programName.trim();
    if (!name) { Alert.alert("Name required", "Please give the program a name."); return; }
    const prog = buildProg();
    await robotClient.saveBuiltProgram(prog).catch(() => {});
    if (coverImage) await robotClient.saveProgramImage(name, coverImage).catch(() => {});
    Alert.alert("Saved to Robot", `"${name}" has been saved to the robot.`);
  }

  async function handleSave() { if (await save()) router.back(); }

  function handleBack() {
    if (scopeStackRef.current.length > 0) { popScope(); return; }
    if (!isDirty) { router.back(); return; }
    Alert.alert(
      "Unsaved Changes",
      "You have unsaved changes. Exit without saving?",
      [
        { text: "Save & Exit", onPress: async () => { if (await save()) router.back(); } },
        { text: "Discard",     style: "destructive", onPress: () => router.back() },
        { text: "Cancel",      style: "cancel" },
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
    if (!(await save())) return;
    const name = programName.trim();
    await robotClient.executeBuiltProgram(name).catch(() => {});
    router.push(`/(tabs)/program/monitor-program?name=${encodeURIComponent(name)}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (localLoading) {
    return (
      <View style={styles.container}>
        <SubPageHeader title="Loading…" onBack={handleBack} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: "#9ca3af" }}>Loading local program…</Text>
        </View>
      </View>
    );
  }

  const builderTitle = scopeStack.length > 0
    ? scopeStack[scopeStack.length - 1].label
    : `${isRoutineMode ? "Routine" : isBackgroundMode ? "Background" : "Program"} Builder${isLocalMode ? " · Local" : ""}`;

  return (
    <View style={styles.container}>
      <SubPageHeader title={builderTitle} onBack={handleBack} />
      {scopeStack.length > 0 ? (
        <>
          {/* Breadcrumb */}
          {scopeStack.length > 0 && (
            <View style={styles.scopeBreadcrumb}>
              <TouchableOpacity onPress={() => setScopeStack([])} hitSlop={8} activeOpacity={0.7}>
                <Text style={styles.scopeBreadcrumbRoot}>Program</Text>
              </TouchableOpacity>
              {scopeStack.slice(0, -1).map((frame, fi) => (
                <React.Fragment key={fi}>
                  <ChevronRight size={12} color="#9ca3af" />
                  <TouchableOpacity onPress={() => setScopeStack(prev => prev.slice(0, fi + 1))} hitSlop={8} activeOpacity={0.7}>
                    <Text style={styles.scopeBreadcrumbItem}>{frame.label}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
              <ChevronRight size={12} color="#9ca3af" />
              <Text style={styles.scopeBreadcrumbCurrent}>{scopeStack[scopeStack.length - 1].label}</Text>
            </View>
          )}

          <ScrollView
            ref={scopeScrollViewRef}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={drag === null}
            onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
          >
            {currentSteps.length === 0 ? (
              <View style={styles.emptySteps}>
                <Cpu size={32} color="#d1d5db" />
                <Text style={styles.emptyStepsText}>No steps in this scope</Text>
              </View>
            ) : (
              <View style={styles.stepsList}>
                <InsertDivider
                  onPress={() => openTypePicker({ mode: "insert", afterIndex: -1 })}
                  onPaste={clipboard ? () => pasteStep({ mode: "insert", afterIndex: -1 }) : undefined}
                  disabled={!!drag}
                />
                {currentSteps.map((step, i) => (
                  <StepRow
                    key={step.id}
                    step={step}
                    index={i}
                    isLast={i === currentSteps.length - 1}
                    isBeingDragged={drag?.id === step.id}
                    isDropAbove={!!(drag && drag.id !== step.id && drag.toIndex < drag.fromIndex && drag.toIndex === i)}
                    isDropBelow={!!(drag && drag.id !== step.id && drag.toIndex > drag.fromIndex && drag.toIndex === i)}
                    isDragging={!!drag}
                    onEdit={() => { setEditingStep(step); setConfigOpen(true); }}
                    onCopy={() => setClipboard(step)}
                    onDelete={() => Alert.alert("Delete Step", "Remove this step?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteStep(step.id) },
                    ])}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onInsertAfter={() => openTypePicker({ mode: "insert", afterIndex: i })}
                    onPasteAfter={clipboard ? () => pasteStep({ mode: "insert", afterIndex: i }) : undefined}
                    onEnterScope={pushScope}
                    onUpdateIfCondition={updateStep}
                    onItemLayout={handleItemLayout}
                    variables={variables}
                    contextVariables={contextVariables.length > 0 ? contextVariables : undefined}
                    onEnterRoutine={!isRoutineMode ? (routineName) => {
                      router.push({ pathname: '/(tabs)/program/builder', params: { name: routineName, isRoutine: '1', callerName: programName } });
                    } : undefined}
                    onOpenCncBuilder={stepId => {
                      router.push({ pathname: '/(tabs)/program/cnc-builder', params: { programName, stepId } });
                    }}
                  />
                ))}
              </View>
            )}

            <View style={styles.addRow}>
              <TouchableOpacity
                style={styles.addCard}
                onPress={() => openTypePicker({ mode: "append" })}
                activeOpacity={0.7}
              >
                <Plus size={16} color="#2563eb" />
                <Text style={styles.addCardText}>Add Step</Text>
              </TouchableOpacity>
              {clipboard && (
                <TouchableOpacity
                  style={styles.pasteCard}
                  onPress={() => pasteStep({ mode: "append" })}
                  activeOpacity={0.7}
                >
                  <ClipboardPaste size={16} color="#7c3aed" />
                  <Text style={styles.pasteCardText}>Paste</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          {isLocalMode && connected && (
            <View style={styles.bottomBar}>
              <TouchableOpacity style={styles.uploadBtn} onPress={saveToRobot} activeOpacity={0.8}>
                <Upload size={15} color="#16a34a" />
                <Text style={styles.uploadBtnText}>Save to Robot</Text>
              </TouchableOpacity>
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
        scrollEnabled={drag === null}
        onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {/* Name + description */}
        <View style={styles.metaCard}>
          <TextInput
            style={styles.nameInput}
            value={programName}
            onChangeText={setProgramName}
            placeholder={isRoutineMode ? "Routine name…" : isBackgroundMode ? "Background program name…" : "Program name…"}
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
          />
          <View style={styles.metaSep} />
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Description (optional)"
            placeholderTextColor="#c4c4c4"
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
                      source={{ uri: `data:image/jpeg;base64,${coverImage}` }}
                      style={styles.imagePreview}
                    />
                  ) : (
                    <View style={styles.imagePreviewPlaceholder}>
                      <ImagePlus size={22} color="#d1d5db" />
                    </View>
                  )}
                </View>
                <View style={styles.imageActions}>
                  <TouchableOpacity style={styles.imageBtn} onPress={pickFromCamera} activeOpacity={0.75}>
                    <Camera size={15} color="#2563eb" />
                    <Text style={styles.imageBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageBtn} onPress={pickFromLibrary} activeOpacity={0.75}>
                    <ImagePlus size={15} color="#2563eb" />
                    <Text style={styles.imageBtnText}>Photo Library</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {!isLocalMode && (
                <>
                  <View style={styles.metaSep} />
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
                    onPress={() => setSettingsModalOpen(true)}
                    activeOpacity={0.7}
                  >
                    <SlidersHorizontal size={16} color="#6b7280" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", flex: 1 }}>Program Settings</Text>
                    {isBackgroundMode && (
                      <View style={{ backgroundColor: "#dcfce7", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#16a34a" }}>BACKGROUND</Text>
                      </View>
                    )}
                    <ChevronRight size={15} color="#9ca3af" />
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
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
                onPress={() => setSettingsModalOpen(true)}
                activeOpacity={0.7}
              >
                <SlidersHorizontal size={16} color="#6b7280" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", flex: 1 }}>Program Settings</Text>
                {isBackgroundMode && (
                  <View style={{ backgroundColor: "#dcfce7", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#16a34a" }}>BACKGROUND</Text>
                  </View>
                )}
                <ChevronRight size={15} color="#9ca3af" />
              </TouchableOpacity>
            </>
          )}

          {/* Variable context picker — routine mode only */}
          {isRoutineMode && (
            <>
              <View style={styles.metaSep} />
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
                onPress={() => setContextPickerOpen(true)}
                activeOpacity={0.7}
              >
                <ChevronsRight size={16} color="#6b7280" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", flex: 1 }}>Variable Context</Text>
                <Text style={{ fontSize: 12, color: contextProgramName ? "#2563eb" : "#9ca3af", maxWidth: 160 }} numberOfLines={1}>
                  {contextProgramName ?? "None"}
                </Text>
                <ChevronRight size={15} color="#9ca3af" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Variables */}
        <Text style={styles.sectionLabel}>VARIABLES</Text>
        <View style={styles.variablesCard}>
          {variables.length === 0 ? (
            <Text style={styles.varEmptyText}>
              No variables yet. Tap + to define reusable values you can reference in any numeric field.
            </Text>
          ) : (
            variables.map((v, i) => (
              <React.Fragment key={v.id}>
                {i > 0 && <View style={styles.varSep} />}
                <TouchableOpacity style={styles.varRow} onPress={() => openEditVar(v)} activeOpacity={0.7}>
                  <View style={styles.varInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.varName}>${v.name}</Text>
                      {v.points != null && (
                        <View style={{ backgroundColor: "#ecfeff", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#0891b2", letterSpacing: 0.3 }}>POINTS</Text>
                        </View>
                      )}
                      {v.isBoolean && (
                        <View style={{ backgroundColor: "#f0fdf4", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#bbf7d0" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#16a34a", letterSpacing: 0.3 }}>BOOL</Text>
                        </View>
                      )}
                      {v.isGlobal && (
                        <View style={{ backgroundColor: "#fffbeb", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#fde68a" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#b45309", letterSpacing: 0.3 }}>GLOBAL</Text>
                        </View>
                      )}
                      {v.displayOnMonitor && (
                        <View style={{ backgroundColor: "#eff6ff", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#bfdbfe" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#2563eb", letterSpacing: 0.3 }}>MONITOR</Text>
                        </View>
                      )}
                      {v.isStopwatch && (
                        <View style={{ backgroundColor: "#e0f2fe", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#7dd3fc" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#0891b2", letterSpacing: 0.3 }}>STOPWATCH</Text>
                        </View>
                      )}
                      {v.isPersistent && (
                        <View style={{ backgroundColor: "#f5f3ff", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "#ddd6fe" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#7c3aed", letterSpacing: 0.3 }}>PERSIST</Text>
                        </View>
                      )}
                    </View>
                    {v.description ? (
                      <Text style={styles.varDesc}>{v.description}</Text>
                    ) : v.points != null ? (
                      <Text style={styles.varDesc}>Vector6[ ] — populated by RunVision</Text>
                    ) : v.isBoolean ? (
                      <Text style={styles.varDesc}>Boolean — initial: {v.value !== 0 ? "True" : "False"}</Text>
                    ) : v.isStopwatch ? (
                      <Text style={styles.varDesc}>Stopwatch — elapsed ms</Text>
                    ) : (
                      <Text style={styles.varDesc}>Initial: {v.value}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => Alert.alert("Delete Variable", `Remove $${v.name}?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteVar(v.id) },
                    ])}
                    hitSlop={8} activeOpacity={0.7}
                  >
                    <Trash2 size={14} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              </React.Fragment>
            ))
          )}
          <TouchableOpacity
            style={[styles.varAddBtn, variables.length > 0 && styles.varAddBtnBorder]}
            onPress={openNewVar} activeOpacity={0.7}
          >
            <Plus size={13} color="#7c3aed" />
            <Text style={styles.varAddText}>Add Variable</Text>
          </TouchableOpacity>
        </View>

        {/* Steps (root level) */}
        <Text style={styles.sectionLabel}>STEPS</Text>

        {steps.length === 0 ? (
          <View style={styles.emptySteps}>
            <Cpu size={32} color="#d1d5db" />
            <Text style={styles.emptyStepsText}>No steps yet</Text>
          </View>
        ) : (
          <View style={styles.stepsList}>
            <InsertDivider
              onPress={() => openTypePicker({ mode: "insert", afterIndex: -1 })}
              onPaste={clipboard ? () => pasteStep({ mode: "insert", afterIndex: -1 }) : undefined}
              disabled={!!drag}
            />
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                index={i}
                isLast={i === steps.length - 1}
                isBeingDragged={drag?.id === step.id}
                isDropAbove={!!(drag && drag.id !== step.id && drag.toIndex < drag.fromIndex && drag.toIndex === i)}
                isDropBelow={!!(drag && drag.id !== step.id && drag.toIndex > drag.fromIndex && drag.toIndex === i)}
                isDragging={!!drag}
                onEdit={() => { setEditingStep(step); setConfigOpen(true); }}
                onCopy={() => setClipboard(step)}
                onDelete={() => Alert.alert("Delete Step", "Remove this step?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteStep(step.id) },
                ])}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onInsertAfter={() => openTypePicker({ mode: "insert", afterIndex: i })}
                onPasteAfter={clipboard ? () => pasteStep({ mode: "insert", afterIndex: i }) : undefined}
                onEnterScope={pushScope}
                onUpdateIfCondition={updateStep}
                onItemLayout={handleItemLayout}
                variables={variables}
                contextVariables={contextVariables.length > 0 ? contextVariables : undefined}
                onEnterRoutine={!isRoutineMode ? (routineName) => {
                  router.push({ pathname: '/(tabs)/program/builder', params: { name: routineName, isRoutine: '1', callerName: programName } });
                } : undefined}
                onOpenCncBuilder={stepId => {
                  router.push({ pathname: '/(tabs)/program/cnc-builder', params: { programName, stepId } });
                }}
              />
            ))}
          </View>
        )}

        {/* Add / Paste step */}
        <View style={styles.addRow}>
          <TouchableOpacity
            style={styles.addCard}
            onPress={() => openTypePicker({ mode: "append" })}
            activeOpacity={0.7}
          >
            <Plus size={16} color="#2563eb" />
            <Text style={styles.addCardText}>Add Step</Text>
          </TouchableOpacity>
          {clipboard && (
            <TouchableOpacity
              style={styles.pasteCard}
              onPress={() => pasteStep({ mode: "append" })}
              activeOpacity={0.7}
            >
              <ClipboardPaste size={16} color="#7c3aed" />
              <Text style={styles.pasteCardText}>Paste</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isLocalMode && connected && (
          <TouchableOpacity style={styles.uploadBtn} onPress={saveToRobot} activeOpacity={0.8}>
            <Upload size={15} color="#16a34a" />
            <Text style={styles.uploadBtnText}>Save to Robot</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
          <Wrench size={16} color="#2563eb" />
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
        </>
      )}

      <StepTypePicker
        visible={typePickerOpen}
        onPick={addStep}
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
        onClose={() => setConfigOpen(false)}
        onCreateVariable={openNewVar}
      />
      <VariableEditModal
        visible={varModalOpen}
        variable={editingVar}
        onSave={saveVar}
        onClose={() => setVarModalOpen(false)}
      />

      {/* Variable context picker modal — routine mode only */}
      <Modal visible={contextPickerOpen} transparent animationType="fade" onRequestClose={() => setContextPickerOpen(false)}>
        <Pressable style={ms.overlay} onPress={() => setContextPickerOpen(false)}>
          <Pressable style={[ms.card, { maxHeight: '70%' }]} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>Variable Context</Text>
              <TouchableOpacity onPress={() => setContextPickerOpen(false)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: '#6b7280', paddingHorizontal: 16, paddingBottom: 8 }}>
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
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Background program */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6" }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Background Program</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Runs in parallel — cannot move the robot or change tools/speed
                  </Text>
                </View>
                <Switch
                  value={isBackgroundMode}
                  onValueChange={v => { setIsBackgroundMode(v); if (v) setIsRoutineMode(false); }}
                  trackColor={{ false: "#e5e7eb", true: "#16a34a" }}
                />
              </View>

              {/* Stop backgrounds on finish — only for non-background, non-routine programs */}
              {!isRoutineMode && !isBackgroundMode && (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 }}>
                  <View style={{ flex: 1, marginRight: 16 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Stop Backgrounds on Finish</Text>
                    <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                      Kill all running background programs when this program ends
                    </Text>
                  </View>
                  <Switch
                    value={killBackgroundOnStop}
                    onValueChange={setKillBackgroundOnStop}
                    trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
                  />
                </View>
              )}
            </ScrollView>

            <View style={[ms.actions, { marginTop: 8 }]}>
              <TouchableOpacity style={ms.saveBtn} onPress={() => setSettingsModalOpen(false)} activeOpacity={0.7}>
                <Check size={15} color="white" />
                <Text style={ms.saveText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content:   { padding: 16, paddingBottom: 32, gap: 12 },

  metaCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  nameInput: {
    fontSize: 17, fontWeight: "700", color: "#111827",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  metaSep:  { height: StyleSheet.hairlineWidth, backgroundColor: "#e5e7eb" },
  descInput: {
    fontSize: 14, color: "#6b7280",
    paddingHorizontal: 16, paddingVertical: 12,
  },

  // Cover image row
  imageRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 14,
  },
  imagePreviewWrap: {
    width: 72, height: 72, borderRadius: 10, overflow: "hidden",
  },
  imagePreview: { width: 72, height: 72 },
  imagePreviewPlaceholder: {
    width: 72, height: 72, borderRadius: 10,
    backgroundColor: "#f3f4f6", borderWidth: 1.5,
    borderColor: "#e5e7eb", borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
  },
  imageActions: { flex: 1, gap: 8 },
  imageBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderWidth: 1.5, borderColor: "#bfdbfe", borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
  },
  imageBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8,
  },

  emptySteps: {
    backgroundColor: "#fff", borderRadius: 14, paddingVertical: 32,
    alignItems: "center", gap: 8,
    shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  emptyStepsText: { fontSize: 14, color: "#9ca3af" },

  // ── Variables card ──────────────────────────────────────────────────────────

  variablesCard: {
    backgroundColor: "#fff", borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    paddingVertical: 4,
  },
  varRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  varSep: { height: StyleSheet.hairlineWidth, backgroundColor: "#e5e7eb", marginHorizontal: 14 },
  varInfo: { flex: 1, minWidth: 0 },
  varName: { fontSize: 14, fontWeight: "700", color: "#7c3aed" },
  varDesc: { fontSize: 12, color: "#9ca3af" },
  varEmptyText: {
    fontSize: 13, color: "#9ca3af", paddingHorizontal: 14, paddingVertical: 12,
    lineHeight: 18,
  },
  varAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  varAddBtnBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  varAddText: { fontSize: 13, fontWeight: "600", color: "#7c3aed" },

  // ── Step cards ──────────────────────────────────────────────────────────────

  stepsList: {
    // each StepRow is its own card; InsertDivider provides spacing
  },

  stepCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: "hidden",
  },

  stepCardHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14,
    gap: 10,
  },

  stepCardIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  stepCardIconSmall: { width: 30, height: 30, borderRadius: 8 },

  stepCardText:   { flex: 1, minWidth: 0, gap: 1 },
  stepCardType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  stepCardName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  stepCardDetail: { fontSize: 12, color: "#6b7280" },
  stepCardStatus: { fontSize: 12, color: "#93c5fd", fontStyle: "italic" },
  cardAction:     { padding: 4 },

  dragHandle: {
    paddingHorizontal: 2,
    justifyContent: "center", alignItems: "center",
  },

  // Drag visual feedback
  draggingItem: { opacity: 0.35 },
  dropTargetItemTop: {
    borderTopWidth: 2.5,
    borderTopColor: "#2563eb",
  },
  dropTargetItemBottom: {
    borderBottomWidth: 2.5,
    borderBottomColor: "#2563eb",
  },

  // ── Inner card (inside loop) ─────────────────────────────────────────────────

  innerCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#f8f9fb",
    borderRadius: 10,
    borderLeftWidth: 3,
    paddingLeft: 10, paddingRight: 8, paddingVertical: 11,
    gap: 8,
  },

  // ── Loop expanded body ───────────────────────────────────────────────────────

  loopCardBody: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 4,
  },
  loopEmptyText: {
    fontSize: 12, color: "#c4b5fd", fontStyle: "italic",
    paddingVertical: 6,
  },
  loopAddRow: {
    flexDirection: "row", gap: 8,
    paddingTop: 8, marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  loopAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 10,
    borderWidth: 1, borderRadius: 8,
    backgroundColor: "transparent",
  },
  loopAddText: { fontSize: 12, fontWeight: "600" },

  // Insert divider
  insertDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 2, gap: 6,
  },
  insertDividerInner: { paddingHorizontal: 8, paddingVertical: 1 },
  insertLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  insertBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe",
    justifyContent: "center", alignItems: "center",
  },
  insertPasteBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#f5f3ff", borderWidth: 1, borderColor: "#ddd6fe",
    justifyContent: "center", alignItems: "center",
  },

  addRow: {
    flexDirection: "row", gap: 10,
  },
  addCard: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderColor: "#2563eb", borderRadius: 14,
    paddingVertical: 14, backgroundColor: "transparent",
  },
  addCardText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },
  pasteCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderColor: "#7c3aed", borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 18, backgroundColor: "transparent",
  },
  pasteCardText: { fontSize: 14, fontWeight: "600", color: "#7c3aed" },

  // ── Scope overlay breadcrumb ───────────────────────────────────────────────

  scopeBreadcrumb: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
  },
  scopeBreadcrumbRoot: { fontSize: 12, fontWeight: "600", color: "#2563eb" },
  scopeBreadcrumbItem: { fontSize: 12, fontWeight: "600", color: "#374151" },
  scopeBreadcrumbCurrent: { fontSize: 12, fontWeight: "700", color: "#111827" },

  bottomBar: {
    flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 14,
    backgroundColor: "#f3f4f6",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  stopBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: "#fee2e2",
    justifyContent: "center", alignItems: "center",
  },
  saveBtn: {
    width: "33%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, borderWidth: 1.5, borderColor: "#2563eb", borderRadius: 12,
    paddingVertical: 13, backgroundColor: "#eff6ff",
  },
  saveBtnText: { fontSize: 15, fontWeight: "600", color: "#2563eb" },
  uploadBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, borderWidth: 1.5, borderColor: "#16a34a", borderRadius: 12,
    paddingVertical: 13, backgroundColor: "#f0fdf4",
  },
  uploadBtnText: { fontSize: 15, fontWeight: "600", color: "#16a34a" },
  runBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13,
  },
  runBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});


