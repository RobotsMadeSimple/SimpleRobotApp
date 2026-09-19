import React, { useEffect, useState } from "react";
import {
  Modal,
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
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ChevronRight, CircuitBoard, Cpu, Globe, List, Minus, Plus, Radio, RotateCcw, RotateCw, Search, Trash2, X } from "lucide-react-native";
import {
  ArucoVisionStepOutput,
  AuxAxisChannelState,
  AuxDeviceState,
  CameraState,
  ColorVisionStepOutput,
  ConditionGroup,
  Grid,
  GridPoint,
  JsonInboundMapping,
  JsonKeyValue,
  PolygonVisionStepOutput,
  ProgramStep,
  ProgramVariable,
  RobotStack,
  StackPoint,
  THREAD_PRESETS,
  VisionProgram,
  VisionStepOutput,
  auxStepsPerUnit,
  auxUnitLabel,
  isListVariable,
  isPointListVariable,
  isRecordListVariable,
  isScalarListVariable,
} from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  useBuiltPrograms,
  useGrids,
  useLocals,
  useNanoIO,
  usePoints,
  useRelayIO,
  useSelectedRobot,
  useStacks,
  useTools,
} from "@/src/providers/RobotProvider";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { ms } from "./builderStyles";
import { ExpressionInput, TemplateInput } from "./NumericInputs";
import { SetVariableFields } from "./SetVariableFields";
import { SaveImageFields } from "./SaveImageFields";
import { VarPickerModal, VarSelectorButton } from "./VarPicker";
import { ConditionGroupEditor, conditionSummary } from "./ConditionEditor";
import { VarType, VariableEditModal } from "./VariableEditModal";

type SubPage = null | "point" | "speed" | "posOffset" | "toolOffset" | "posOverride" | "jumpHeight";

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
}: {
  visible: boolean;
  step: ProgramStep | null;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  scopeSteps?: ProgramStep[];
  stepIndex?: number;
  onSave: (updated: ProgramStep) => void;
  onClose: () => void;
  onEnterRoutine?: (routineName: string) => void;
  onCreateVariable?: (defaultType?: VarType) => void;
  onSaveVariable?: (v: ProgramVariable) => void;
  onCreateRoutine?: () => void;
}) {
  const points        = usePoints();
  const grids         = useGrids();
  const stacks        = useStacks();
  const tools         = useTools();
  const locals        = useLocals();
  const allPrograms   = useBuiltPrograms();
  const routines      = allPrograms.filter(p => p.isRoutine);
  const nanos         = useNanoIO();
  const relay         = useRelayIO();
  const robot         = useSelectedRobot();
  // ASTRO and CNC 4-axis robots only have Z rotation — hide RX/RY offset fields.
  const rzOnly        = robot?.robotType === 'ASTRO' || robot?.robotType === 'CNC4Axis';
  const [draft, setDraft]           = useState<ProgramStep | null>(null);
  const [pulseMsText, setPulseMs]   = useState("");
  const [subPage, setSubPage]       = useState<SubPage>(null);
  // Which modifier row is currently showing its inline "clear?" confirmation.
  const [clearConfirm, setClearConfirm] = useState<SubPage>(null);
  const [gridPointMode, setGridPointMode] = useState<'savedPoint' | 'gridPoint' | 'stackPoint' | 'variable'>('savedPoint');
  const [gridPickerOpen, setGridPickerOpen] = useState(false);
  const [stackPickerOpen, setStackPickerOpen] = useState(false);
  const [ioConfig, setIoConfig]       = useState<{ enableStbCard: boolean; enableNanoCards: boolean; enableRelayCard: boolean } | null>(null);
  const [auxDevices, setAuxDevices]       = useState<AuxDeviceState[]>([]);
  const [visionPrograms, setVisionPrograms] = useState<VisionProgram[]>([]);
  const [cameraDevices, setCameraDevices]   = useState<CameraState[]>([]);
  const [visionProgPickerOpen, setVisionProgPickerOpen] = useState(false);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [zoneVarPickerOpen, setZoneVarPickerOpen] = useState(false);
  const [visionPicker, setVisionPicker]   = useState<{ inspId: string; field: 'detectedVar' | 'countVar' | 'pointsVar' } | null>(null);
  const [colorPicker, setColorPicker]     = useState<{ inspId: string; field: 'coverageVar' | 'passedVar' | 'cellsVar' | 'cellsPassedVar' } | null>(null);
  const [polygonPicker, setPolygonPicker] = useState<{ inspId: string; field: keyof Omit<PolygonVisionStepOutput, 'inspectionId'> } | null>(null);
  const [arucoPicker, setArucoPicker]     = useState<{ inspId: string; field: keyof Omit<ArucoVisionStepOutput, 'inspectionId'> } | null>(null);
  const [threadPresetPickerOpen, setThreadPresetPickerOpen] = useState(false);
  const [waitTimeoutVarPicker,  setWaitTimeoutVarPicker]  = useState(false);
  const [loopIndexVarPicker,    setLoopIndexVarPicker]    = useState(false);
  const [forEachSourcePicker,   setForEachSourcePicker]   = useState(false);
  const [forEachValuePicker,    setForEachValuePicker]    = useState(false);
  const [jsonInboundPicker,  setJsonInboundPicker]  = useState<number | null>(null);
  const [jsonOutboundPicker, setJsonOutboundPicker] = useState<number | null>(null);
  const [captureVarCreateOpen, setCaptureVarCreateOpen] = useState(false);
  const [httpReceiveInboundPicker, setHttpReceiveInboundPicker] = useState<number | null>(null);

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.min(windowWidth - 48, 520);

  useEffect(() => {
    if (!visible) return;
    robotClient.getRobotConfig()
      .then(cfg => setIoConfig({
        enableStbCard:   cfg.enableStbCard   ?? true,
        enableNanoCards: cfg.enableNanoCards ?? true,
        enableRelayCard: cfg.enableRelayCard ?? false,
      }))
      .catch(() => setIoConfig({ enableStbCard: true, enableNanoCards: true, enableRelayCard: false }));
    robotClient.getAuxState().catch(() => {});
    robotClient.getVisionPrograms()
      .then(({ programs }) => setVisionPrograms(programs))
      .catch(() => {});
    const unsubAux     = robotClient.onAuxAxis(devices => setAuxDevices(devices));
    const unsubCameras = robotClient.onCameras(cams => setCameraDevices(cams));
    return () => { unsubAux(); unsubCameras(); };
  }, [visible]);

  useEffect(() => {
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
  }, [step]);


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
  const modifierRow = (label: string, isSet: boolean, value: string, page: SubPage, clearKeys: string[]) => {
    if (!isSet) {
      return (
        <TouchableOpacity style={ms.modRowAdd} onPress={() => setSubPage(page)} activeOpacity={0.7}>
          <Plus size={15} color="#b8bec9" />
          <Text style={ms.modAddText}>{label}</Text>
        </TouchableOpacity>
      );
    }
    if (clearConfirm === page) {
      return (
        <View style={ms.modRow}>
          <Text style={[ms.subRowLabel, { flex: 1 }]} numberOfLines={1}>Clear {label}?</Text>
          <TouchableOpacity onPress={() => setClearConfirm(null)} hitSlop={8} activeOpacity={0.7} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#6b7280" }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { clearFields(clearKeys); setClearConfirm(null); }} hitSlop={8} activeOpacity={0.7} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#dc2626" }}>Clear</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={ms.modRow}>
        <TouchableOpacity style={ms.subRowLeft} onPress={() => setSubPage(page)} activeOpacity={0.7}>
          <Text style={ms.subRowLabel}>{label}</Text>
          <Text style={ms.subRowValue} numberOfLines={1}>{value}</Text>
        </TouchableOpacity>
        <DeleteIconButton onPress={() => setClearConfirm(page)} size={16} style={{ padding: 4 }} />
      </View>
    );
  };

  // ── Sub-page content ──────────────────────────────────────────────────────

  function renderSubPage() {
    switch (subPage) {
      case "point": {
        return (
          <>
            {/* Mode tabs */}
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
              {(['savedPoint', 'gridPoint', 'stackPoint', 'variable'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                      backgroundColor: gridPointMode === mode ? '#2563eb' : '#f3f4f6',
                      borderWidth: 1, borderColor: gridPointMode === mode ? '#2563eb' : '#e5e7eb' }
                  ]}
                  onPress={() => {
                    setGridPointMode(mode);
                    if (mode === 'savedPoint') {
                      set({ gridPoint: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined, pointNameExpr: undefined });
                    } else if (mode === 'gridPoint') {
                      if (!draft!.gridPoint) {
                        set({ pointName: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined, pointNameExpr: undefined, gridPoint: { gridId: '', rowIndex: 0, colIndex: 0, useGridIndex: false } });
                      }
                    } else if (mode === 'stackPoint') {
                      if (!draft!.stackPoint) {
                        set({ pointName: undefined, gridPoint: undefined, varPointName: undefined, varPointIndex: undefined, pointNameExpr: undefined, stackPoint: { stackId: '', index: 0 } });
                      }
                    } else {
                      set({ pointName: undefined, gridPoint: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: gridPointMode === mode ? '#fff' : '#374151' }}>
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
                  onPress={() => { set({ pointName: undefined }); setSubPage(null); }}
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
                  const active = draft!.pointName === p.name;
                  return (
                    <TouchableOpacity
                      key={p.name}
                      style={[ms.row, i < points.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => { set({ pointName: p.name }); setSubPage(null); }}
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
                  <ChevronRight size={16} color="#d1d5db" />
                </TouchableOpacity>

                {/* Row & Column vs Grid Index toggle */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 }}>
                  {[false, true].map(useIdx => (
                    <TouchableOpacity
                      key={String(useIdx)}
                      style={[{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
                        backgroundColor: draft!.gridPoint?.useGridIndex === useIdx ? '#eff6ff' : '#f9fafb',
                        borderWidth: 1, borderColor: draft!.gridPoint?.useGridIndex === useIdx ? '#2563eb' : '#e5e7eb' }]}
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
                      <Text style={{ fontSize: 12, fontWeight: '600', color: draft!.gridPoint?.useGridIndex === useIdx ? '#2563eb' : '#6b7280' }}>
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
                          <X size={18} color="#9ca3af" />
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
                  <ChevronRight size={16} color="#d1d5db" />
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
                          <X size={18} color="#9ca3af" />
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
                    />

                    {expr.trim().length > 0 && (
                      <Text style={[ms.hintText, { marginTop: 8, fontWeight: "700", color: asPoints ? "#0891b2" : "#7c3aed" }]}>
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
          <>
            {(["offsetX","offsetY","offsetZ"] as const).map(k => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={ms.fieldLabel}>{k.replace("offset","").toUpperCase()}  (mm)</Text>
                <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                  value={draft![k]} expressions={draft!.expressions}
                  onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
              </View>
            ))}
            {(rzOnly ? ["offsetRZ"] : ["offsetRX","offsetRY","offsetRZ"] as const).map(k => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={ms.fieldLabel}>{k.replace("offset","").toUpperCase()}  (°)</Text>
                <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                  value={draft![k as keyof typeof draft]} expressions={draft!.expressions}
                  onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
              </View>
            ))}
            <TouchableOpacity
              onPress={() => set({ offsetX:undefined,offsetY:undefined,offsetZ:undefined,offsetRX:undefined,offsetRY:undefined,offsetRZ:undefined })}
              style={{ marginTop: 4 }} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>Clear offset</Text>
            </TouchableOpacity>
          </>
        );

      case "toolOffset":
        return (
          <>
            {(["toolOffsetX","toolOffsetY","toolOffsetZ"] as const).map(k => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={ms.fieldLabel}>{k.replace("toolOffset","").toUpperCase()}  (mm)</Text>
                <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                  value={draft![k]} expressions={draft!.expressions}
                  onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
              </View>
            ))}
            {(rzOnly ? ["toolOffsetRZ"] : ["toolOffsetRX","toolOffsetRY","toolOffsetRZ"] as const).map(k => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={ms.fieldLabel}>{k.replace("toolOffset","").toUpperCase()}  (°)</Text>
                <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                  value={draft![k as keyof typeof draft]} expressions={draft!.expressions}
                  onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
              </View>
            ))}
            <TouchableOpacity
              onPress={() => set({ toolOffsetX:undefined,toolOffsetY:undefined,toolOffsetZ:undefined,toolOffsetRX:undefined,toolOffsetRY:undefined,toolOffsetRZ:undefined })}
              style={{ marginTop: 4 }} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>Clear offset</Text>
            </TouchableOpacity>
          </>
        );

      case "posOverride":
        return (
          <>
            <Text style={[ms.hintText, { marginBottom: 12 }]}>
              When set, locks that axis to the exact value regardless of the target point or offsets.
              Leave blank to use the calculated value.
            </Text>
            {(["overrideX","overrideY","overrideZ"] as const).map(k => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={ms.fieldLabel}>{k.replace("override","").toUpperCase()}  (mm)</Text>
                <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                  value={draft![k]} expressions={draft!.expressions}
                  onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr}
                  variables={variables} allowUndefined placeholder="not set" />
              </View>
            ))}
            {(rzOnly ? ["overrideRZ"] : ["overrideRX","overrideRY","overrideRZ"] as const).map(k => (
              <View key={k} style={{ marginBottom: 10 }}>
                <Text style={ms.fieldLabel}>{k.replace("override","").toUpperCase()}  (°)</Text>
                <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                  value={draft![k as keyof typeof draft]} expressions={draft!.expressions}
                  onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr}
                  variables={variables} allowUndefined placeholder="not set" />
              </View>
            ))}
            <TouchableOpacity
              onPress={() => set({ overrideX:undefined,overrideY:undefined,overrideZ:undefined,overrideRX:undefined,overrideRY:undefined,overrideRZ:undefined })}
              style={{ marginTop: 4 }} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>Clear all overrides</Text>
            </TouchableOpacity>
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
        const pointLabel = draft!.gridPoint
          ? `Grid → ${grids.find(g => g.id === draft!.gridPoint!.gridId)?.name ?? 'Unknown'}`
          : draft!.stackPoint
          ? `Stack → ${stacks.find(s => s.id === draft!.stackPoint!.stackId)?.name ?? 'Unknown'}`
          : draft!.varPointName
          ? `$${draft!.varPointName}[${draft!.varPointIndex ?? "0"}]`
          : draft!.pointNameExpr
          ? `→ ${draft!.pointNameExpr}`
          : (draft!.pointName ?? "Current Position");
        return (
          <>
            <TouchableOpacity style={ms.modRow} onPress={() => setSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            {modifierRow("Override Speed",    speedSet,    speedSummary,    "speed",       speedKeys)}
            {modifierRow("Position Offset",   hasOffset,   offsetSummary,   "posOffset",   offsetKeys)}
            {modifierRow("Position Override", hasOverride, overrideSummary, "posOverride", overrideKeys)}
            {modifierRow("Tool Offset",       hasToolOff,  toolOffSummary,  "toolOffset",  toolOffKeys)}

            {draft!.type === "MoveL" && (
              <View style={[ms.modCard, !draft!.blend && ms.modCardOff]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[ms.subRowLabel, !draft!.blend && ms.modLabelOff]}>Blend Into Next Move</Text>
                    <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                      Round this corner instead of stopping, carrying speed into the next MoveL.
                    </Text>
                  </View>
                  <Switch
                    value={!!draft!.blend}
                    onValueChange={v => set({ blend: v || undefined })}
                    trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
                  />
                </View>
                {draft!.blend && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 10 }]}>BLEND RADIUS OVERRIDE  (mm)</Text>
                    <ExpressionInput style={ms.input} fieldKey="blendRadius"
                      value={draft!.blendRadius} expressions={draft!.expressions}
                      onChangeValue={v => set({ blendRadius: v })} onChangeExpr={setExpr} variables={variables} />
                    <Text style={ms.hintText}>Leave blank to use the program's default blend radius (Set Blend Radius step).</Text>
                  </>
                )}
              </View>
            )}
          </>
        );
      }

      case "JumpL":
      case "JumpJ": {
        const pointLabel = draft!.gridPoint
          ? `Grid → ${grids.find(g => g.id === draft!.gridPoint!.gridId)?.name ?? 'Unknown'}`
          : draft!.stackPoint
          ? `Stack → ${stacks.find(s => s.id === draft!.stackPoint!.stackId)?.name ?? 'Unknown'}`
          : draft!.varPointName
          ? `$${draft!.varPointName}[${draft!.varPointIndex ?? "0"}]`
          : draft!.pointNameExpr
          ? `→ ${draft!.pointNameExpr}`
          : (draft!.pointName ?? "Current Position");
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
            <TouchableOpacity style={ms.modRow} onPress={() => setSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.modRow} onPress={() => setSubPage("jumpHeight")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Jump Height</Text>
                <Text style={ms.subRowValue}>{jumpHeightLabel}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            {modifierRow("Override Speed",    speedSet,    speedSummary,    "speed",       speedKeys)}
            {modifierRow("Position Offset",   hasOffset,   offsetSummary,   "posOffset",   offsetKeys)}
            {modifierRow("Position Override", hasOverride, overrideSummary, "posOverride", overrideKeys)}
            {modifierRow("Tool Offset",       hasToolOff,  toolOffSummary,  "toolOffset",  toolOffKeys)}

            {draft!.type === "JumpL" && (
              <View style={[ms.modCard, !draft!.blend && ms.modCardOff]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[ms.subRowLabel, !draft!.blend && ms.modLabelOff]}>Blend Apex Corners</Text>
                    <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                      Round the lift and lower corners into a smooth arch instead of stopping at the top.
                    </Text>
                  </View>
                  <Switch
                    value={!!draft!.blend}
                    onValueChange={v => set({ blend: v || undefined })}
                    trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
                  />
                </View>
                {draft!.blend && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 10 }]}>BLEND RADIUS OVERRIDE  (mm)</Text>
                    <ExpressionInput style={ms.input} fieldKey="blendRadius"
                      value={draft!.blendRadius} expressions={draft!.expressions}
                      onChangeValue={v => set({ blendRadius: v })} onChangeExpr={setExpr} variables={variables} />
                    <Text style={ms.hintText}>Leave blank to use the program's default blend radius (Set Blend Radius step).</Text>
                  </>
                )}
              </View>
            )}
          </>
        );
      }

      case "SetOutput": {
        const selectedCard = draft!.outputCard ?? "stb";
        const outputPins = selectedCard === "nano"
          ? (nanos ?? []).flatMap(n => (n.pins ?? []).filter(p => p.type === "Output"))
          : [];
        return (
          <>
            <Text style={ms.fieldLabel}>CARD</Text>
            <View style={ms.segRow}>
              {([
                { key: "stb",   label: "STB4100", Icon: CircuitBoard, color: "#16a34a", enabled: ioConfig?.enableStbCard   ?? true  },
                { key: "relay", label: "Relay",   Icon: Radio,        color: "#0891b2", enabled: ioConfig?.enableRelayCard  ?? false },
                { key: "nano",  label: "Nano",    Icon: Cpu,          color: "#4f46e5", enabled: ioConfig?.enableNanoCards  ?? true  },
              ] as const).filter(c => c.enabled).map(({ key, label, Icon, color }) => {
                const active = selectedCard === key;
                return (
                  <TouchableOpacity key={key} style={[ms.seg, active && ms.segActive, { flex: 1, flexDirection: "column", alignItems: "center", gap: 2, paddingVertical: 6 }]}
                    onPress={() => set({ outputCard: key, outputNumber: 1, outputNanoId: key === "nano" ? (nanos?.[0]?.id ?? undefined) : undefined })}
                    activeOpacity={0.8}>
                    <Icon size={14} color={active ? color : "#6b7280"} />
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

            {selectedCard === "nano" && (
              <>
                {(nanos ?? []).length > 1 && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 12 }]}>NANO DEVICE</Text>
                    <View style={ms.segRow}>
                      {(nanos ?? []).map(n => {
                        const active = (draft!.outputNanoId ?? nanos?.[0]?.id) === n.id;
                        return (
                          <TouchableOpacity key={n.id} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                            onPress={() => set({ outputNanoId: n.id, outputNumber: 1 })} activeOpacity={0.8}>
                            <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{n.name || n.id}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OUTPUT PIN</Text>
                {outputPins.length === 0 ? (
                  <Text style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>No output pins configured on this Nano</Text>
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

            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE</Text>
            <View style={ms.switchRow}>
              <Text style={ms.switchLabel}>{draft!.outputValue ? "ON" : "OFF"}</Text>
              <Switch value={draft!.outputValue ?? false} onValueChange={v => set({ outputValue: v })}
                trackColor={{ false: "#e5e7eb", true: "#2563eb" }} />
            </View>

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
                trackColor={{ false: "#e5e7eb", true: "#f59e0b" }}
              />
            </View>
            {(draft!.pulseMs ?? 0) > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>PULSE DURATION  (ms)</Text>
                <View style={[ms.input, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: "#111827" }}
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
                  <Text style={{ fontSize: 12, color: "#9ca3af", paddingLeft: 6 }}>ms</Text>
                </View>
                <View style={[ms.switchRow, { marginTop: 10 }]}>
                  <Text style={ms.switchLabel}>Block until pulse completes</Text>
                  <Switch
                    value={draft!.pulseBlocking ?? false}
                    onValueChange={v => set({ pulseBlocking: v || undefined })}
                    trackColor={{ false: "#e5e7eb", true: "#7c3aed" }}
                  />
                </View>
                <Text style={ms.hintText}>
                  Output goes {draft!.outputValue ? "ON" : "OFF"} immediately, then flips {draft!.outputValue ? "OFF" : "ON"} after the pulse.{" "}
                  {draft!.pulseBlocking ? "Program waits for the pulse to complete before continuing." : "Program continues without waiting."}
                </Text>
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
                  onChangeExpr={setExpr} variables={variables} autoFocus />
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
                {scalarVars.length > 0 && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 14 }]}>TIMEOUT FLAG VARIABLE  (optional)</Text>
                    <Text style={ms.hintText}>Set to 1 if timed out, 0 if condition was met. Leave blank to ignore.</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                      <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600", marginRight: 6 }}>$</Text>
                      <TouchableOpacity
                        style={[ms.input, { flex: 1, justifyContent: "center" }]}
                        onPress={() => setWaitTimeoutVarPicker(true)} activeOpacity={0.7}>
                        <Text style={{ color: draft!.waitTimeoutVariableName ? "#1e293b" : "#9ca3af", fontSize: 14 }}>
                          {draft!.waitTimeoutVariableName ?? "none"}
                        </Text>
                      </TouchableOpacity>
                      {draft!.waitTimeoutVariableName && (
                        <TouchableOpacity onPress={() => set({ waitTimeoutVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                          <X size={14} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <VarPickerModal
                      visible={waitTimeoutVarPicker}
                      onClose={() => setWaitTimeoutVarPicker(false)}
                      variables={scalarVars}
                      selected={draft!.waitTimeoutVariableName}
                      onSelect={v => { set({ waitTimeoutVariableName: v?.name }); setWaitTimeoutVarPicker(false); }}
                      title="Timeout Flag Variable"
                      showNone
                    />
                  </>
                )}
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
                  onChangeExpr={setExpr} variables={variables} autoFocus />
                {scalarVarsLoop.length > 0 && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 14 }]}>INDEX VARIABLE  (optional)</Text>
                    <Text style={ms.hintText}>Set to the current iteration number (0-based).</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                      <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600", marginRight: 6 }}>$</Text>
                      <TouchableOpacity
                        style={[ms.input, { flex: 1, justifyContent: "center" }]}
                        onPress={() => setLoopIndexVarPicker(true)} activeOpacity={0.7}>
                        <Text style={{ color: draft!.forEachIndexVariableName ? "#1e293b" : "#9ca3af", fontSize: 14 }}>
                          {draft!.forEachIndexVariableName ?? "none"}
                        </Text>
                      </TouchableOpacity>
                      {draft!.forEachIndexVariableName && (
                        <TouchableOpacity onPress={() => set({ forEachIndexVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                          <X size={14} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <VarPickerModal
                      visible={loopIndexVarPicker}
                      onClose={() => setLoopIndexVarPicker(false)}
                      variables={scalarVarsLoop}
                      selected={draft!.forEachIndexVariableName}
                      onSelect={v => { set({ forEachIndexVariableName: v?.name }); setLoopIndexVarPicker(false); }}
                      title="Index Variable"
                      showNone
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ITERATE OVER</Text>
                {loopSourceVars.length === 0
                  ? <Text style={ms.emptyHint}>No list variables defined yet.</Text>
                  : (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600", marginRight: 6 }}>$</Text>
                      <TouchableOpacity
                        style={[ms.input, { flex: 1, justifyContent: "center" }]}
                        onPress={() => setForEachSourcePicker(true)} activeOpacity={0.7}>
                        <Text style={{ color: draft!.forEachVariableName ? "#1e293b" : "#9ca3af", fontSize: 14 }}>
                          {draft!.forEachVariableName ?? "select a list variable"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                }
                <VarPickerModal
                  visible={forEachSourcePicker}
                  onClose={() => setForEachSourcePicker(false)}
                  variables={loopSourceVars}
                  selected={draft!.forEachVariableName}
                  onSelect={v => { set({ forEachVariableName: v?.name }); setForEachSourcePicker(false); }}
                  title="Source Variable"
                />

                {scalarVarsLoop.length > 0 && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 14 }]}>VALUE VARIABLE  (optional)</Text>
                    {/* Mirrors the executor: only an element that is itself a value can be
                        handed over, so on a point or record list this receives the index. */}
                    <Text style={ms.hintText}>
                      {forEachSourceIsScalar
                        ? "Receives the current element each iteration."
                        : "Receives the current index each iteration — a point or object element is not a number, so read it with $name[$i].field."}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                      <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600", marginRight: 6 }}>$</Text>
                      <TouchableOpacity
                        style={[ms.input, { flex: 1, justifyContent: "center" }]}
                        onPress={() => setForEachValuePicker(true)} activeOpacity={0.7}>
                        <Text style={{ color: draft!.forEachValueVariableName ? "#1e293b" : "#9ca3af", fontSize: 14 }}>
                          {draft!.forEachValueVariableName ?? "none"}
                        </Text>
                      </TouchableOpacity>
                      {draft!.forEachValueVariableName && (
                        <TouchableOpacity onPress={() => set({ forEachValueVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                          <X size={14} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <VarPickerModal
                      visible={forEachValuePicker}
                      onClose={() => setForEachValuePicker(false)}
                      variables={scalarVarsLoop}
                      selected={draft!.forEachValueVariableName}
                      onSelect={v => { set({ forEachValueVariableName: v?.name }); setForEachValuePicker(false); }}
                      title="Value Variable"
                      showNone
                    />

                    <Text style={[ms.fieldLabel, { marginTop: 14 }]}>INDEX VARIABLE  (optional)</Text>
                    <Text style={ms.hintText}>Receives the current iteration index (0-based).</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                      <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600", marginRight: 6 }}>$</Text>
                      <TouchableOpacity
                        style={[ms.input, { flex: 1, justifyContent: "center" }]}
                        onPress={() => setLoopIndexVarPicker(true)} activeOpacity={0.7}>
                        <Text style={{ color: draft!.forEachIndexVariableName ? "#1e293b" : "#9ca3af", fontSize: 14 }}>
                          {draft!.forEachIndexVariableName ?? "none"}
                        </Text>
                      </TouchableOpacity>
                      {draft!.forEachIndexVariableName && (
                        <TouchableOpacity onPress={() => set({ forEachIndexVariableName: undefined })} hitSlop={8} style={{ marginLeft: 8 }} activeOpacity={0.7}>
                          <X size={14} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <VarPickerModal
                      visible={loopIndexVarPicker}
                      onClose={() => setLoopIndexVarPicker(false)}
                      variables={scalarVarsLoop}
                      selected={draft!.forEachIndexVariableName}
                      onSelect={v => { set({ forEachIndexVariableName: v?.name }); setLoopIndexVarPicker(false); }}
                      title="Index Variable"
                      showNone
                    />
                  </>
                )}
              </>
            )}
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
                  key === 'Warning' ? '#d97706' :
                  key === 'Error'   ? '#dc2626' : '#6b7280';
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
          </>
        );

      case "RunVision": {
        const selectedVP         = visionPrograms.find(vp => vp.id === draft!.visionProgramId);
        const inspections        = selectedVP?.inspections ?? [];
        const colorInspections   = selectedVP?.colorInspections ?? [];
        const polygonInspections = selectedVP?.polygonInspections ?? [];
        const arucoInspections   = selectedVP?.arucoInspections ?? [];

        function getOutput(inspId: string): VisionStepOutput | undefined {
          return (draft!.visionOutputs ?? []).find(o => o.inspectionId === inspId);
        }

        function getColorOutput(inspId: string): ColorVisionStepOutput | undefined {
          return (draft!.colorOutputs ?? []).find(o => o.inspectionId === inspId);
        }

        function getPolygonOutput(inspId: string): PolygonVisionStepOutput | undefined {
          return (draft!.polygonOutputs ?? []).find(o => o.inspectionId === inspId);
        }

        function getArucoOutput(inspId: string): ArucoVisionStepOutput | undefined {
          return (draft!.arucoOutputs ?? []).find(o => o.inspectionId === inspId);
        }

        return (
          <>
            <Text style={ms.fieldLabel}>VISION PROGRAM</Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4,
                borderWidth: 1, borderColor: selectedVP ? '#0891b2' : '#e5e7eb',
                borderRadius: 10, backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingVertical: 11 }}
              onPress={() => setVisionProgPickerOpen(true)}
              activeOpacity={0.75}
            >
              {selectedVP ? (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0891b2' }}>{selectedVP.name}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                    {selectedVP.cameraId || 'No camera'} · {selectedVP.zones.length} zone{selectedVP.zones.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              ) : (
                <Text style={{ flex: 1, fontSize: 14, color: '#9ca3af' }}>Tap to select a vision program…</Text>
              )}
              <ChevronDown size={14} color={selectedVP ? '#0891b2' : '#9ca3af'} />
            </TouchableOpacity>

            {selectedVP && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 16 }]}>OVERRIDE ZONE</Text>
                <Text style={ms.hintText}>
                  None uses each inspection's own configured zone. Select a zone (or a variable) to override them all at runtime.
                </Text>
                {(() => {
                  const fixedZone  = selectedVP.zones.find(z => z.id === draft!.visionZoneId);
                  const hasVar     = !!draft!.visionZoneVar;
                  const active     = !!(fixedZone || hasVar);
                  const label      = hasVar ? `$${draft!.visionZoneVar}` : fixedZone ? fixedZone.name : 'None — use program defaults';
                  return (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4,
                        borderWidth: 1, borderColor: active ? '#0891b2' : '#e5e7eb',
                        borderRadius: 10, backgroundColor: '#f9fafb', paddingHorizontal: 12, paddingVertical: 11 }}
                      onPress={() => setZonePickerOpen(true)}
                      activeOpacity={0.75}
                    >
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '400', color: active ? '#0891b2' : '#9ca3af' }}>
                        {label}
                      </Text>
                      <ChevronDown size={14} color={active ? '#0891b2' : '#9ca3af'} />
                    </TouchableOpacity>
                  );
                })()}
              </>
            )}

            {inspections.length > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 16 }]}>OUTPUTS</Text>
                <Text style={ms.hintText}>
                  Map inspection results to program variables. Variables are written when the step completes.
                </Text>
                {inspections.filter(insp => insp.enabled).map(insp => {
                  const out = getOutput(insp.id);
                  return (
                    <View key={insp.id} style={{ marginTop: 10, backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#e5e7eb" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>{insp.name}</Text>
                      <VarSelectorButton
                        label="DETECTED (any blobs found)"
                        value={out?.detectedVar}
                        accent="#16a34a"
                        placeholder="None — tap to assign"
                        marginTop={false}
                        onPress={() => setVisionPicker({ inspId: insp.id, field: 'detectedVar' })}
                      />
                      <VarSelectorButton
                        label="COUNT"
                        value={out?.countVar}
                        accent="#2563eb"
                        placeholder="None — tap to assign"
                        onPress={() => setVisionPicker({ inspId: insp.id, field: 'countVar' })}
                      />
                      <VarSelectorButton
                        label="POINTS"
                        value={out?.pointsVar}
                        accent="#0891b2"
                        placeholder="None — tap to assign"
                        onPress={() => setVisionPicker({ inspId: insp.id, field: 'pointsVar' })}
                      />
                    </View>
                  );
                })}
                {inspections.every(i => !i.enabled) && (
                  <Text style={ms.emptyHint}>No enabled inspections in this program. Enable inspections in the Vision editor.</Text>
                )}
              </>
            )}

            {colorInspections.filter(i => i.enabled).length > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 16 }]}>COLOR OUTPUTS</Text>
                {colorInspections.filter(i => i.enabled).map(insp => {
                  const out  = getColorOutput(insp.id);
                  // A gridded zone measures each cell separately, so it has two more
                  // outputs worth assigning. Hidden otherwise — they would always be empty.
                  const grid = (selectedVP?.zones ?? []).find(z => z.id === insp.zoneId)?.grid;
                  const gridded = !!grid && grid.rows * grid.cols > 1;
                  return (
                    <View key={insp.id} style={{ marginTop: 10, backgroundColor: "#fdf4ff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#e9d5ff" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>
                        {insp.name}
                        {gridded && (
                          <Text style={{ fontWeight: "400", color: "#9ca3af" }}>  ({grid!.rows}×{grid!.cols} grid)</Text>
                        )}
                      </Text>
                      <VarSelectorButton
                        label="COVERAGE %"
                        value={out?.coverageVar}
                        accent="#7c3aed"
                        placeholder="None — tap to assign"
                        marginTop={false}
                        onPress={() => setColorPicker({ inspId: insp.id, field: 'coverageVar' })}
                      />
                      <VarSelectorButton
                        label={gridded ? "PASSED (ALL CELLS)" : "PASSED"}
                        value={out?.passedVar}
                        accent="#16a34a"
                        placeholder="None — tap to assign"
                        onPress={() => setColorPicker({ inspId: insp.id, field: 'passedVar' })}
                      />
                      {gridded && (
                        <>
                          <VarSelectorButton
                            label="CELLS (OBJECT LIST)"
                            value={out?.cellsVar}
                            accent="#0891b2"
                            placeholder="None — tap to assign"
                            onPress={() => setColorPicker({ inspId: insp.id, field: 'cellsVar' })}
                          />
                          <VarSelectorButton
                            label="CELLS PASSED"
                            value={out?.cellsPassedVar}
                            accent="#16a34a"
                            placeholder="None — tap to assign"
                            onPress={() => setColorPicker({ inspId: insp.id, field: 'cellsPassedVar' })}
                          />
                          <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                            Read a cell with $name[i].coverage, .passed, .row, .col or .index.
                          </Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </>
            )}

            {polygonInspections.filter(i => i.enabled).length > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 16 }]}>POLYGON OUTPUTS</Text>
                {polygonInspections.filter(i => i.enabled).map(insp => {
                  const out = getPolygonOutput(insp.id);
                  return (
                    <View key={insp.id} style={{ marginTop: 10, backgroundColor: "#fffbeb", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#fde68a" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>
                        {insp.name}  <Text style={{ fontWeight: "400", color: "#9ca3af" }}>({insp.sides}-sided)</Text>
                      </Text>
                      <VarSelectorButton
                        label="FOUND"
                        value={out?.foundVar}
                        accent="#16a34a"
                        placeholder="None — tap to assign"
                        marginTop={false}
                        onPress={() => setPolygonPicker({ inspId: insp.id, field: 'foundVar' })}
                      />
                      <VarSelectorButton
                        label="COUNT"
                        value={out?.countVar}
                        accent="#2563eb"
                        placeholder="None — tap to assign"
                        onPress={() => setPolygonPicker({ inspId: insp.id, field: 'countVar' })}
                      />
                      <VarSelectorButton
                        label="ANGLE (deg)"
                        value={out?.angleVar}
                        accent="#d97706"
                        placeholder="None — tap to assign"
                        onPress={() => setPolygonPicker({ inspId: insp.id, field: 'angleVar' })}
                      />
                      <VarSelectorButton
                        label="CENTER X"
                        value={out?.centerXVar}
                        accent="#0891b2"
                        placeholder="None — tap to assign"
                        onPress={() => setPolygonPicker({ inspId: insp.id, field: 'centerXVar' })}
                      />
                      <VarSelectorButton
                        label="CENTER Y"
                        value={out?.centerYVar}
                        accent="#0891b2"
                        placeholder="None — tap to assign"
                        onPress={() => setPolygonPicker({ inspId: insp.id, field: 'centerYVar' })}
                      />
                    </View>
                  );
                })}
              </>
            )}

            {arucoInspections.filter(i => i.enabled).length > 0 && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 16 }]}>ARUCO OUTPUTS</Text>
                {arucoInspections.filter(i => i.enabled).map(insp => {
                  const out = getArucoOutput(insp.id);
                  return (
                    <View key={insp.id} style={{ marginTop: 10, backgroundColor: "#f0fdf4", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#bbf7d0" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>{insp.name}</Text>
                      <VarSelectorButton
                        label="FOUND"
                        value={out?.foundVar}
                        accent="#16a34a"
                        placeholder="None — tap to assign"
                        marginTop={false}
                        onPress={() => setArucoPicker({ inspId: insp.id, field: 'foundVar' })}
                      />
                      <VarSelectorButton
                        label="COUNT"
                        value={out?.countVar}
                        accent="#2563eb"
                        placeholder="None — tap to assign"
                        onPress={() => setArucoPicker({ inspId: insp.id, field: 'countVar' })}
                      />
                      <VarSelectorButton
                        label="FIRST MARKER ID"
                        value={out?.firstIdVar}
                        accent="#0891b2"
                        placeholder="None — tap to assign"
                        onPress={() => setArucoPicker({ inspId: insp.id, field: 'firstIdVar' })}
                      />
                      <VarSelectorButton
                        label="FIRST CENTER X"
                        value={out?.firstCenterXVar}
                        accent="#0891b2"
                        placeholder="None — tap to assign"
                        onPress={() => setArucoPicker({ inspId: insp.id, field: 'firstCenterXVar' })}
                      />
                      <VarSelectorButton
                        label="FIRST CENTER Y"
                        value={out?.firstCenterYVar}
                        accent="#0891b2"
                        placeholder="None — tap to assign"
                        onPress={() => setArucoPicker({ inspId: insp.id, field: 'firstCenterYVar' })}
                      />
                    </View>
                  );
                })}
              </>
            )}
          </>
        );
      }

      case "SetSpeedL":
      case "SetSpeedJ": {
        const isLinear = draft!.type === "SetSpeedL";
        return (
          <>
            <Text style={ms.hintText}>
              {isLinear
                ? "Sets the linear (MoveL) speed for all subsequent moves until changed again."
                : "Sets the joint (MoveJ) speed for all subsequent moves until changed again."}
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>SPEED  (mm/s)</Text>
            <ExpressionInput style={ms.input} fieldKey="speed"
              value={draft!.speed} expressions={draft!.expressions}
              onChangeValue={v => set({ speed: v })} onChangeExpr={setExpr} variables={variables} autoFocus />
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  (mm/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="accel"
                  value={draft!.accel} expressions={draft!.expressions}
                  onChangeValue={v => set({ accel: v })} onChangeExpr={setExpr} variables={variables} />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>DECEL  (mm/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="decel"
                  value={draft!.decel} expressions={draft!.expressions}
                  onChangeValue={v => set({ decel: v })} onChangeExpr={setExpr} variables={variables} />
              </View>
            </View>
          </>
        );
      }

      case "SetBlendRadius":
        return (
          <>
            <Text style={ms.hintText}>
              Sets the default corner blend radius for subsequent MoveL steps that have blending turned on.
              An individual move can override this with its own radius.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>BLEND RADIUS  (mm)</Text>
            <ExpressionInput style={ms.input} fieldKey="blendRadius"
              value={draft!.blendRadius} expressions={draft!.expressions}
              onChangeValue={v => set({ blendRadius: v })} onChangeExpr={setExpr} variables={variables} autoFocus />
          </>
        );

      case "SetVariable":
        return <SetVariableFields draft={draft!} variables={variables} contextVariables={contextVariables} set={set} onCreateVariable={onCreateVariable} />;

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
              style={[ms.input, isDuplicate && { borderColor: "#ef4444", borderWidth: 1 }]}
              value={draft!.labelName ?? ""}
              onChangeText={v => set({ labelName: v || undefined })}
              placeholder="e.g. loop_start, retry…"
              placeholderTextColor="#9ca3af"
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
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
              Select which tool TCP offset to activate for subsequent move steps.
            </Text>
            {[{ name: 'none', label: 'None (clear tool)' }, ...allTools.map(t => ({ name: t.name, label: t.name }))].map((t, i, arr) => {
              const active = (draft!.toolName ?? 'none') === t.name;
              return (
                <TouchableOpacity
                  key={t.name}
                  style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ toolName: t.name === 'none' ? undefined : t.name })}
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
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
              Select which local coordinate frame to activate for subsequent move steps.
            </Text>
            {[{ name: 'none', label: 'None (clear local)' }, ...allLocals.map(l => ({ name: l.name, label: l.name }))].map((l, i, arr) => {
              const active = (draft!.localName ?? 'none') === l.name;
              return (
                <TouchableOpacity
                  key={l.name}
                  style={[ms.row, i < arr.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ localName: l.name === 'none' ? undefined : l.name })}
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
                  Advance in steps, retracting to start between each peck to clear chips.
                </Text>
              </View>
              <Switch
                value={peckOn}
                onValueChange={v => set({ threadPeck: v || undefined })}
                trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
              />
            </View>
            {peckOn && (
              <>
                <Text style={[ms.fieldLabel, { marginTop: 12 }]}>PECK DEPTH  (mm per peck)</Text>
                <ExpressionInput style={ms.input} fieldKey="threadPeckDepth"
                  value={draft!.threadPeckDepth} expressions={draft!.expressions}
                  onChangeValue={v => set({ threadPeckDepth: v })} onChangeExpr={setExpr}
                  placeholder="e.g. 3" variables={variables} />
                <Text style={ms.hintText}>
                  How far to advance per peck. The last peck covers any remaining distance.
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
                trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
              />
            </View>
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
                trackColor={{ false: "#e5e7eb", true: "#7c3aed" }}
              />
            </View>
            <Text style={ms.hintText}>
              When on, the program waits for the aux move to finish before the next step.
              When off, the robot and aux axis can move simultaneously.
            </Text>
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
                      <Icon size={15} color={active ? "#7c3aed" : "#6b7280"} />
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
                trackColor={{ false: "#e5e7eb", true: "#dc2626" }}
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

      case "IfCondition":
        return (
          <Text style={ms.hintText}>
            Edit conditions using the pencil icon on each branch. Add or remove Else If / Else branches from the block controls at the bottom.
          </Text>
        );

      case "StartBackground":
      case "StopBackground":
      case "WaitForBackground": {
        const bgPrograms = allPrograms.filter(p => p.isBackground && !p.isRoutine);
        const label = draft!.type === "StartBackground" ? "BACKGROUND PROGRAM TO START"
          : draft!.type === "StopBackground" ? "BACKGROUND PROGRAM TO STOP"
          : "BACKGROUND PROGRAM TO WAIT FOR";
        const hint = draft!.type === "StartBackground"
          ? "Starts the selected background program in parallel. No-op if it is already running."
          : draft!.type === "StopBackground"
          ? "Stops the selected background program. No-op if it is not running."
          : "Blocks this program until the selected background program finishes. Continues immediately if it is not running.";
        return (
          <>
            <Text style={ms.hintText}>{hint}</Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>{label}</Text>
            {bgPrograms.length === 0 ? (
              <Text style={[ms.emptyHint, { marginTop: 4 }]}>
                No background programs found. Mark a program as "Background" in its settings.
              </Text>
            ) : (
              bgPrograms.map((p, i) => {
                const active = p.id && draft!.backgroundProgramId
                  ? draft!.backgroundProgramId === p.id
                  : draft!.backgroundProgramName === p.name;
                return (
                  <TouchableOpacity
                    key={p.id ?? p.name}
                    style={[ms.row, i < bgPrograms.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => set({ backgroundProgramName: p.name, backgroundProgramId: p.id })}
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
              })
            )}
          </>
        );
      }

      case "StopwatchControl": {
        const swVars = (variables ?? []).filter(v => v.isStopwatch);
        const swActions = ["Start", "Stop", "Reset"] as const;
        return (
          <>
            <Text style={ms.hintText}>Control a stopwatch variable. The value holds elapsed milliseconds and can be read in expressions.</Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>ACTION</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              {swActions.map(a => {
                const active = draft!.stopwatchAction === a;
                const color  = a === "Start" ? "#16a34a" : a === "Stop" ? "#dc2626" : "#d97706";
                const bg     = a === "Start" ? "#f0fdf4" : a === "Stop" ? "#fef2f2" : "#fffbeb";
                const border = a === "Start" ? "#bbf7d0" : a === "Stop" ? "#fecaca" : "#fde68a";
                return (
                  <TouchableOpacity
                    key={a}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center", borderWidth: 1.5,
                      borderColor: active ? color : "#e5e7eb",
                      backgroundColor: active ? bg : "#f9fafb" }]}
                    onPress={() => set({ stopwatchAction: a })}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: active ? color : "#6b7280" }}>{a}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 14 }]}>STOPWATCH VARIABLE</Text>
            {swVars.length === 0 ? (
              <Text style={[ms.emptyHint, { marginTop: 4 }]}>
                No stopwatch variables defined. Add a variable of type Stopwatch in the Variables section.
              </Text>
            ) : (
              swVars.map((v, i) => {
                const active = draft!.stopwatchVariableName === v.name;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[ms.row, i < swVars.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => set({ stopwatchVariableName: v.name })}
                    activeOpacity={0.7}
                  >
                    <View style={[ms.radioRing, active && ms.radioRingActive]}>
                      {active && <View style={ms.radioDot} />}
                    </View>
                    <View style={ms.rowText}>
                      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                      {v.description ? <Text style={ms.rowDesc}>{v.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        );
      }

      case "SaveImage":
        return (
          <SaveImageFields
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
              placeholderTextColor="#9ca3af"
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
              placeholderTextColor="#9ca3af"
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
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                      borderWidth: 1.5, borderColor: active ? accent : "#e5e7eb",
                      backgroundColor: active ? "#f0fdfa" : "#f9fafb" }]}
                    onPress={() => set({ jsonWaitForResponse: opt.value })}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700",
                      color: active ? accent : "#6b7280" }}>{opt.label}</Text>
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
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#d1d5db",
              borderLeftWidth: 3, borderLeftColor: accent,
              backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                fontSize: 15, color: "#64748b" }}>{"{"}</Text>
              {outbound.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                  color: "#9ca3af", fontStyle: "italic" }}>
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
                    placeholderTextColor="#9ca3af"
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
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: "#7c3aed" }}
                        numberOfLines={1}>${row.listVar ?? row.imageVar}</Text>
                      {row.listVar && (
                        <Text style={{ fontSize: 11, color: "#94a3b8" }}>[ ]</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TextInput
                        style={{ flex: 2, fontSize: 14, color: "#7c3aed", paddingHorizontal: 1,
                          paddingVertical: 2, minWidth: 30 }}
                        value={row.expr}
                        onChangeText={v => {
                          const next = [...outbound];
                          next[i] = { ...row, expr: v };
                          setOutbound(next);
                        }}
                        placeholder="$var or expr"
                        placeholderTextColor="#9ca3af"
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
                    <Minus size={13} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5,
                  paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setOutbound([...outbound, { key: "", expr: "" }])}
                activeOpacity={0.7}
              >
                <Plus size={12} color="#9ca3af" />
                <Text style={{ fontSize: 12, color: "#9ca3af" }}>add field</Text>
              </TouchableOpacity>
              <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                fontSize: 15, color: "#64748b" }}>{"}"}</Text>
            </View>

            {/* ── Inbound mapping ── */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20, marginBottom: 6 }}>
              <Globe size={13} color="#2563eb" style={{ marginRight: 5 }} />
              <Text style={[ms.fieldLabel, { marginTop: 0, color: "#2563eb" }]}>INBOUND VARIABLES</Text>
            </View>
            <Text style={[ms.hintText, { marginBottom: 8 }]}>
              Map response JSON keys to program variables. Leave empty to ignore the response.
              A JSON array mapped onto a list variable replaces the list; read its length with <Text style={{ fontFamily: "monospace" }}>$name.length</Text>.
            </Text>
            {/* JSON block */}
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#d1d5db",
              borderLeftWidth: 3, borderLeftColor: "#2563eb",
              backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                fontSize: 15, color: "#64748b" }}>{"{"}</Text>
              {inbound.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                  color: "#9ca3af", fontStyle: "italic" }}>
                  // no mappings yet
                </Text>
              )}
              {inbound.map((row, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center",
                  paddingLeft: 26, paddingRight: 6, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 14, color: "#2563eb" }}>"</Text>
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
                    placeholderTextColor="#9ca3af"
                    returnKeyType="done"
                    autoCapitalize="none"
                  />
                  <Text style={{ fontSize: 14, color: "#2563eb" }}>"</Text>
                  <ArrowRight size={16} color="#2563eb" style={{ marginHorizontal: 6 }} />
                  <TouchableOpacity
                    style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 5,
                      minWidth: 30 }}
                    onPress={() => setJsonInboundPicker(i)}
                    activeOpacity={0.75}
                  >
                    <Search size={12} color={row.variableName ? "#2563eb" : "#94a3b8"} />
                    <Text style={{ flex: 1, fontSize: 14,
                      fontWeight: row.variableName ? "700" : "400",
                      color: row.variableName ? "#7c3aed" : "#9ca3af" }} numberOfLines={1}>
                      {row.variableName ? `$${row.variableName}` : "search variables…"}
                    </Text>
                  </TouchableOpacity>
                  {i < inbound.length - 1 && (
                    <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 2 }}>,</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setInbound(inbound.filter((_, j) => j !== i))}
                    hitSlop={8} style={{ padding: 5 }}>
                    <Minus size={13} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5,
                  paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setInbound([...inbound, { key: "", variableName: "" }])}
                activeOpacity={0.7}
              >
                <Plus size={12} color="#9ca3af" />
                <Text style={{ fontSize: 12, color: "#9ca3af" }}>add mapping</Text>
              </TouchableOpacity>
              <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                fontSize: 15, color: "#64748b" }}>{"}"}</Text>
            </View>

            {/* Variable picker for inbound rows — numeric, list and image */}
            <VarPickerModal
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
            />
          </>
        );
      }

      case "CaptureImage": {
        const accentImg = "#0891b2";
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
              cameraDevices.map((cam, i) => {
                const active = (draft!.captureImageCameraId ?? "") === cam.id;
                return (
                  <TouchableOpacity
                    key={cam.id}
                    style={[ms.row, i < cameraDevices.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => set({ captureImageCameraId: cam.id })}
                    activeOpacity={0.7}
                  >
                    <Camera size={14} color={active ? accentImg : "#6b7280"} />
                    <Text style={[ms.rowLabel, { flex: 1 }, active && { color: accentImg }]}>{cam.name}</Text>
                    {active && <Check size={14} color={accentImg} />}
                  </TouchableOpacity>
                );
              })
            )}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 0 }}>
              <Text style={ms.fieldLabel}>IMAGE VARIABLE</Text>
              <TouchableOpacity
                onPress={() => setCaptureVarCreateOpen(true)}
                hitSlop={8} activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", gap: 4,
                  backgroundColor: "#e0f2fe", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4,
                  borderWidth: 1, borderColor: "#7dd3fc" }}
              >
                <Plus size={12} color={accentImg} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: accentImg }}>New</Text>
              </TouchableOpacity>
            </View>
            {imageVarsForCapture.length === 0 ? (
              <Text style={ms.emptyHint}>
                No image variables yet — tap <Text style={{ fontWeight: "700" }}>New</Text> to create one.
              </Text>
            ) : (
              imageVarsForCapture.map((v, i) => {
                const active = draft!.captureImageVariableName === v.name;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[ms.row, i < imageVarsForCapture.length - 1 && ms.rowBorder, active && ms.rowActive]}
                    onPress={() => set({ captureImageVariableName: v.name })}
                    activeOpacity={0.7}
                  >
                    <View style={[ms.radioRing, active && ms.radioRingActive]}>
                      {active && <View style={ms.radioDot} />}
                    </View>
                    <View style={ms.rowText}>
                      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                      {v.description ? <Text style={ms.rowDesc}>{v.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
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
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              returnKeyType="done"
            />
            {draft!.httpReceiveName ? (
              <View style={{ backgroundColor: "#f0fdf4", borderRadius: 8, borderWidth: 1,
                borderColor: "#bbf7d0", padding: 10, marginTop: 8 }}>
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
              placeholderTextColor="#9ca3af"
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
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#d1d5db",
              borderLeftWidth: 3, borderLeftColor: accentRcv,
              backgroundColor: "#f8fafc", marginTop: 4, marginBottom: 4 }}>
              <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                fontSize: 15, color: "#64748b" }}>{"{"}</Text>
              {rcvInbound.length === 0 && (
                <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                  color: "#9ca3af", fontStyle: "italic" }}>
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
                    placeholderTextColor="#9ca3af"
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
                      color: row.variableName ? "#7c3aed" : "#9ca3af" }} numberOfLines={1}>
                      {row.variableName ? `$${row.variableName}` : "search variables…"}
                    </Text>
                  </TouchableOpacity>
                  {i < rcvInbound.length - 1 && (
                    <Text style={{ fontSize: 14, color: "#94a3b8", marginRight: 2 }}>,</Text>
                  )}
                  <TouchableOpacity
                    onPress={() => setRcvInbound(rcvInbound.filter((_, j) => j !== i))}
                    hitSlop={8} style={{ padding: 5 }}>
                    <Minus size={13} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5,
                  paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                onPress={() => setRcvInbound([...rcvInbound, { key: "", variableName: "" }])}
                activeOpacity={0.7}
              >
                <Plus size={12} color="#9ca3af" />
                <Text style={{ fontSize: 12, color: "#9ca3af" }}>add mapping</Text>
              </TouchableOpacity>
              <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                fontSize: 15, color: "#64748b" }}>{"}"}</Text>
            </View>

            <VarPickerModal
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
            />
          </>
        );
      }

      case "Unknown":
        return (
          <View style={{ padding: 16, backgroundColor: "#fef9c3", borderRadius: 8, marginTop: 8 }}>
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
        return null;
    }
  }

  const subPageTitle: Record<NonNullable<SubPage>, string> = {
    point: "Select Point", speed: "Override Speed",
    posOffset: "Position Offset", toolOffset: "Tool Offset",
    posOverride: "Position Override", jumpHeight: "Jump Height",
  };

  const isMove     = draft.type === "MoveL"    || draft.type === "MoveJ"
                  || draft.type === "JumpL"    || draft.type === "JumpJ";
  const isSetSpeed = draft.type === "SetSpeedL" || draft.type === "SetSpeedJ" || draft.type === "SetVariable"
                  || draft.type === "Label"      || draft.type === "GoToLabel";

  // Color inspection picker. cellsVar holds a list of records rather than a number, so it
  // offers object variables and the other fields exclude them.
  const colorPickerVars = !colorPicker
    ? []
    : colorPicker.field === 'cellsVar'
      ? (variables ?? []).filter(v => isRecordListVariable(v))
      : (variables ?? []).filter(v => !isListVariable(v));
  const colorPickerSelected = colorPicker
    ? (draft?.colorOutputs ?? []).find(o => o.inspectionId === colorPicker.inspId)?.[colorPicker.field]
    : undefined;
  const colorPickerTitle = colorPicker
    ? ({ coverageVar: 'Coverage Variable', passedVar: 'Passed Variable',
         cellsVar: 'Cells Variable', cellsPassedVar: 'Cells Passed Variable' }[colorPicker.field])
    : '';

  // Polygon inspection picker
  const polygonPickerVars     = polygonPicker ? (variables ?? []).filter(v => !isListVariable(v)) : [];
  const polygonPickerSelected = polygonPicker
    ? (draft?.polygonOutputs ?? []).find(o => o.inspectionId === polygonPicker.inspId)?.[polygonPicker.field]
    : undefined;
  const polygonPickerTitle = polygonPicker
    ? ({ foundVar: 'Found Variable', countVar: 'Count Variable', angleVar: 'Angle Variable', centerXVar: 'Center X Variable', centerYVar: 'Center Y Variable' }[polygonPicker.field] ?? 'Variable')
    : '';

  // ArUco inspection picker
  const arucoPickerVars     = arucoPicker ? (variables ?? []).filter(v => !isListVariable(v)) : [];
  const arucoPickerSelected = arucoPicker
    ? (draft?.arucoOutputs ?? []).find(o => o.inspectionId === arucoPicker.inspId)?.[arucoPicker.field]
    : undefined;
  const arucoPickerTitle = arucoPicker
    ? ({ foundVar: 'Found Variable', countVar: 'Count Variable', firstIdVar: 'First Marker ID Variable', firstCenterXVar: 'First Center X Variable', firstCenterYVar: 'First Center Y Variable' }[arucoPicker.field] ?? 'Variable')
    : '';

  // Derive picker variable list from the active field
  const pickerVars = visionPicker
    ? visionPicker.field === 'pointsVar'
      ? (variables ?? []).filter(v => isPointListVariable(v))
      : (variables ?? []).filter(v => !isListVariable(v))
    : [];
  const pickerSelected = visionPicker
    ? (draft?.visionOutputs ?? []).find(o => o.inspectionId === visionPicker.inspId)?.[visionPicker.field]
    : undefined;
  const pickerTitle =
    visionPicker?.field === 'detectedVar' ? 'Detected Variable' :
    visionPicker?.field === 'countVar'    ? 'Count Variable'    : 'Points Variable';

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => subPage ? setSubPage(null) : onClose()}>
        <View style={ms.overlay}>
          {/* Backdrop sits BEHIND the card (not wrapping it) so the card's
              ScrollView owns its gestures cleanly — a Pressable wrapping the
              ScrollView blocks scrolling when a drag starts on a focused input. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => subPage ? setSubPage(null) : onClose()} />
          <View style={[ms.card, { maxWidth: cardWidth }]}>
            {/* Header */}
            <View style={ms.header}>
              {subPage ? (
                <TouchableOpacity onPress={() => setSubPage(null)} hitSlop={12} activeOpacity={0.7}>
                  <ArrowLeft size={18} color="#111" />
                </TouchableOpacity>
              ) : <View style={{ width: 18 }} />}
              <Text style={ms.title}>{subPage ? subPageTitle[subPage] : "Configure Step"}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}>
              {subPage ? (
                renderSubPage()
              ) : (
                <>
                  {/* Step name — all step types except SetSpeed */}
                  {!isSetSpeed && (
                    <>
                      <Text style={ms.fieldLabel}>STEP NAME  (optional)</Text>
                      <TextInput style={[ms.input, { marginBottom: 14 }]}
                        value={draft!.name ?? ""} onChangeText={v => set({ name: v || undefined })}
                        placeholder="e.g. Pick part, Place on conveyor…" placeholderTextColor="#c4c4c4"
                        returnKeyType="next" />
                    </>
                  )}

                  {/* Status description — move steps only */}
                  {isMove && (
                    <>
                      <Text style={ms.fieldLabel}>STATUS DESCRIPTION  (optional)</Text>
                      <View style={{ marginBottom: 14 }}>
                        <TemplateInput
                          style={ms.input}
                          value={draft!.statusMessage ?? ""}
                          onChange={v => set({ statusMessage: v || undefined })}
                          placeholder="Shown in monitor while this step runs"
                          variables={variables}
                          autoCapitalize="sentences"
                        />
                      </View>
                    </>
                  )}

                  {/* Sub-row buttons for moves, inline body for everything else */}
                  {isMove ? (
                    <View style={ms.subRowCard}>{renderMainBody()}</View>
                  ) : isSetSpeed ? (
                    renderMainBody()
                  ) : (
                    renderMainBody()
                  )}
                </>
              )}
            </ScrollView>

            {/* Actions — only on main page */}
            {!subPage && (
              <View style={ms.actions}>
                <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                  <Text style={ms.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={ms.saveBtn}
                  onPress={() => {
                    onSave(draft!);
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
    </Modal>
    {/* Vision program picker */}
    <BottomSheet visible={visionProgPickerOpen} onClose={() => setVisionProgPickerOpen(false)} title="Select Vision Program">
      {visionPrograms.length === 0 && (
        <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 16 }}>No vision programs saved yet.</Text>
      )}
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        {visionPrograms.map((vp, i) => {
          const active = draft?.visionProgramId === vp.id;
          return (
            <TouchableOpacity
              key={vp.id}
              style={[ms.row, i < visionPrograms.length - 1 && ms.rowBorder, active && ms.rowActive]}
              onPress={() => {
                set({ visionProgramId: vp.id, visionProgramName: vp.name, visionZoneId: undefined, visionZoneVar: undefined, visionOutputs: [], colorOutputs: [], polygonOutputs: [], arucoOutputs: [] });
                setVisionProgPickerOpen(false);
              }}
              activeOpacity={0.7}
            >
              <View style={[ms.radioRing, active && ms.radioRingActive]}>
                {active && <View style={ms.radioDot} />}
              </View>
              <View style={ms.rowText}>
                <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{vp.name}</Text>
                {!!vp.description && <Text style={ms.rowDesc}>{vp.description}</Text>}
                <Text style={ms.rowDesc}>{vp.cameraId || 'No camera'} · {vp.zones.length} zone{vp.zones.length !== 1 ? 's' : ''}</Text>
              </View>
              {active && <Check size={16} color="#2563eb" />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>

    {/* Zone override picker */}
    <BottomSheet visible={zonePickerOpen} onClose={() => setZonePickerOpen(false)} title="Override Zone">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
        <TouchableOpacity
          style={[ms.row, ms.rowBorder, !draft?.visionZoneId && !draft?.visionZoneVar && ms.rowActive]}
          onPress={() => { set({ visionZoneId: undefined, visionZoneVar: undefined }); setZonePickerOpen(false); }}
          activeOpacity={0.7}
        >
          <View style={[ms.radioRing, !draft?.visionZoneId && !draft?.visionZoneVar && ms.radioRingActive]}>
            {!draft?.visionZoneId && !draft?.visionZoneVar && <View style={ms.radioDot} />}
          </View>
          <Text style={[ms.rowLabel, !draft?.visionZoneId && !draft?.visionZoneVar && ms.rowLabelActive]}>None — use program defaults</Text>
        </TouchableOpacity>
        {(visionPrograms.find(vp => vp.id === draft?.visionProgramId)?.zones ?? []).map(z => {
          const active = draft?.visionZoneId === z.id && !draft?.visionZoneVar;
          return (
            <TouchableOpacity
              key={z.id}
              style={[ms.row, ms.rowBorder, active && ms.rowActive]}
              onPress={() => { set({ visionZoneId: z.id, visionZoneVar: undefined }); setZonePickerOpen(false); }}
              activeOpacity={0.7}
            >
              <View style={[ms.radioRing, active && ms.radioRingActive]}>
                {active && <View style={ms.radioDot} />}
              </View>
              <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{z.name}</Text>
              {active && <Check size={16} color="#2563eb" />}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[ms.row, !!draft?.visionZoneVar && ms.rowActive]}
          onPress={() => { setZonePickerOpen(false); setZoneVarPickerOpen(true); }}
          activeOpacity={0.7}
        >
          <View style={[ms.radioRing, !!draft?.visionZoneVar && ms.radioRingActive]}>
            {!!draft?.visionZoneVar && <View style={ms.radioDot} />}
          </View>
          <Text style={[ms.rowLabel, !!draft?.visionZoneVar && ms.rowLabelActive]}>
            {draft?.visionZoneVar ? `From variable $${draft.visionZoneVar}` : 'From variable…'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>

    {/* Thread preset picker */}
    <BottomSheet visible={threadPresetPickerOpen} onClose={() => setThreadPresetPickerOpen(false)} title="Select Thread Size">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
        {(['metric', 'imperial'] as const).map(group => (
          <View key={group}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
                  {active && <Check size={16} color="#2563eb" />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </BottomSheet>

    <VarPickerModal
      visible={zoneVarPickerOpen}
      onClose={() => setZoneVarPickerOpen(false)}
      variables={(variables ?? []).filter(v => !isListVariable(v))}
      selected={draft?.visionZoneVar}
      title="Zone Variable"
      showNone
      onSelect={v => { set({ visionZoneVar: v?.name, visionZoneId: undefined }); }}
    />
    <VarPickerModal
      visible={visionPicker !== null}
      onClose={() => setVisionPicker(null)}
      variables={pickerVars}
      selected={pickerSelected}
      title={pickerTitle}
      showNone
      onSelect={v => {
        if (!visionPicker) return;
        const { inspId, field } = visionPicker;
        const outputs = draft!.visionOutputs ?? [];
        const idx = outputs.findIndex(o => o.inspectionId === inspId);
        const patch = { [field]: v?.name };
        const next: VisionStepOutput[] = idx >= 0
          ? outputs.map((o, i) => i === idx ? { ...o, ...patch } : o)
          : [...outputs, { inspectionId: inspId, ...patch }];
        set({ visionOutputs: next });
      }}
    />
    <VarPickerModal
      visible={colorPicker !== null}
      onClose={() => setColorPicker(null)}
      variables={colorPickerVars}
      selected={colorPickerSelected}
      title={colorPickerTitle}
      onSelect={v => {
        if (!colorPicker || !draft) return;
        const { inspId, field } = colorPicker;
        const outputs = draft.colorOutputs ?? [];
        const idx = outputs.findIndex(o => o.inspectionId === inspId);
        const patch = { [field]: v?.name };
        const next: ColorVisionStepOutput[] = idx >= 0
          ? outputs.map((o, i) => i === idx ? { ...o, ...patch } : o)
          : [...outputs, { inspectionId: inspId, ...patch }];
        set({ colorOutputs: next });
      }}
    />
    <VarPickerModal
      visible={polygonPicker !== null}
      onClose={() => setPolygonPicker(null)}
      variables={polygonPickerVars}
      selected={polygonPickerSelected}
      title={polygonPickerTitle}
      showNone
      onSelect={v => {
        if (!polygonPicker || !draft) return;
        const { inspId, field } = polygonPicker;
        const outputs = draft.polygonOutputs ?? [];
        const idx = outputs.findIndex(o => o.inspectionId === inspId);
        const patch = { [field]: v?.name };
        const next: PolygonVisionStepOutput[] = idx >= 0
          ? outputs.map((o, i) => i === idx ? { ...o, ...patch } : o)
          : [...outputs, { inspectionId: inspId, ...patch }];
        set({ polygonOutputs: next });
      }}
    />
    <VarPickerModal
      visible={arucoPicker !== null}
      onClose={() => setArucoPicker(null)}
      variables={arucoPickerVars}
      selected={arucoPickerSelected}
      title={arucoPickerTitle}
      showNone
      onSelect={v => {
        if (!arucoPicker || !draft) return;
        const { inspId, field } = arucoPicker;
        const outputs = draft.arucoOutputs ?? [];
        const idx = outputs.findIndex(o => o.inspectionId === inspId);
        const patch = { [field]: v?.name };
        const next: ArucoVisionStepOutput[] = idx >= 0
          ? outputs.map((o, i) => i === idx ? { ...o, ...patch } : o)
          : [...outputs, { inspectionId: inspId, ...patch }];
        set({ arucoOutputs: next });
      }}
    />
    <VariableEditModal
      visible={captureVarCreateOpen}
      variable={null}
      defaultType="image"
      onSave={v => {
        onSaveVariable?.(v);
        set({ captureImageVariableName: v.name });
        setCaptureVarCreateOpen(false);
      }}
      onClose={() => setCaptureVarCreateOpen(false)}
    />
    </>
  );
}


