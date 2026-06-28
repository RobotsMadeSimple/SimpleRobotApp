import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { useBuiltPrograms, useConnected, useGrids, useLocals, useNanoIO, usePoints, useRelayIO, useSelectedRobot, useStacks, useTools } from "@/src/providers/RobotProvider";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { robotClient } from "@/src/services/RobotConnectService";
import { ArucoVisionStepOutput, AuxDeviceState, AuxAxisChannelState, BuiltProgram, CameraState, ColorVisionStepOutput, ConditionGroup, ConditionItem, ConditionOp, ElseIfBranch, Grid, GridPoint, PolygonVisionStepOutput, ProgramStep, ProgramVariable, RobotStack, StackPoint, StepType, VisionProgram, VisionStepOutput, auxStepsPerUnit, auxUnitLabel } from "@/src/models/robotModels";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronsRight,
  GitBranch,
  Camera,
  CornerUpLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircuitBoard,
  ClipboardPaste,
  Clock,
  Copy,
  Cpu,
  Gauge,
  Grid3x3,
  GripVertical,
  Hash,
  Hourglass,
  ImagePlus,
  Layers,
  Timer,
  MessageSquare,
  OctagonX,
  PauseCircle,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCw,
  RotateCcw,
  Repeat2,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  Wrench,
  Home,
  X,
  Zap,
  ScanSearch,
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
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Numeric input with local text state.
 * - Never auto-fills while typing (empty field stays empty).
 * - On blur, reverts to the last valid value if the field is empty or invalid.
 * - No selectTextOnFocus to avoid the highlight-overwrite issue.
 */
function NumericInput({
  value,
  onChange,
  style,
  autoFocus,
  placeholder,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  style?: any;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");
  const lastValid = useRef<number | undefined>(value);

  // Sync when the draft value changes externally (e.g. modal re-opens)
  useEffect(() => {
    if (value !== undefined && value !== lastValid.current) {
      setText(String(value));
      lastValid.current = value;
    }
  }, [value]);

  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        setText(raw);
        const n = parseFloat(raw);
        if (!isNaN(n)) {
          onChange(n);
          lastValid.current = n;
        }
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (isNaN(n) || text.trim() === "") {
          const fallback = lastValid.current ?? 0;
          setText(String(fallback));
          onChange(fallback);
        }
      }}
      keyboardType="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
    />
  );
}

/**
 * Like NumericInput but allows clearing the field back to undefined ("use default").
 * Empty field on blur stays empty and calls onChange(undefined).
 */
function OptionalNumericInput({
  value,
  onChange,
  style,
  placeholder = "default",
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  style?: any;
  placeholder?: string;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");

  useEffect(() => {
    setText(value !== undefined ? String(value) : "");
  }, [value]);

  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        setText(raw);
        const n = parseFloat(raw);
        if (!isNaN(n)) onChange(n);
        else if (raw.trim() === "") onChange(undefined);
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (isNaN(n) || text.trim() === "") {
          setText("");
          onChange(undefined);
        }
      }}
      keyboardType="numeric"
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
    />
  );
}

/** Controlled numeric input that accepts negative numbers and decimals only. */
function SignedNumberInput({
  value,
  onChange,
  style,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  style: any;
}) {
  const [text, setText] = useState(String(value ?? 0));
  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        // Strip anything that's not a digit, decimal point, or minus sign
        // Minus is only valid at the start
        const s = raw.replace(/[^0-9.\-]/g, '').replace(/(?!^)-/g, '');
        setText(s);
        const n = parseFloat(s);
        if (!isNaN(n)) onChange(n);
      }}
      keyboardType="numbers-and-punctuation"
      selectTextOnFocus
    />
  );
}

/**
 * Numeric field that also accepts math expressions referencing program variables.
 *
 * - Type a plain number as usual.
 * - Type or tap a variable chip to build an expression like "$speed * 0.8".
 * - Text turns purple when an expression is detected.
 * - Tap × to clear back to empty.
 * - Variable chips (when defined) are always shown below the field as one-tap shortcuts.
 */
function ExpressionInput({
  fieldKey,
  value,
  expressions,
  onChangeValue,
  onChangeExpr,
  style,
  placeholder,
  allowUndefined,
  autoFocus,
  variables,
}: {
  fieldKey: string;
  value: number | undefined;
  expressions: Record<string, string> | undefined;
  onChangeValue: (n: number | undefined) => void;
  onChangeExpr: (key: string, expr: string | undefined) => void;
  style?: any;
  placeholder?: string;
  allowUndefined?: boolean;
  autoFocus?: boolean;
  variables?: ProgramVariable[];
}) {
  const currentExpr = expressions?.[fieldKey];
  const [text, setText] = useState(currentExpr ?? (value != null ? String(value) : ""));
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const inputRef   = useRef<any>(null);
  const isFocused  = useRef(false);

  // Sync when draft changes externally (modal re-opens) — not while user is typing
  useEffect(() => {
    if (isFocused.current) return;
    setText(currentExpr ?? (value != null ? String(value) : ""));
  }, [currentExpr, value]);

  // Text contains variable references or operators → treat as expression
  const isExpr = (t: string) =>
    /[$+*\/\(\)]/.test(t) || (t.includes("-") && !/^-?\d*\.?\d*$/.test(t.trim()));

  function commit(raw: string) {
    const t = raw.trim();
    if (!t) {
      onChangeValue(undefined);
      onChangeExpr(fieldKey, undefined);
      return;
    }
    const n = parseFloat(t);
    if (!isNaN(n) && !isExpr(t)) {
      onChangeValue(n);
      onChangeExpr(fieldKey, undefined);
    } else {
      onChangeExpr(fieldKey, t);
    }
  }

  function handleChange(raw: string) {
    setText(raw);
    const t = raw.trim();
    if (!t) {
      onChangeValue(undefined);
      onChangeExpr(fieldKey, undefined);
    } else if (!isExpr(raw)) {
      const n = parseFloat(t);
      if (!isNaN(n)) { onChangeValue(n); onChangeExpr(fieldKey, undefined); }
    } else {
      onChangeValue(undefined); // clear stale numeric so expression is the only active value
      onChangeExpr(fieldKey, t);
    }
  }

  function insertVar(v: ProgramVariable) {
    const token = v.points != null ? `$${v.name}[0].x`
                : v.values && v.values.length > 0 ? `$${v.name}[0]`
                : `$${v.name}`;
    const ref = text.trim();
    const next = ref ? `${ref} ${token}` : token;
    setText(next);
    onChangeValue(undefined);
    onChangeExpr(fieldKey, next);
    inputRef.current?.focus();
  }

  function insertOp(op: string) {
    const ref = text.trim();
    const next = ref ? `${ref} ${op} ` : `${op} `;
    setText(next);
    onChangeValue(undefined);
    onChangeExpr(fieldKey, next.trim());
    inputRef.current?.focus();
  }

  function clear() {
    setText("");
    onChangeValue(undefined);
    onChangeExpr(fieldKey, undefined);
  }

  const exprActive = isExpr(text);
  const hasVars    = variables && variables.length > 0;

  return (
    <View>
      <View style={[style, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
        <TextInput
          ref={inputRef}
          style={{ flex: 1, fontSize: 14, color: exprActive ? "#7c3aed" : "#111827" }}
          value={text}
          onChangeText={handleChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; commit(text); }}
          keyboardType="default"
          placeholder={placeholder ?? (allowUndefined ? "default" : "0")}
          placeholderTextColor="#9ca3af"
          autoFocus={autoFocus}
          returnKeyType="done"
        />
        {text.trim().length > 0 && (
          <TouchableOpacity onPress={clear} hitSlop={8} activeOpacity={0.7} style={{ paddingLeft: 6 }}>
            <X size={13} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
      {hasVars && (
        <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
          {([["×","*"],["+","+"],["-","-"],["÷","/"]] as [string,string][]).map(([label, op]) => (
            <TouchableOpacity
              key={op}
              onPress={() => insertOp(op)}
              activeOpacity={0.7}
              style={exprStyles.opChip}
            >
              <Text style={exprStyles.opChipText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setVarPickerOpen(true)}
            activeOpacity={0.7}
            style={[exprStyles.opChip, { backgroundColor: '#ede9fe', borderColor: '#c4b5fd' }]}
          >
            <Text style={[exprStyles.opChipText, { color: '#7c3aed', fontSize: 13 }]}>$var</Text>
          </TouchableOpacity>
        </View>
      )}
      {hasVars && (
        <VarPickerModal
          visible={varPickerOpen}
          onClose={() => setVarPickerOpen(false)}
          variables={variables!}
          selected={undefined}
          title="Insert Variable"
          onSelect={v => { if (v) insertVar(v); }}
        />
      )}
    </View>
  );
}

const exprStyles = StyleSheet.create({
  chip: {
    backgroundColor: "#ede9fe",
    borderWidth: 1,
    borderColor: "#c4b5fd",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: "center",
  },
  chipText: { fontSize: 13, fontWeight: "700", color: "#7c3aed" },
  chipHint: { fontSize: 10, color: "#a78bfa", marginTop: 1 },
  opChip: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: "center",
  },
  opChipText: { fontSize: 15, fontWeight: "600", color: "#374151" },
});

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function stepLabel(step: ProgramStep): string {
  switch (step.type) {
    case "MoveL":
    case "MoveJ":
    case "JumpL":
    case "JumpJ": {
      const offsetKeys    = ["offsetX","offsetY","offsetZ","offsetRX","offsetRY","offsetRZ"];
      const toolOffKeys   = ["toolOffsetX","toolOffsetY","toolOffsetZ","toolOffsetRX","toolOffsetRY","toolOffsetRZ"];
      const overrideKeys  = ["overrideX","overrideY","overrideZ","overrideRX","overrideRY","overrideRZ"];
      const hasOffset     = offsetKeys.some(k   => (step as any)[k] != null || step.expressions?.[k] != null);
      const hasToolOff    = toolOffKeys.some(k  => (step as any)[k] != null || step.expressions?.[k] != null);
      const hasOverride   = overrideKeys.some(k => (step as any)[k] != null || step.expressions?.[k] != null);
      const suffix = [
        hasToolOff  ? "toolOffset" : null,
        hasOffset   ? "offset"     : null,
        hasOverride ? "override"   : null,
      ].filter(Boolean).join("  ");
      const base = step.gridPoint
        ? `${step.type}  →  Grid Point`
        : step.stackPoint
        ? `${step.type}  →  Stack Point`
        : step.varPointName
        ? `${step.type}  →  $${step.varPointName}[${step.varPointIndex ?? "0"}]`
        : `${step.type}  →  ${step.pointName ?? "Current Position"}`;
      return suffix ? `${base}  (${suffix})` : base;
    }
    case "SetOutput": {
      const card  = step.outputCard ?? "stb";
      const num   = step.outputNumber ?? 1;
      const val   = step.outputValue ? "ON" : "OFF";
      const pulse = step.pulseMs && step.pulseMs > 0 ? `  pulse ${step.pulseMs} ms` : "";
      if (card === "relay") return `Relay ${num}  →  ${val}${pulse}`;
      if (card === "nano")  return `Nano · Pin ${num}  →  ${val}${pulse}`;
      return `STB · Output ${num}  →  ${val}${pulse}`;
    }
    case "Wait": {
      if (step.waitMode === 'condition') {
        const g = step.waitCondition;
        const condStr = g && (g.items ?? []).length > 0
          ? ((g.items ?? []).length === 1 ? `${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}` : `${g.combinator} of ${(g.items ?? []).length} conds`)
          : "condition";
        return step.waitTimeoutMs ? `Wait  ${condStr}  (${step.waitTimeoutMs} ms max)` : `Wait  ${condStr}`;
      }
      const waitExpr = step.expressions?.waitMs;
      return `Wait  ${waitExpr ?? `${step.waitMs ?? 0} ms`}`;
    }
    case "Loop": {
      if (step.loopMode === 'forEach')
        return `For Each  $${step.forEachVariableName ?? "?"}`;
      if (step.loopMode === 'while') {
        const g = step.loopWhileCondition;
        if (!g || (g.items ?? []).length === 0) return "While  (no condition)";
        if ((g.items ?? []).length === 1) return `While  ${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}`;
        return `While  ${g.combinator} of ${(g.items ?? []).length} conditions`;
      }
      const loopExpr = step.expressions?.loopCount;
      const loopVal  = loopExpr ? loopExpr : (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1));
      return `Loop  ×${loopVal}`;
    }
    case "StatusUpdate": return step.statusMessage ? `"${step.statusMessage}"` : "Status update";
    case "CallRoutine":  return step.routineName ? `Routine → ${step.routineName}` : "Call Routine";
    case "RunVision":    return step.visionProgramName ? `Vision → ${step.visionProgramName}` : "Run Vision";
    case "SaveImage":    return step.saveImagePath ? `Save Image  →  ${step.saveImagePath}` : "Save Image";
    case "SetSpeedL":
    case "SetSpeedJ": {
      const label  = step.type === "SetSpeedL" ? "Set Linear Speed" : "Set Joint Speed";
      const parts: string[] = [];
      if (step.speed != null) parts.push(`${step.speed} mm/s`);
      if (step.accel != null) parts.push(`accel ${step.accel}`);
      if (step.decel != null) parts.push(`decel ${step.decel}`);
      return parts.length ? `${label}  →  ${parts.join("  ·  ")}` : label;
    }
    case "SetVariable":   return fmtSetVar(step.variableName, step.variableExpr);
    case "PauseProgram":  return "Pause Program";
    case "IfCondition": {
      const g = step.condition;
      if (!g || (g.items ?? []).length === 0) return "If (no conditions)";
      if ((g.items ?? []).length === 1) return `If  ${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}`;
      return `If  ${g.combinator} of ${(g.items ?? []).length} conditions`;
    }
    case "SetTool":    return step.toolName  ? `Set Tool  →  ${step.toolName}`  : "Set Tool  →  None";
    case "SetLocal":   return step.localName ? `Set Local  →  ${step.localName}` : "Set Local  →  None";
    case "ClearLocal": return "Clear Local";
    case "RunHoming":  return "Run Homing";
    case "AuxMove": {
      const axis = step.auxAxisIndex ?? 0;
      const isAbs = step.auxAbsolute;
      if (step.auxUnit && step.auxDistance != null) {
        const val = isAbs ? `→ ${step.auxDistance}` : (step.auxDistance >= 0 ? `+${step.auxDistance}` : `${step.auxDistance}`);
        return `Aux Move  ·  Axis ${axis}  ·  ${val} ${step.auxUnit}`;
      }
      if (step.auxSteps != null) {
        const val = isAbs ? `→ ${step.auxSteps}` : (step.auxSteps >= 0 ? `+${step.auxSteps}` : `${step.auxSteps}`);
        return `Aux Move  ·  Axis ${axis}  ·  ${val} steps`;
      }
      return `Aux Move  ·  Axis ${axis}`;
    }
    case "AuxContinuous":
      return `Aux Run  ·  Axis ${step.auxAxisIndex ?? 0}  ·  ${step.auxVelocity ?? 800} steps/s`;
    case "AuxStop":
      return "Aux Stop";
    case "AuxEnable":
      return `Aux Motors ${step.auxEnable === false ? "OFF" : "ON"}`;
    case "StartBackground":
      return step.backgroundProgramName ? `Start Background  →  ${step.backgroundProgramName}` : "Start Background";
    case "StopBackground":
      return step.backgroundProgramName ? `Stop Background  →  ${step.backgroundProgramName}` : "Stop Background";
    case "WaitForBackground":
      return step.backgroundProgramName ? `Wait for  →  ${step.backgroundProgramName}` : "Wait for Background";
    case "StopwatchControl":
      return step.stopwatchVariableName
        ? `${step.stopwatchAction ?? "?"} $${step.stopwatchVariableName}`
        : `Stopwatch ${step.stopwatchAction ?? "?"}`;
    default:              return step.type;
  }
}

function StepIcon({ type, size = 16, color = "#6b7280" }: { type: StepType; size?: number; color?: string }) {
  switch (type) {
    case "MoveL":
    case "MoveJ":        return <ArrowRight    size={size} color={color} />;
    case "JumpL":
    case "JumpJ":        return <ArrowRight    size={size} color={color} />;
    case "SetOutput":    return <Zap           size={size} color={color} />;
    case "Wait":         return <Clock         size={size} color={color} />;
    case "Loop":         return <RefreshCw     size={size} color={color} />;
    case "StatusUpdate": return <MessageSquare size={size} color={color} />;
    case "CallRoutine":  return <Repeat2       size={size} color={color} />;
    case "RunVision":    return <ScanSearch    size={size} color={color} />;
    case "SaveImage":    return <ImagePlus    size={size} color={color} />;
    case "SetSpeedL":
    case "SetSpeedJ":    return <Gauge         size={size} color={color} />;
    case "SetVariable":  return <Hash          size={size} color={color} />;
    case "PauseProgram": return <PauseCircle   size={size} color={color} />;
    case "Label":        return <Bookmark      size={size} color={color} />;
    case "GoToLabel":    return <CornerUpLeft  size={size} color={color} />;
    case "IfCondition":  return <GitBranch     size={size} color={color} />;
    case "SetTool":        return <Wrench        size={size} color={color} />;
    case "SetLocal":
    case "ClearLocal":     return <Grid3x3       size={size} color={color} />;
    case "RunHoming":      return <Home          size={size} color={color} />;
    case "AuxMove":            return <ChevronsRight size={size} color={color} />;
    case "AuxContinuous":      return <Play          size={size} color={color} />;
    case "AuxStop":            return <OctagonX      size={size} color={color} />;
    case "AuxEnable":          return <Zap           size={size} color={color} />;
    case "StartBackground":    return <Layers        size={size} color={color} />;
    case "StopBackground":     return <Square        size={size} color={color} />;
    case "WaitForBackground":  return <Hourglass     size={size} color={color} />;
    case "StopwatchControl":   return <Timer         size={size} color={color} />;
    default:               return <Cpu           size={size} color={color} />;
  }
}

// ── Step theme + card detail ──────────────────────────────────────────────────

const STEP_THEME: Record<string, { accent: string; iconBg: string; iconColor: string; label: string }> = {
  MoveL:        { accent: "#2563eb", iconBg: "#dbeafe", iconColor: "#2563eb", label: "Move Linear"  },
  MoveJ:        { accent: "#2563eb", iconBg: "#dbeafe", iconColor: "#2563eb", label: "Move Joint"   },
  JumpL:        { accent: "#0891b2", iconBg: "#cffafe", iconColor: "#0891b2", label: "Jump Linear"  },
  JumpJ:        { accent: "#0891b2", iconBg: "#cffafe", iconColor: "#0891b2", label: "Jump Joint"   },
  SetOutput:    { accent: "#ea580c", iconBg: "#fed7aa", iconColor: "#ea580c", label: "Set Output"   },
  Wait:         { accent: "#d97706", iconBg: "#fde68a", iconColor: "#b45309", label: "Wait"         },
  Loop:         { accent: "#7c3aed", iconBg: "#ddd6fe", iconColor: "#7c3aed", label: "Loop"         },
  StatusUpdate: { accent: "#475569", iconBg: "#e2e8f0", iconColor: "#475569", label: "Status Update"},
  CallRoutine:  { accent: "#16a34a", iconBg: "#bbf7d0", iconColor: "#16a34a", label: "Call Routine" },
  SetSpeedL:    { accent: "#0284c7", iconBg: "#e0f2fe", iconColor: "#0284c7", label: "Set Speed (Linear)" },
  SetSpeedJ:    { accent: "#0d9488", iconBg: "#ccfbf1", iconColor: "#0d9488", label: "Set Speed (Joint)"  },
  SetVariable:  { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Set Variable"       },
  PauseProgram: { accent: "#374151", iconBg: "#f3f4f6", iconColor: "#374151", label: "Pause Program"  },
  Label:        { accent: "#0891b2", iconBg: "#e0f2fe", iconColor: "#0891b2", label: "Label"          },
  GoToLabel:    { accent: "#0891b2", iconBg: "#e0f2fe", iconColor: "#0891b2", label: "Go To Label"    },
  IfCondition:  { accent: "#0891b2", iconBg: "#e0f2fe", iconColor: "#0891b2", label: "If Condition"    },
  SetTool:      { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Set Tool"    },
  SetLocal:     { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Set Local"   },
  ClearLocal:   { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Clear Local" },
  RunHoming:     { accent: "#dc2626", iconBg: "#fee2e2", iconColor: "#dc2626", label: "Run Homing"         },
  AuxMove:       { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Aux Move"           },
  AuxContinuous: { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Aux Continuous Run" },
  AuxStop:       { accent: "#dc2626", iconBg: "#fee2e2", iconColor: "#dc2626", label: "Aux Stop"           },
  AuxEnable:     { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Aux Motor Enable"   },
  RunVision:        { accent: "#0891b2", iconBg: "#cffafe", iconColor: "#0891b2", label: "Run Vision"          },
  SaveImage:        { accent: "#0891b2", iconBg: "#cffafe", iconColor: "#0891b2", label: "Save Image"          },
  StartBackground:  { accent: "#16a34a", iconBg: "#dcfce7", iconColor: "#16a34a", label: "Start Background"   },
  StopBackground:   { accent: "#dc2626", iconBg: "#fee2e2", iconColor: "#dc2626", label: "Stop Background"    },
  WaitForBackground:{ accent: "#d97706", iconBg: "#fde68a", iconColor: "#b45309", label: "Wait for Background"},
  StopwatchControl: { accent: "#0891b2", iconBg: "#e0f2fe", iconColor: "#0891b2", label: "Stopwatch"          },
};

function fmtMoveModifiers(step: ProgramStep): string[] {
  const axes = ['X','Y','Z','RX','RY','RZ'] as const;
  function fmt(prefix: string, fieldPrefix: string): string | null {
    const hits = axes
      .map(ax => {
        const key = `${fieldPrefix}${ax}`;
        const val = step.expressions?.[key] ?? (step as any)[key];
        return val != null ? `${ax}=${val}` : null;
      })
      .filter(Boolean) as string[];
    return hits.length ? `${prefix}(${hits.join(' ')})` : null;
  }
  return [
    fmt('ToolOffset', 'toolOffset'),
    fmt('Offset',     'offset'),
    fmt('Override',   'override'),
  ].filter(Boolean) as string[];
}

function stepDetail(step: ProgramStep, grids?: Grid[], stacks?: RobotStack[]): string | null {
  switch (step.type) {
    case "MoveL":
    case "MoveJ": {
      const target = step.gridPoint ? "grid point"
        : step.stackPoint ? "stack point"
        : step.varPointName ? `$${step.varPointName}[${step.varPointIndex ?? "0"}]`
        : (step.pointName ?? "current pos");
      const lines = [`→ ${target}`];
      if (step.speed != null) lines.push(`${step.speed} mm/s`);
      lines.push(...fmtMoveModifiers(step));
      return lines.join('\n');
    }
    case "JumpL":
    case "JumpJ": {
      const target = step.gridPoint ? "grid point"
        : step.stackPoint ? "stack point"
        : step.varPointName ? `$${step.varPointName}[${step.varPointIndex ?? "0"}]`
        : (step.pointName ?? "current pos");
      const lines = [`→ ${target}`];
      if (step.jumpZ != null) lines.push(`Z: ${step.jumpZ} mm`);
      if (step.speed != null) lines.push(`${step.speed} mm/s`);
      lines.push(...fmtMoveModifiers(step));
      return lines.join('\n');
    }
    case "SetOutput": {
      const card  = step.outputCard ?? "stb";
      const num   = step.outputNumber ?? 1;
      const val   = step.outputValue ? "ON" : "OFF";
      const label = card === "relay" ? `Relay ${num}  →  ${val}`
                  : card === "nano"  ? `Nano · Pin ${num}  →  ${val}`
                  :                    `STB · Output ${num}  →  ${val}`;
      const lines = [label];
      if (step.pulseMs && step.pulseMs > 0) lines.push(`Pulse  ${step.pulseMs} ms`);
      return lines.join('\n');
    }
    case "Wait": {
      if (step.waitMode === 'condition') {
        const parts: string[] = [];
        if (step.waitTimeoutMs) parts.push(`max ${step.waitTimeoutMs} ms`);
        if (step.waitTimeoutVariableName) parts.push(`timeout → $${step.waitTimeoutVariableName}`);
        return parts.join("  ·  ") || "Wait for condition";
      }
      const waitExpr = step.expressions?.waitMs;
      return waitExpr ?? `${step.waitMs ?? 0} ms`;
    }
    case "Loop": {
      if (step.loopMode === 'forEach') {
        const parts: string[] = [`$${step.forEachVariableName ?? "?"}`];
        if (step.forEachValueVariableName) parts.push(`value → $${step.forEachValueVariableName}`);
        if (step.forEachIndexVariableName) parts.push(`index → $${step.forEachIndexVariableName}`);
        return parts.join("  ·  ");
      }
      if (step.loopMode === 'while') {
        const g = step.loopWhileCondition;
        if (!g || (g.items ?? []).length === 0) return "Exits when condition is false";
        if ((g.items ?? []).length === 1) return `${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}`;
        return `${g.combinator} of ${(g.items ?? []).length} conditions`;
      }
      const loopExpr = step.expressions?.loopCount;
      const countStr = `×${loopExpr ?? (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1))}`;
      return step.forEachIndexVariableName ? `${countStr}  ·  index → $${step.forEachIndexVariableName}` : countStr;
    }
    case "StatusUpdate":
      return step.statusMessage || null;
    case "CallRoutine":
      return step.routineName ? `→ ${step.routineName}` : null;
    case "RunVision":
      return step.visionProgramName ? `→ ${step.visionProgramName}` : null;
    case "SaveImage":
      return step.saveImagePath ? step.saveImagePath : null;
    case "SetSpeedL":
    case "SetSpeedJ": {
      const lines: string[] = [];
      const speedStr = step.expressions?.speed ?? (step.speed != null ? `${step.speed} mm/s` : null);
      const accelStr = step.expressions?.accel ?? (step.accel != null ? `${step.accel} mm/s²` : null);
      const decelStr = step.expressions?.decel ?? (step.decel != null ? `${step.decel} mm/s²` : null);
      if (speedStr) lines.push(`Speed  ${speedStr}`);
      if (accelStr) lines.push(`Accel  ${accelStr}`);
      if (decelStr) lines.push(`Decel  ${decelStr}`);
      return lines.length ? lines.join("\n") : null;
    }
    case "SetVariable":
      return step.variableName ? fmtSetVar(step.variableName, step.variableExpr) : null;
    case "Label":
      return step.labelName ? `⬤ ${step.labelName}` : null;
    case "GoToLabel":
      return step.labelName ? `↩ ${step.labelName}` : null;
    case "IfCondition": {
      const g = step.condition;
      if (!g || (g.items ?? []).length === 0) return "(no conditions)";
      if ((g.items ?? []).length === 1) return `${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}`;
      return `${g.combinator} of ${(g.items ?? []).length} conditions`;
    }
    case "SetTool":
      return step.toolName  ? `→ ${step.toolName}`  : "→ None";
    case "SetLocal":
      return step.localName ? `→ ${step.localName}` : "→ None";
    case "ClearLocal":
      return null;
    case "RunHoming":
      return "Runs the full homing sequence";
    case "AuxMove": {
      const unit  = step.auxUnit ?? "steps";
      const parts: string[] = [step.auxAbsolute ? "absolute" : "relative"];
      if (step.auxVelocity != null) parts.push(`${step.auxVelocity} ${unit}/s`);
      if (step.auxWaitForDone === false) parts.push("no wait");
      return parts.join("  ·  ");
    }
    case "AuxContinuous":
      return `Axis ${step.auxAxisIndex ?? 0}  ·  ${step.auxVelocity ?? 800} steps/s  (continuous)`;
    case "AuxStop":
      return step.auxImmediate ? "Immediate halt" : "Controlled stop";
    case "AuxEnable":
      return step.auxEnable === false ? "Disable motor drivers" : "Enable motor drivers";
    case "StartBackground":
      return step.backgroundProgramName ? `→ ${step.backgroundProgramName}` : null;
    case "StopBackground":
      return step.backgroundProgramName ? `→ ${step.backgroundProgramName}` : null;
    case "WaitForBackground":
      return step.backgroundProgramName ? `→ ${step.backgroundProgramName}` : null;
    case "StopwatchControl":
      return step.stopwatchVariableName ? `$${step.stopwatchVariableName}` : null;
    default:
      return null;
  }
}

const STEP_TYPES: { type: StepType; label: string; desc: string }[] = [
  { type: "MoveL",        label: "Move Linear",   desc: "Move to a saved point in a straight line" },
  { type: "MoveJ",        label: "Move Joint",    desc: "Move to a saved point via joint interpolation" },
  { type: "JumpL",        label: "Jump Linear",   desc: "Lift, move linearly over the target, then lower — avoids obstacles" },
  { type: "JumpJ",        label: "Jump Joint",    desc: "Lift, move via joint interpolation over the target, then lower — avoids obstacles" },
  { type: "SetOutput",    label: "Set Output",    desc: "Turn a digital output ON or OFF" },
  { type: "Wait",         label: "Wait",          desc: "Pause execution for a set duration" },
  { type: "Loop",         label: "Loop",          desc: "Repeat a block of steps N times" },
  { type: "StatusUpdate", label: "Status Update", desc: "Publish a message, warning, or error to the monitor" },
  { type: "CallRoutine",  label: "Call Routine",  desc: "Run a saved routine inline then continue" },
  { type: "SetSpeedL",    label: "Set Speed (Linear)", desc: "Update the linear move speed, accel and decel" },
  { type: "SetSpeedJ",    label: "Set Speed (Joint)",  desc: "Update the joint move speed, accel and decel" },
  { type: "SetVariable",  label: "Set Variable",       desc: "Assign a new value or expression to a program variable" },
  { type: "PauseProgram", label: "Pause Program",      desc: "Stop the program — operator can Continue or Exit from the monitor" },
  { type: "Label",        label: "Label",              desc: "Mark a named point in the program that GoToLabel can jump back to" },
  { type: "GoToLabel",    label: "Go To Label",        desc: "Jump to a Label anywhere in the program (forward, backward, or across scopes)" },
  { type: "IfCondition",  label: "If Condition",  desc: "Branch execution based on IO state, sensor values, or variable expressions" },
  { type: "SetTool",      label: "Set Tool",      desc: "Change the active tool TCP offset used for subsequent move steps" },
  { type: "SetLocal",     label: "Set Local",     desc: "Activate a local coordinate frame — all subsequent moves are offset by this local" },
  { type: "ClearLocal",   label: "Clear Local",   desc: "Deactivate the current local coordinate frame and return to world origin" },
  { type: "RunHoming",    label: "Run Homing",    desc: "Run the full homing sequence and wait for it to complete before continuing" },
  { type: "AuxMove",       label: "Aux Move",           desc: "Move an aux stepper axis a fixed number of steps with trapezoidal acceleration" },
  { type: "AuxContinuous", label: "Aux Continuous Run", desc: "Start an aux axis running continuously (e.g. conveyor belt) until an AuxStop step" },
  { type: "AuxStop",       label: "Aux Stop",           desc: "Stop all aux axis motion — controlled ramp-down or immediate hard stop" },
  { type: "AuxEnable",     label: "Aux Motor Enable",   desc: "Enable or disable the stepper motor drivers on an aux IO card" },
  { type: "RunVision",        label: "Run Vision",            desc: "Trigger a vision program, wait for one inspection result, then continue" },
  { type: "StartBackground",  label: "Start Background",      desc: "Start a background program running in parallel with this one" },
  { type: "StopBackground",   label: "Stop Background",       desc: "Stop a named background program" },
  { type: "WaitForBackground",label: "Wait for Background",   desc: "Block until a named background program finishes" },
  { type: "StopwatchControl", label: "Stopwatch",             desc: "Start, stop, or reset a stopwatch variable — value holds elapsed milliseconds" },
  { type: "SaveImage",        label: "Save Image",             desc: "Capture a camera snapshot and save to a file path — supports $variable interpolation including $time_ms" },
];

const STEP_TYPE_MAP = Object.fromEntries(STEP_TYPES.map(s => [s.type, s])) as Record<string, typeof STEP_TYPES[0]>;

const BACKGROUND_RESTRICTED: Set<StepType> = new Set([
  "MoveL", "MoveJ", "JumpL", "JumpJ",
  "SetTool", "SetSpeedL", "SetSpeedJ", "SetLocal", "ClearLocal", "RunHoming",
]);

const STEP_CATEGORIES: { label: string; color: string; types: StepType[] }[] = [
  { label: "Motion",       color: "#2563eb", types: ["MoveL", "MoveJ", "JumpL", "JumpJ"] },
  { label: "Flow",         color: "#0891b2", types: ["Loop", "IfCondition", "PauseProgram", "Label", "GoToLabel"] },
  { label: "I/O",          color: "#ea580c", types: ["SetOutput"] },
  { label: "Speed",        color: "#0284c7", types: ["SetSpeedL", "SetSpeedJ"] },
  { label: "Variables",    color: "#7c3aed", types: ["SetVariable"] },
  { label: "Vision",       color: "#0891b2", types: ["RunVision", "SaveImage"] },
  { label: "Aux Axes",     color: "#7c3aed", types: ["AuxMove", "AuxContinuous", "AuxStop", "AuxEnable"] },
  { label: "Tool & Frame", color: "#7c3aed", types: ["SetTool", "SetLocal", "ClearLocal"] },
  { label: "Utility",      color: "#475569", types: ["Wait", "StatusUpdate", "CallRoutine", "RunHoming"] },
  { label: "Background",   color: "#16a34a", types: ["StartBackground", "StopBackground", "WaitForBackground"] },
  { label: "Timing",       color: "#0891b2", types: ["StopwatchControl"] },
];

// ── Insert target — tracks where the next step should be placed ───────────────

type InsertTarget =
  | { mode: "append" }
  | { mode: "insert"; afterIndex: number };

// ── Drag info ─────────────────────────────────────────────────────────────────

type DragInfo = {
  id: string;
  fromIndex: number;
  toIndex: number;
};

// ── Scope navigation ──────────────────────────────────────────────────────────

type ScopeFrame = {
  kind: 'loop' | 'ifTrue' | 'elseIf' | 'else';
  stepId: string;
  label: string;
  branchId?: string;
};

function getStepsAtScope(rootSteps: ProgramStep[], stack: ScopeFrame[]): ProgramStep[] {
  let current = rootSteps;
  for (const frame of stack) {
    const parent = current.find(s => s.id === frame.stepId);
    if (!parent) break;
    switch (frame.kind) {
      case 'loop':   current = parent.loopSteps ?? []; break;
      case 'ifTrue': current = parent.ifSteps ?? []; break;
      case 'else':   current = parent.elseSteps ?? []; break;
      case 'elseIf': current = parent.elseIfBranches?.find(b => b.id === frame.branchId)?.steps ?? []; break;
    }
  }
  return current;
}

function setStepsAtScope(
  rootSteps: ProgramStep[],
  stack: ScopeFrame[],
  newSteps: ProgramStep[]
): ProgramStep[] {
  if (stack.length === 0) return newSteps;
  const [head, ...tail] = stack;
  return rootSteps.map(s => {
    if (s.id !== head.stepId) return s;
    switch (head.kind) {
      case 'loop':
        return { ...s, loopSteps: tail.length === 0 ? newSteps : setStepsAtScope(s.loopSteps ?? [], tail, newSteps) };
      case 'ifTrue':
        return { ...s, ifSteps: tail.length === 0 ? newSteps : setStepsAtScope(s.ifSteps ?? [], tail, newSteps) };
      case 'else':
        return { ...s, elseSteps: tail.length === 0 ? newSteps : setStepsAtScope(s.elseSteps ?? [], tail, newSteps) };
      case 'elseIf':
        return {
          ...s,
          elseIfBranches: (s.elseIfBranches ?? []).map(b =>
            b.id === head.branchId
              ? { ...b, steps: tail.length === 0 ? newSteps : setStepsAtScope(b.steps, tail, newSteps) }
              : b
          ),
        };
    }
  });
}

// ── Step type picker modal ────────────────────────────────────────────────────

function StepTypePicker({
  visible,
  onPick,
  onClose,
  isBackgroundMode = false,
}: {
  visible: boolean;
  onPick: (type: StepType) => void;
  onClose: () => void;
  isBackgroundMode?: boolean;
}) {
  const [search, setSearch] = useState('');

  useEffect(() => { if (visible) setSearch(''); }, [visible]);

  const q = search.trim().toLowerCase();
  const searchResults = q
    ? STEP_TYPES.filter(s =>
        s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)
      )
    : null;

  function renderRow(s: typeof STEP_TYPES[0], i: number, arr: typeof STEP_TYPES) {
    const theme      = STEP_THEME[s.type] ?? STEP_THEME["MoveL"];
    const restricted = isBackgroundMode && BACKGROUND_RESTRICTED.has(s.type);
    return (
      <TouchableOpacity
        key={s.type}
        style={[ms.row, i < arr.length - 1 && ms.rowBorder, restricted && { opacity: 0.35 }]}
        onPress={() => { if (!restricted) { onPick(s.type); onClose(); } }}
        activeOpacity={restricted ? 1 : 0.7}
      >
        <View style={[ms.iconTile, { backgroundColor: theme.iconBg }]}>
          <StepIcon type={s.type} size={18} color={theme.iconColor} />
        </View>
        <View style={ms.rowText}>
          <Text style={[ms.rowLabel, { color: theme.accent }]}>{s.label}</Text>
          <Text style={ms.rowDesc}>{restricted ? "Not allowed in background programs" : s.desc}</Text>
        </View>
        {restricted ? <OctagonX size={14} color="#dc2626" /> : <ChevronRight size={16} color="#d1d5db" />}
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.card} onPress={() => {}}>
          <View style={ms.header}>
            <Text style={ms.title}>Add Step</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={ptStyles.searchBar}>
            <Search size={14} color="#9ca3af" />
            <TextInput
              style={ptStyles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search steps…"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} activeOpacity={0.7}>
                <X size={13} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="always"
          >
            {searchResults ? (
              searchResults.length === 0
                ? <Text style={ms.emptyHint}>No steps match "{q}".</Text>
                : searchResults.map((s, i) => renderRow(s, i, searchResults))
            ) : (
              STEP_CATEGORIES.map(cat => {
                const items = cat.types.map(t => STEP_TYPE_MAP[t]).filter(Boolean);
                return (
                  <View key={cat.label}>
                    <View style={ptStyles.catHeader}>
                      <Text style={[ptStyles.catLabel, { color: cat.color }]}>
                        {cat.label.toUpperCase()}
                      </Text>
                    </View>
                    {items.map((s, i) => renderRow(s, i, items))}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ptStyles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 9,
    paddingHorizontal: 10,
    backgroundColor: '#f9fafb',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingVertical: 9,
  },
  catHeader: {
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    marginBottom: 2,
  },
  catLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});

// ── Condition editor ─────────────────────────────────────────────────────────

const COND_OPS: ConditionOp[] = ['==', '!=', '>', '>=', '<', '<=', 'contains', 'startsWith', 'endsWith'];
const COND_OP_LABELS: Record<ConditionOp, string> = {
  '==': 'equals',
  '!=': 'not equals',
  '>':  'greater than',
  '>=': 'greater than or equal',
  '<':  'less than',
  '<=': 'less than or equal',
  'contains':   'contains  (string)',
  'startsWith': 'starts with  (string)',
  'endsWith':   'ends with  (string)',
};

function conditionSummary(group: ConditionGroup | undefined): string {
  if (!group || !group.items || group.items.length === 0) return '(no conditions)';
  if (group.items.length === 1) {
    const it = group.items[0];
    return `${it.left || '?'} ${it.operator} ${it.right || '?'}`;
  }
  return `${group.combinator} of ${group.items.length} conditions`;
}

function ConditionItemEditor({
  item,
  variables,
  contextVariables,
  onChange,
  onDelete,
}: {
  item: ConditionItem;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onChange: (updated: ConditionItem) => void;
  onDelete: () => void;
}) {
  const [opOpen, setOpOpen] = React.useState(false);
  const [leftPickerOpen, setLeftPickerOpen] = React.useState(false);
  const [rightPickerOpen, setRightPickerOpen] = React.useState(false);
  const rightRef = useRef<any>(null);
  const hasVars = !!(variables && variables.length > 0);

  function insertRightToken(token: string) {
    const cur = (item.right ?? '').trimEnd();
    const next = cur ? `${cur} ${token} ` : `${token} `;
    onChange({ ...item, right: next });
    rightRef.current?.focus();
  }

  const rightIsExpr = /[$+\-*\/()]/.test(item.right ?? '');

  return (
    <View style={{ marginBottom: 10, borderWidth: 1, borderColor: '#e0f2fe', borderRadius: 10, padding: 10, backgroundColor: '#fff' }}>
      {/* Delete button */}
      <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7} style={{ alignSelf: 'flex-end', marginBottom: 6 }}>
        <X size={14} color="#9ca3af" />
      </TouchableOpacity>

      {/* Left */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.4, marginBottom: 4 }}>LEFT</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#7c3aed' }}
          value={item.left ?? ''}
          onChangeText={v => onChange({ ...item, left: v })}
          placeholder="$var or $stb.in1"
          placeholderTextColor="#c4b5fd"
          autoCapitalize="none"
        />
        {hasVars && (
          <TouchableOpacity
            onPress={() => setLeftPickerOpen(true)}
            activeOpacity={0.7}
            style={{ backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>var</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Operator — full-width select button */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.4, marginBottom: 4 }}>OPERATOR</Text>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#e0f2fe', borderWidth: 1.5, borderColor: '#bae6fd', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12 }}
        onPress={() => setOpOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0891b2', flex: 1 }}>{item.operator}</Text>
        <Text style={{ fontSize: 12, color: '#67e8f9', flex: 2 }}>{COND_OP_LABELS[item.operator as ConditionOp] ?? ''}</Text>
        <ChevronDown size={14} color="#0891b2" />
      </TouchableOpacity>

      {/* Right */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.4, marginBottom: 4 }}>RIGHT</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput
          ref={rightRef}
          style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: rightIsExpr ? '#7c3aed' : '#111827' }}
          value={item.right ?? ''}
          onChangeText={v => onChange({ ...item, right: v })}
          placeholder="value or expression"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />
        {hasVars && (
          <TouchableOpacity
            onPress={() => setRightPickerOpen(true)}
            activeOpacity={0.7}
            style={{ backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>var</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
        {([['×', '*'], ['+', '+'], ['−', '-'], ['÷', '/']] as [string, string][]).map(([label, op]) => (
          <TouchableOpacity key={op} onPress={() => insertRightToken(op)} activeOpacity={0.7} style={exprStyles.opChip}>
            <Text style={exprStyles.opChipText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <VarPickerModal
        visible={leftPickerOpen}
        onClose={() => setLeftPickerOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        contextLabel="Caller Variables"
        selected={(item.left ?? '').startsWith('$') ? item.left.slice(1) : undefined}
        title="Left Variable"
        onSelect={v => { if (v) onChange({ ...item, left: `$${v.name}` }); }}
      />
      <VarPickerModal
        visible={rightPickerOpen}
        onClose={() => setRightPickerOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        contextLabel="Caller Variables"
        selected={(item.right ?? '').startsWith('$') ? item.right.slice(1) : undefined}
        title="Right Variable"
        onSelect={v => { if (v) insertRightToken(`$${v.name}`); }}
      />
      <Modal visible={opOpen} transparent animationType="fade" onRequestClose={() => setOpOpen(false)}>
        <Pressable style={svs.modalOverlay} onPress={() => setOpOpen(false)}>
          <Pressable style={svs.modalCard} onPress={() => {}}>
            <Text style={svs.modalTitle}>Operator</Text>
            {COND_OPS.map((op, i) => (
              <TouchableOpacity key={op}
                style={[svs.optionRow, i < COND_OPS.length - 1 && svs.optionRowBorder, op === item.operator && svs.optionRowActive]}
                onPress={() => { onChange({ ...item, operator: op }); setOpOpen(false); }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: op.length > 3 ? 12 : 16, fontWeight: '700', color: op === item.operator ? '#0891b2' : '#374151', minWidth: 28 }}>{op}</Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', flex: 1 }}>{COND_OP_LABELS[op]}</Text>
                </View>
                {op === item.operator && <Check size={15} color="#0891b2" />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ConditionGroupEditor({
  group,
  onChange,
  variables,
  contextVariables,
}: {
  group: ConditionGroup;
  onChange: (updated: ConditionGroup) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const accent = '#0891b2';
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#6b7280', marginRight: 4 }}>MATCH</Text>
        {(['ALL', 'ANY'] as const).map(opt => (
          <TouchableOpacity key={opt}
            style={[{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
              group.combinator === opt ? { borderColor: accent, backgroundColor: accent } : { borderColor: '#d1d5db', backgroundColor: '#fff' }]}
            onPress={() => onChange({ ...group, combinator: opt })} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: group.combinator === opt ? '#fff' : '#6b7280' }}>{opt}</Text>
          </TouchableOpacity>
        ))}
        <Text style={{ fontSize: 11, color: '#6b7280' }}>
          {group.combinator === 'ALL' ? 'conditions must be true' : 'one must be true'}
        </Text>
      </View>
      {(group.items ?? []).length === 0 && (
        <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10, fontStyle: 'italic' }}>No conditions — branch always runs.</Text>
      )}
      {(group.items ?? []).map((item, i) => (
        <ConditionItemEditor key={item.id} item={item} variables={variables} contextVariables={contextVariables}
          onChange={updated => onChange({ ...group, items: (group.items ?? []).map((ci, j) => j === i ? updated : ci) })}
          onDelete={() => onChange({ ...group, items: (group.items ?? []).filter((_, j) => j !== i) })} />
      ))}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#bae6fd', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, backgroundColor: '#f0f9ff' }}
        onPress={() => onChange({ ...group, items: [...(group.items ?? []), { id: newId(), left: '', operator: '==' as ConditionOp, right: '' }] })}
        activeOpacity={0.7}>
        <Plus size={14} color={accent} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: accent }}>Add Condition</Text>
      </TouchableOpacity>
    </View>
  );
}


// ── Variable picker modal ─────────────────────────────────────────────────────

type VarKind = 'number' | 'boolean' | 'list' | 'points' | 'string';

function varKind(v: ProgramVariable): VarKind {
  if (v.points != null) return 'points';
  if (v.values != null && v.values.length > 0) return 'list';
  if (v.isBoolean) return 'boolean';
  if (v.isString) return 'string';
  return 'number';
}

const VAR_KIND_META: Record<VarKind, { label: string; color: string; bg: string; border: string }> = {
  number:  { label: 'NUM',  color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  boolean: { label: 'BOOL', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  list:    { label: 'LIST', color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  points:  { label: 'PTS',  color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
  string:  { label: 'STR',  color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
};


function VarPickerModal({
  visible, onClose, variables, selected, onSelect, title, showNone = false,
  contextVariables, contextLabel,
}: {
  visible: boolean;
  onClose: () => void;
  variables: ProgramVariable[];
  selected: string | undefined;
  onSelect: (variable: ProgramVariable | undefined) => void;
  title: string;
  showNone?: boolean;
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
}) {
  const [search,     setSearch]     = useState('');
  const [kindFilter, setKindFilter] = useState<VarKind | 'all'>('all');

  useEffect(() => {
    if (visible) { setSearch(''); setKindFilter('all'); }
  }, [visible]);

  const kinds = useMemo(() => {
    const seen = new Set<VarKind>();
    [...variables, ...(contextVariables ?? [])].forEach(v => seen.add(varKind(v)));
    return [...seen];
  }, [variables, contextVariables]);

  const filtered = useMemo(() =>
    variables.filter(v => {
      if (kindFilter !== 'all' && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [variables, kindFilter, search]);

  const filteredContext = useMemo(() =>
    (contextVariables ?? []).filter(v => {
      if (kindFilter !== 'all' && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [contextVariables, kindFilter, search]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={[ms.card, { maxHeight: '80%' }]} onPress={() => {}}>
          <View style={ms.header}>
            <View style={{ width: 18 }} />
            <Text style={ms.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb',
            borderRadius: 9, paddingHorizontal: 10, backgroundColor: '#f9fafb', marginBottom: 8 }}>
            <TextInput
              style={{ flex: 1, fontSize: 14, color: '#111827', paddingVertical: 9 }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name…"
              placeholderTextColor="#9ca3af"
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} activeOpacity={0.7}>
                <X size={13} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {/* Type filter chips — only shown when multiple kinds exist */}
          {kinds.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}
              keyboardShouldPersistTaps="always"
            >
              {(['all', ...kinds] as const).map(k => {
                const active = kindFilter === k;
                const meta   = k !== 'all' ? VAR_KIND_META[k as VarKind] : null;
                return (
                  <TouchableOpacity key={k}
                    style={[{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
                      active
                        ? meta ? { backgroundColor: meta.bg, borderColor: meta.border }
                               : { backgroundColor: '#374151', borderColor: '#374151' }
                        : { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' }]}
                    onPress={() => setKindFilter(active && k !== 'all' ? 'all' : k as VarKind | 'all')}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600',
                      color: active ? (meta ? meta.color : '#fff') : '#6b7280' }}>
                      {k === 'all' ? 'All' : VAR_KIND_META[k as VarKind].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="always">
            {showNone && (
              <TouchableOpacity
                style={[ms.row, ms.rowBorder, !selected && ms.rowActive]}
                onPress={() => { onSelect(undefined); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={[ms.radioRing, !selected && ms.radioRingActive]}>
                  {!selected && <View style={ms.radioDot} />}
                </View>
                <View style={ms.rowText}>
                  <Text style={[ms.rowLabel, !selected && ms.rowLabelActive]}>None</Text>
                  <Text style={ms.rowDesc}>Clear this output</Text>
                </View>
              </TouchableOpacity>
            )}

            {filtered.length === 0 && (
              <Text style={ms.emptyHint}>
                {search.trim() ? `No variables match "${search.trim()}".` : 'No variables available.'}
              </Text>
            )}

            {filtered.map((v, i) => {
              const active = selected === v.name;
              const kind   = varKind(v);
              const meta   = VAR_KIND_META[kind];
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[ms.row, i < filtered.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => { onSelect(v); onClose(); }}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                      <View style={{ backgroundColor: meta.bg, borderRadius: 4,
                        paddingHorizontal: 5, paddingVertical: 1,
                        borderWidth: 1, borderColor: meta.border }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: meta.color, letterSpacing: 0.3 }}>
                          {meta.label}
                        </Text>
                      </View>
                    </View>
                    {v.description ? <Text style={ms.rowDesc} numberOfLines={1}>{v.description}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {filteredContext.length > 0 && (
              <>
                <View style={{ paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb', marginTop: filtered.length > 0 ? 6 : 0 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 }}>
                    FROM {(contextLabel ?? 'CALLER PROGRAM').toUpperCase()}
                  </Text>
                </View>
                {filteredContext.map((v, i) => {
                  const active = selected === v.name;
                  const kind   = varKind(v);
                  const meta   = VAR_KIND_META[kind];
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[ms.row, i < filteredContext.length - 1 && ms.rowBorder, active && ms.rowActive]}
                      onPress={() => { onSelect(v); onClose(); }}
                      activeOpacity={0.7}
                    >
                      <View style={[ms.radioRing, active && ms.radioRingActive]}>
                        {active && <View style={ms.radioDot} />}
                      </View>
                      <View style={ms.rowText}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                          <View style={{ backgroundColor: meta.bg, borderRadius: 4,
                            paddingHorizontal: 5, paddingVertical: 1,
                            borderWidth: 1, borderColor: meta.border }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: meta.color, letterSpacing: 0.3 }}>
                              {meta.label}
                            </Text>
                          </View>
                        </View>
                        {v.description ? <Text style={ms.rowDesc} numberOfLines={1}>{v.description}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function VarSelectorButton({
  label, value, accent, placeholder, onPress, marginTop = true,
}: {
  label: string;
  value: string | undefined;
  accent: string;
  placeholder?: string;
  onPress: () => void;
  marginTop?: boolean;
}) {
  return (
    <>
      <Text style={[ms.fieldLabel, marginTop && { marginTop: 10 }]}>{label}</Text>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
          borderWidth: 1, borderColor: value ? accent : '#e5e7eb',
          borderRadius: 10, backgroundColor: '#f9fafb',
          paddingHorizontal: 12, paddingVertical: 10 }}
        onPress={onPress}
        activeOpacity={0.75}
      >
        <Text style={{ flex: 1, fontSize: 14,
          fontWeight: value ? '700' : '400',
          color: value ? accent : '#9ca3af' }}>
          {value ? `$${value}` : (placeholder ?? 'None — tap to select')}
        </Text>
        <ChevronDown size={14} color={value ? accent : '#9ca3af'} />
      </TouchableOpacity>
    </>
  );
}

// ── Step config modal ─────────────────────────────────────────────────────────

type SubPage = null | "point" | "speed" | "posOffset" | "toolOffset" | "posOverride" | "jumpHeight";

// ── SetVariable helpers ───────────────────────────────────────────────────────

const SET_VAR_OPS = ["=", "+=", "-=", "×=", "/="] as const;
type SetVarOp = typeof SET_VAR_OPS[number];

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function buildVarExpr(varName: string, op: SetVarOp, val: string): string | undefined {
  const v = val.trim();
  if (!v) return undefined;
  if (op === "=")  return v;
  if (op === "+=") return `$${varName} + ${v}`;
  if (op === "-=") return `$${varName} - ${v}`;
  if (op === "×=") return `$${varName} * ${v}`;
  if (op === "/=") return `$${varName} / ${v}`;
}

function parseVarExpr(varName: string | undefined, expr: string | undefined): { op: SetVarOp; val: string } {
  if (!expr || !varName) return { op: "=", val: "" };
  const m = expr.match(new RegExp(`^\\$${escapeRegex(varName)}\\s*([+\\-*/])\\s*(.+)$`));
  if (!m) return { op: "=", val: expr };
  const opMap: Record<string, SetVarOp> = { "+": "+=", "-": "-=", "*": "×=", "/": "/=" };
  return { op: opMap[m[1]] ?? "=", val: m[2].trim() };
}

function fmtSetVar(varName: string | undefined, expr: string | undefined): string {
  if (!varName) return "Set Variable";
  const { op, val } = parseVarExpr(varName, expr);
  return op === "=" ? `$${varName} = ${val || "?"}` : `$${varName} ${op} ${val || "?"}`;
}

// ── SetVariableFields ─────────────────────────────────────────────────────────

const OP_LABELS: Record<SetVarOp, string> = {
  "=":  "Assign — set to value",
  "+=": "Add — $var + value",
  "-=": "Subtract — $var − value",
  "×=": "Multiply — $var × value",
  "/=": "Divide — $var ÷ value",
};

function SvDropdownModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={svs.modalOverlay} onPress={onClose}>
        <Pressable style={svs.modalCard} onPress={() => {}}>
          <Text style={svs.modalTitle}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SetVariableFields({
  draft,
  variables,
  contextVariables,
  set,
  onCreateVariable,
}: {
  draft: ProgramStep;
  variables: ProgramVariable[] | undefined;
  contextVariables?: ProgramVariable[];
  set: (p: Partial<ProgramStep>) => void;
  onCreateVariable?: () => void;
}) {
  const varList = (variables ?? []).map(v => v.name);
  const contextVarList = (contextVariables ?? []).map(v => v.name);
  const initial = useMemo(() => parseVarExpr(draft.variableName, draft.variableExpr), []);
  const [op, setOp]           = useState<SetVarOp>(initial.op);
  const [rawVal, setRawVal]   = useState(initial.val);
  const [varDropOpen, setVarDropOpen] = useState(false);
  const [opDropOpen,  setOpDropOpen]  = useState(false);
  const [strVarPickerOpen, setStrVarPickerOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const prevVarCount = useRef(variables?.length ?? 0);

  useEffect(() => {
    const current = variables?.length ?? 0;
    if (pendingCreate && current > prevVarCount.current) {
      const newest = variables![current - 1];
      selectVar(newest.name);
      setPendingCreate(false);
    }
    prevVarCount.current = current;
  }, [variables]);

  const selectedVar = [...(variables ?? []), ...(contextVariables ?? [])].find(v => v.name === draft.variableName);
  const isStringVar = selectedVar?.isString === true;

  function apply(varName: string | undefined, operator: SetVarOp, value: string) {
    if (!varName) return;
    const effectiveOp: SetVarOp = isStringVar ? "=" : operator;
    set({ variableName: varName, variableExpr: buildVarExpr(varName, effectiveOp, value) });
  }

  function selectVar(name: string) {
    setVarDropOpen(false);
    const isStr = [...(variables ?? []), ...(contextVariables ?? [])].find(v => v.name === name)?.isString === true;
    const effectiveOp: SetVarOp = isStr ? "=" : op;
    set({ variableName: name, variableExpr: buildVarExpr(name, effectiveOp, rawVal) });
  }

  function selectOp(next: SetVarOp) {
    setOpDropOpen(false);
    setOp(next);
    apply(draft.variableName, next, rawVal);
  }

  function changeVal(val: string) {
    setRawVal(val);
    apply(draft.variableName, isStringVar ? "=" : op, val);
  }

  function insertStrToken(token: string) {
    const cur = rawVal.trimEnd();
    const next = cur ? `${cur}$${token}` : `$${token}`;
    setRawVal(next);
    apply(draft.variableName, "=", next);
  }

  if (varList.length === 0 && contextVarList.length === 0) {
    return (
      <Text style={ms.emptyHint}>
        No variables defined. Add variables in the Variables section of the builder.
      </Text>
    );
  }

  const preview = draft.variableName && rawVal
    ? `$${draft.variableName} = ${buildVarExpr(draft.variableName, isStringVar ? "=" : op, rawVal) ?? "?"}`
    : null;

  return (
    <>
      {/* Row 1 — Variable */}
      <Text style={ms.fieldLabel}>VARIABLE</Text>
      <TouchableOpacity style={svs.selectBtn} onPress={() => setVarDropOpen(true)} activeOpacity={0.75}>
        <Text style={[svs.selectBtnText, !draft.variableName && svs.selectBtnPlaceholder]}>
          {draft.variableName ? `$${draft.variableName}` : "Select variable…"}
        </Text>
        <ChevronDown size={14} color="#7c3aed" />
      </TouchableOpacity>

      {/* Row 2 — Operator (hidden for string vars — strings only support assign) */}
      {!isStringVar && (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OPERATION</Text>
          <TouchableOpacity style={svs.selectBtn} onPress={() => setOpDropOpen(true)} activeOpacity={0.75}>
            <Text style={svs.selectBtnText}>{op}</Text>
            <Text style={svs.selectBtnSub} numberOfLines={1}>{OP_LABELS[op]}</Text>
            <ChevronDown size={14} color="#7c3aed" />
          </TouchableOpacity>
        </>
      )}

      {/* Row 3 — Value */}
      {isStringVar ? (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>STRING VALUE</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput
              style={[ms.input, { flex: 1, color: "#ea580c" }]}
              value={rawVal}
              onChangeText={changeVal}
              placeholder="e.g.  Part A  or  Part $partId"
              placeholderTextColor="#fba67a"
              returnKeyType="done"
              autoCapitalize="none"
              autoFocus={!!draft.variableName}
            />
            {(variables ?? []).filter(v => !v.isString && !v.points && !v.values).length > 0 && (
              <TouchableOpacity
                style={{ backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 9, paddingHorizontal: 10, justifyContent: 'center', marginTop: 6 }}
                onPress={() => setStrVarPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#ea580c' }}>$var</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[ms.hintText, { marginTop: 2 }]}>
            Embed variables with <Text style={{ fontWeight: '700', color: '#ea580c' }}>$varName</Text> — replaced at runtime.
          </Text>
        </>
      ) : (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE  (number or expression)</Text>
          <TextInput
            style={[ms.input, { color: "#7c3aed" }]}
            value={rawVal}
            onChangeText={changeVal}
            placeholder="e.g.  1  or  $speed * 2"
            placeholderTextColor="#c4b5fd"
            returnKeyType="done"
            autoFocus={!!draft.variableName}
          />
        </>
      )}

      {/* Live preview */}
      {preview && <Text style={svs.preview}>{preview}</Text>}

      {/* Variable picker modal */}
      <SvDropdownModal visible={varDropOpen} onClose={() => setVarDropOpen(false)} title="Select Variable">
        {varList.map((name, i) => (
          <TouchableOpacity
            key={name}
            style={[svs.optionRow, i < varList.length - 1 && svs.optionRowBorder, name === draft.variableName && svs.optionRowActive]}
            onPress={() => selectVar(name)}
            activeOpacity={0.7}
          >
            <Text style={[svs.optionText, name === draft.variableName && svs.optionTextActive]}>${name}</Text>
            {name === draft.variableName && <Check size={15} color="#7c3aed" />}
          </TouchableOpacity>
        ))}
        {contextVarList.length > 0 && (
          <>
            <View style={{ paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb',
              marginTop: varList.length > 0 ? 4 : 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 }}>CALLER VARIABLES</Text>
            </View>
            {contextVarList.map((name, i) => (
              <TouchableOpacity
                key={`ctx_${name}`}
                style={[svs.optionRow, i < contextVarList.length - 1 && svs.optionRowBorder, name === draft.variableName && svs.optionRowActive]}
                onPress={() => selectVar(name)}
                activeOpacity={0.7}
              >
                <Text style={[svs.optionText, name === draft.variableName && svs.optionTextActive]}>${name}</Text>
                {name === draft.variableName && <Check size={15} color="#7c3aed" />}
              </TouchableOpacity>
            ))}
          </>
        )}
        {onCreateVariable && (
          <TouchableOpacity
            style={[svs.optionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb', marginTop: 4 }]}
            onPress={() => { setVarDropOpen(false); setPendingCreate(true); onCreateVariable(); }}
            activeOpacity={0.7}
          >
            <Plus size={14} color="#7c3aed" />
            <Text style={[svs.optionText, { color: '#7c3aed', marginLeft: 6 }]}>Create Variable…</Text>
          </TouchableOpacity>
        )}
      </SvDropdownModal>

      {/* Operator picker modal (numeric vars only) */}
      {!isStringVar && (
        <SvDropdownModal visible={opDropOpen} onClose={() => setOpDropOpen(false)} title="Select Operation">
          {SET_VAR_OPS.map((o, i) => (
            <TouchableOpacity
              key={o}
              style={[svs.optionRow, i < SET_VAR_OPS.length - 1 && svs.optionRowBorder, o === op && svs.optionRowActive]}
              onPress={() => selectOp(o)}
              activeOpacity={0.7}
            >
              <View style={svs.opOptionLeft}>
                <Text style={[svs.opOptionSymbol, o === op && svs.optionTextActive]}>{o}</Text>
                <Text style={svs.opOptionDesc}>{OP_LABELS[o]}</Text>
              </View>
              {o === op && <Check size={15} color="#7c3aed" />}
            </TouchableOpacity>
          ))}
        </SvDropdownModal>
      )}

      {/* String var token picker — inserts $varName into string value */}
      <VarPickerModal
        visible={strVarPickerOpen}
        onClose={() => setStrVarPickerOpen(false)}
        variables={(variables ?? []).filter(v => !v.points && !v.values)}
        contextVariables={(contextVariables ?? []).filter(v => !v.points && !v.values)}
        contextLabel="Caller Variables"
        selected={undefined}
        title="Insert Variable"
        onSelect={v => { if (v) insertStrToken(v.name); setStrVarPickerOpen(false); }}
      />
    </>
  );
}

// ── SaveImageFields ───────────────────────────────────────────────────────────

function SaveImageFields({
  draft,
  variables,
  cameras,
  set,
}: {
  draft: ProgramStep;
  variables: ProgramVariable[] | undefined;
  cameras: CameraState[];
  set: (p: Partial<ProgramStep>) => void;
}) {
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const accent = "#0891b2";

  function insertPathToken(token: string) {
    const cur = draft.saveImagePath ?? '';
    set({ saveImagePath: cur ? `${cur}${token}` : token });
  }

  return (
    <>
      <Text style={ms.hintText}>
        Save a camera snapshot to a file.{'\n'}
        Use <Text style={{ fontWeight: '700', color: '#374151' }}>$variable</Text> in the path.{' '}
        <Text style={{ fontWeight: '700', color: '#7c3aed' }}>$time_ms</Text> always holds the current Unix timestamp in ms — great for unique filenames.
      </Text>

      <Text style={[ms.fieldLabel, { marginTop: 14 }]}>CAMERA</Text>
      {cameras.length === 0 ? (
        <Text style={ms.emptyHint}>No cameras configured. Add cameras in the Camera settings.</Text>
      ) : (
        cameras.map((cam, i) => {
          const active = draft.saveImageCameraId === cam.id;
          return (
            <TouchableOpacity
              key={cam.id}
              style={[ms.row, i < cameras.length - 1 && ms.rowBorder, active && ms.rowActive]}
              onPress={() => set({ saveImageCameraId: cam.id })}
              activeOpacity={0.7}
            >
              <Camera size={14} color={active ? accent : '#6b7280'} />
              <Text style={[ms.rowLabel, { flex: 1 }, active && { color: accent }]}>{cam.name}</Text>
              {active && <Check size={14} color={accent} />}
            </TouchableOpacity>
          );
        })
      )}

      <Text style={[ms.fieldLabel, { marginTop: 14 }]}>SAVE PATH</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput
          value={draft.saveImagePath ?? ''}
          onChangeText={v => set({ saveImagePath: v })}
          placeholder="captures/$time_ms.jpg"
          placeholderTextColor="#9ca3af"
          style={[ms.input, { flex: 1, color: '#0891b2' }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {(variables ?? []).length > 0 && (
          <TouchableOpacity
            style={{ backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#7dd3fc', borderRadius: 9, paddingHorizontal: 10, justifyContent: 'center', marginTop: 6 }}
            onPress={() => setVarPickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#0891b2' }}>$var</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: '#9ca3af' }}>Quick insert:</Text>
        <TouchableOpacity
          style={{ backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#c4b5fd' }}
          onPress={() => insertPathToken('$time_ms')}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>$time_ms</Text>
        </TouchableOpacity>
      </View>
      <Text style={[ms.hintText, { marginTop: 4 }]}>
        Relative paths are from the app directory. Folders are created automatically.
      </Text>

      <VarPickerModal
        visible={varPickerOpen}
        onClose={() => setVarPickerOpen(false)}
        variables={variables ?? []}
        selected={undefined}
        title="Insert Variable"
        onSelect={v => {
          if (v) insertPathToken(`$${v.name}`);
          setVarPickerOpen(false);
        }}
      />
    </>
  );
}

function StepConfigModal({
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
  onCreateVariable?: () => void;
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
  const isAstro       = robot?.robotType === 'ASTRO';
  const [draft, setDraft]           = useState<ProgramStep | null>(null);
  const [pulseMsText, setPulseMs]   = useState("");
  const [subPage, setSubPage]       = useState<SubPage>(null);
  const [gridPointMode, setGridPointMode] = useState<'savedPoint' | 'gridPoint' | 'stackPoint' | 'varPoint'>('savedPoint');
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
  const [colorPicker, setColorPicker]     = useState<{ inspId: string; field: 'coverageVar' | 'passedVar' } | null>(null);
  const [polygonPicker, setPolygonPicker] = useState<{ inspId: string; field: keyof Omit<PolygonVisionStepOutput, 'inspectionId'> } | null>(null);
  const [arucoPicker, setArucoPicker]     = useState<{ inspId: string; field: keyof Omit<ArucoVisionStepOutput, 'inspectionId'> } | null>(null);
  const [statusVarPickerOpen, setStatusVarPickerOpen] = useState(false);
  const [waitTimeoutVarPicker,  setWaitTimeoutVarPicker]  = useState(false);
  const [loopIndexVarPicker,    setLoopIndexVarPicker]    = useState(false);
  const [forEachSourcePicker,   setForEachSourcePicker]   = useState(false);
  const [forEachValuePicker,    setForEachValuePicker]    = useState(false);

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
      setDraft({ ...step });
      setPulseMs(step.pulseMs !== undefined && step.pulseMs > 0 ? String(step.pulseMs) : "");
      setGridPointMode(step.varPointName ? 'varPoint' : step.gridPoint != null ? 'gridPoint' : step.stackPoint != null ? 'stackPoint' : 'savedPoint');
    } else {
      setDraft(null);
      setPulseMs("");
      setGridPointMode('savedPoint');
    }
    setSubPage(null);
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

  // Summary label for the override button, e.g. "Z=100"
  const overrideSummary = (() => {
    if (!hasOverride) return "None";
    const parts: string[] = [];
    (["overrideX","overrideY","overrideZ","overrideRX","overrideRY","overrideRZ"] as const).forEach(k => {
      if ((draft as any)[k] != null || draft.expressions?.[k] != null) {
        const axis = k.replace("override","");
        const val  = draft.expressions?.[k] ?? (draft as any)[k];
        parts.push(`${axis}=${val}`);
      }
    });
    return parts.join("  ");
  })();

  // ── Sub-page content ──────────────────────────────────────────────────────

  function renderSubPage() {
    switch (subPage) {
      case "point": {
        return (
          <>
            {/* Mode tabs */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {(['savedPoint', 'gridPoint', 'stackPoint', 'varPoint'] as const).map(mode => (
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
                      set({ gridPoint: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined });
                    } else if (mode === 'gridPoint') {
                      if (!draft!.gridPoint) {
                        set({ pointName: undefined, stackPoint: undefined, varPointName: undefined, varPointIndex: undefined, gridPoint: { gridId: '', rowIndex: 0, colIndex: 0, useGridIndex: false } });
                      }
                    } else if (mode === 'stackPoint') {
                      if (!draft!.stackPoint) {
                        set({ pointName: undefined, gridPoint: undefined, varPointName: undefined, varPointIndex: undefined, stackPoint: { stackId: '', index: 0 } });
                      }
                    } else {
                      set({ pointName: undefined, gridPoint: undefined, stackPoint: undefined });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: gridPointMode === mode ? '#fff' : '#374151' }}>
                    {mode === 'savedPoint' ? 'Point' : mode === 'gridPoint' ? 'Grid' : mode === 'stackPoint' ? 'Stack' : 'Var'}
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
                const ptVars = (variables ?? []).filter(v => v.points != null);
                return (
                  <>
                    <Text style={ms.fieldLabel}>VARIABLE</Text>
                    {ptVars.length === 0 && (
                      <Text style={ms.emptyHint}>No Points variables yet. Create one in the Variables section and a RunVision step will populate it at runtime.</Text>
                    )}
                    {ptVars.map((v, i) => {
                      const active = draft!.varPointName === v.name;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[ms.row, i < ptVars.length - 1 && ms.rowBorder, active && ms.rowActive]}
                          onPress={() => set({ varPointName: v.name })}
                          activeOpacity={0.7}
                        >
                          <View style={[ms.radioRing, active && ms.radioRingActive]}>
                            {active && <View style={ms.radioDot} />}
                          </View>
                          <View style={ms.rowText}>
                            <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>${v.name}</Text>
                            {!!v.description && <Text style={ms.rowDesc}>{v.description}</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INDEX EXPRESSION</Text>
                    <TextInput
                      style={ms.input}
                      value={draft!.varPointIndex ?? ""}
                      onChangeText={v => set({ varPointIndex: v || undefined })}
                      placeholder="0  or  $counter"
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="none"
                      returnKeyType="done"
                    />
                    <Text style={ms.hintText}>
                      Which element from the array to move to. Use a number or a scalar variable like $counter.
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
            {(isAstro ? ["offsetRZ"] : ["offsetRX","offsetRY","offsetRZ"] as const).map(k => (
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
            {(isAstro ? ["toolOffsetRZ"] : ["toolOffsetRX","toolOffsetRY","toolOffsetRZ"] as const).map(k => (
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
            {(isAstro ? ["overrideRZ"] : ["overrideRX","overrideRY","overrideRZ"] as const).map(k => (
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
          : (draft!.pointName ?? "Current Position");
        return (
          <>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("speed")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Override Speed</Text>
                <Text style={ms.subRowValue}>{draft!.speed != null ? `${draft!.speed} mm/s` : "Default"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("posOffset")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Position Offset</Text>
                <Text style={ms.subRowValue}>{hasOffset ? "Set" : "None"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("posOverride")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Position Override</Text>
                <Text style={ms.subRowValue} numberOfLines={1}>{overrideSummary}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={[ms.subRow, { borderBottomWidth: 0 }]} onPress={() => setSubPage("toolOffset")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Tool Offset</Text>
                <Text style={ms.subRowValue}>{hasToolOff ? "Set" : "None"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
          </>
        );
      }

      case "JumpL":
      case "JumpJ": {
        const pointLabel = draft!.gridPoint
          ? `Grid → ${grids.find(g => g.id === draft!.gridPoint!.gridId)?.name ?? 'Unknown'}`
          : draft!.stackPoint
          ? `Stack → ${stacks.find(s => s.id === draft!.stackPoint!.stackId)?.name ?? 'Unknown'}`
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
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{pointLabel}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("jumpHeight")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Jump Height</Text>
                <Text style={ms.subRowValue}>{jumpHeightLabel}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("speed")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Override Speed</Text>
                <Text style={ms.subRowValue}>{draft!.speed != null ? `${draft!.speed} mm/s` : "Default"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("posOffset")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Position Offset</Text>
                <Text style={ms.subRowValue}>{hasOffset ? "Set" : "None"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("posOverride")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Position Override</Text>
                <Text style={ms.subRowValue} numberOfLines={1}>{overrideSummary}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={[ms.subRow, { borderBottomWidth: 0 }]} onPress={() => setSubPage("toolOffset")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Tool Offset</Text>
                <Text style={ms.subRowValue}>{hasToolOff ? "Set" : "None"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
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
        const scalarVars = (variables ?? []).filter(v => !v.values && !v.points && !v.isStopwatch);
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
        const listPointVars  = (variables ?? []).filter(v => v.values || v.points);
        const scalarVarsLoop = (variables ?? []).filter(v => !v.values && !v.points && !v.isStopwatch);
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
                {listPointVars.length === 0
                  ? <Text style={ms.emptyHint}>No list or points variables defined yet.</Text>
                  : (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600", marginRight: 6 }}>$</Text>
                      <TouchableOpacity
                        style={[ms.input, { flex: 1, justifyContent: "center" }]}
                        onPress={() => setForEachSourcePicker(true)} activeOpacity={0.7}>
                        <Text style={{ color: draft!.forEachVariableName ? "#1e293b" : "#9ca3af", fontSize: 14 }}>
                          {draft!.forEachVariableName ?? "select list or points variable"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                }
                <VarPickerModal
                  visible={forEachSourcePicker}
                  onClose={() => setForEachSourcePicker(false)}
                  variables={listPointVars}
                  selected={draft!.forEachVariableName}
                  onSelect={v => { set({ forEachVariableName: v?.name }); setForEachSourcePicker(false); }}
                  title="Source Variable"
                />

                {scalarVarsLoop.length > 0 && (
                  <>
                    <Text style={[ms.fieldLabel, { marginTop: 14 }]}>VALUE VARIABLE  (optional)</Text>
                    <Text style={ms.hintText}>Receives the current element (list) or index (points) each iteration.</Text>
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
            <TextInput style={ms.input} value={msgValue}
              onChangeText={v => set({ [msgField]: v || undefined })}
              placeholder={hasVars ? "e.g. Processing item $i of $total…" : "e.g. Picking part from tray…"}
              placeholderTextColor="#c4c4c4" returnKeyType="done" autoFocus />
            {hasVars && (
              <TouchableOpacity
                onPress={() => setStatusVarPickerOpen(true)}
                activeOpacity={0.7}
                style={{ marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#7c3aed' }}>+ insert variable</Text>
              </TouchableOpacity>
            )}
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
              <Text style={ms.emptyHint}>No routines saved yet. Create one from the Routines page.</Text>
            )}
            {routines.map((r, i) => {
              const active = draft!.routineName === r.name;
              return (
                <TouchableOpacity
                  key={r.name}
                  style={[ms.row, i < routines.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ routineName: r.name })}
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
                  const out = getColorOutput(insp.id);
                  return (
                    <View key={insp.id} style={{ marginTop: 10, backgroundColor: "#fdf4ff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#e9d5ff" }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 }}>{insp.name}</Text>
                      <VarSelectorButton
                        label="COVERAGE %"
                        value={out?.coverageVar}
                        accent="#7c3aed"
                        placeholder="None — tap to assign"
                        marginTop={false}
                        onPress={() => setColorPicker({ inspId: insp.id, field: 'coverageVar' })}
                      />
                      <VarSelectorButton
                        label="PASSED"
                        value={out?.passedVar}
                        accent="#16a34a"
                        placeholder="None — tap to assign"
                        onPress={() => setColorPicker({ inspId: insp.id, field: 'passedVar' })}
                      />
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

  // Color inspection picker
  const colorPickerVars = colorPicker
    ? (variables ?? []).filter(v => v.points == null && v.values == null)
    : [];
  const colorPickerSelected = colorPicker
    ? (draft?.colorOutputs ?? []).find(o => o.inspectionId === colorPicker.inspId)?.[colorPicker.field]
    : undefined;
  const colorPickerTitle = colorPicker?.field === 'passedVar' ? 'Passed Variable' : 'Coverage Variable';

  // Polygon inspection picker
  const polygonPickerVars     = polygonPicker ? (variables ?? []).filter(v => v.points == null && v.values == null) : [];
  const polygonPickerSelected = polygonPicker
    ? (draft?.polygonOutputs ?? []).find(o => o.inspectionId === polygonPicker.inspId)?.[polygonPicker.field]
    : undefined;
  const polygonPickerTitle = polygonPicker
    ? ({ foundVar: 'Found Variable', countVar: 'Count Variable', angleVar: 'Angle Variable', centerXVar: 'Center X Variable', centerYVar: 'Center Y Variable' }[polygonPicker.field] ?? 'Variable')
    : '';

  // ArUco inspection picker
  const arucoPickerVars     = arucoPicker ? (variables ?? []).filter(v => v.points == null && v.values == null) : [];
  const arucoPickerSelected = arucoPicker
    ? (draft?.arucoOutputs ?? []).find(o => o.inspectionId === arucoPicker.inspId)?.[arucoPicker.field]
    : undefined;
  const arucoPickerTitle = arucoPicker
    ? ({ foundVar: 'Found Variable', countVar: 'Count Variable', firstIdVar: 'First Marker ID Variable', firstCenterXVar: 'First Center X Variable', firstCenterYVar: 'First Center Y Variable' }[arucoPicker.field] ?? 'Variable')
    : '';

  // Derive picker variable list from the active field
  const pickerVars = visionPicker
    ? visionPicker.field === 'pointsVar'
      ? (variables ?? []).filter(v => v.points != null)
      : (variables ?? []).filter(v => v.points == null && v.values == null)
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
        <Pressable style={ms.overlay} onPress={() => subPage ? setSubPage(null) : onClose()}>
          <Pressable style={ms.card} onPress={() => {}}>
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
                      <TextInput style={[ms.input, { marginBottom: 14 }]}
                        value={draft!.statusMessage ?? ""} onChangeText={v => set({ statusMessage: v || undefined })}
                        placeholder="Shown in monitor while this step runs" placeholderTextColor="#c4c4c4"
                        returnKeyType="next" />
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
          </Pressable>
        </Pressable>
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

    <VarPickerModal
      visible={zoneVarPickerOpen}
      onClose={() => setZoneVarPickerOpen(false)}
      variables={(variables ?? []).filter(v => !v.points && !v.values)}
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
    <VarPickerModal
      visible={statusVarPickerOpen}
      onClose={() => setStatusVarPickerOpen(false)}
      variables={variables ?? []}
      selected={undefined}
      title="Insert Variable"
      onSelect={v => {
        if (!v || !draft) return;
        const severity: 'Info' | 'Warning' | 'Error' =
          draft.statusSeverity ?? (draft.statusWarning ? 'Warning' : draft.statusError ? 'Error' : 'Info');
        const msgField =
          severity === 'Warning' ? 'statusWarning' :
          severity === 'Error'   ? 'statusError'   : 'statusMessage';
        const cur = (draft[msgField] ?? '').trimEnd();
        set({ [msgField]: (cur ? cur + ' ' : '') + '$' + v.name });
      }}
    />
    </>
  );
}

// ── IfCondition expanded body ─────────────────────────────────────────────────

const ifStyles = StyleSheet.create({
  branchCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  branchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  branchCardHeaderTap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  branchCardBody: {
    padding: 10,
  },
  branchBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
  },
  branchLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  condSummary: { flex: 1, fontSize: 12, color: '#6b7280' },
  branchControlRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb',
  },
  branchControlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 6, backgroundColor: '#f3f4f6',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  branchControlText: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.3 },
});

function IfConditionBody({
  step,
  onEnterScope,
  onUpdateIfCondition,
  variables,
  contextVariables,
}: {
  step: ProgramStep;
  onEnterScope: (frame: ScopeFrame) => void;
  onUpdateIfCondition: (updated: ProgramStep) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const theme          = STEP_THEME['IfCondition'] ?? STEP_THEME['MoveL'];
  const ifSteps        = step.ifSteps        ?? [];
  const elseIfBranches = step.elseIfBranches ?? [];
  const elseSteps      = step.elseSteps === null ? [] : step.elseSteps;

  const [editingKey, setEditingKey]         = useState<null | 'if' | string>(null);
  const [draftCondition, setDraftCondition] = useState<ConditionGroup | null>(null);

  function openConditionEditor(key: 'if' | string) {
    const cond = key === 'if'
      ? (step.condition ?? { combinator: 'ALL' as const, items: [] })
      : (elseIfBranches.find(b => b.id === key)?.condition ?? { combinator: 'ALL' as const, items: [] });
    setDraftCondition({ ...cond, items: [...(cond.items ?? [])] });
    setEditingKey(key);
  }

  function saveCondition() {
    if (!editingKey || !draftCondition) return;
    if (editingKey === 'if') {
      onUpdateIfCondition({ ...step, condition: draftCondition });
    } else {
      onUpdateIfCondition({
        ...step,
        elseIfBranches: elseIfBranches.map(b =>
          b.id === editingKey ? { ...b, condition: draftCondition } : b
        ),
      });
    }
    setEditingKey(null);
    setDraftCondition(null);
  }

  return (
    <View style={[styles.loopCardBody, { borderTopColor: theme.accent + '40' }]}>

      {/* Condition editing modal */}
      <Modal visible={editingKey !== null} transparent animationType="fade" onRequestClose={() => setEditingKey(null)}>
        <Pressable style={ms.overlay} onPress={() => setEditingKey(null)}>
          <Pressable style={ms.card} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>Edit Condition</Text>
              <TouchableOpacity onPress={() => setEditingKey(null)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}>
              {draftCondition && (
                <ConditionGroupEditor group={draftCondition} onChange={setDraftCondition} variables={variables} contextVariables={contextVariables} />
              )}
            </ScrollView>
            <View style={ms.actions}>
              <TouchableOpacity style={ms.saveBtn} onPress={saveCondition} activeOpacity={0.7}>
                <Check size={15} color="white" />
                <Text style={ms.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ gap: 6, padding: 10 }}>
        {/* IF branch */}
        <View style={[ifStyles.branchCard, { borderColor: '#bae6fd', backgroundColor: '#f0f9ff' }]}>
          <TouchableOpacity
            style={[ifStyles.branchCardHeader, { backgroundColor: '#e0f2fe' }]}
            onPress={() => openConditionEditor('if')} activeOpacity={0.7}>
            <View style={[ifStyles.branchBadge, { backgroundColor: '#0891b2' }]}>
              <Text style={[ifStyles.branchLabel, { color: '#fff' }]}>IF</Text>
            </View>
            <Text style={ifStyles.condSummary} numberOfLines={1}>{conditionSummary(step.condition)}</Text>
            <Pencil size={13} color="#c4b5fd" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
            onPress={() => onEnterScope({ kind: 'ifTrue', stepId: step.id, label: 'IF' })}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 12, color: "#64748b" }}>{ifSteps.length} step{ifSteps.length !== 1 ? "s" : ""}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#0891b2" }}>Enter</Text>
              <ArrowRight size={13} color="#0891b2" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ELSE IF branches */}
        {elseIfBranches.map((branch, idx) => (
          <View key={branch.id} style={[ifStyles.branchCard, { borderColor: '#ddd6fe', backgroundColor: '#faf5ff' }]}>
            <View style={[ifStyles.branchCardHeader, { backgroundColor: '#ede9fe' }]}>
              <TouchableOpacity style={ifStyles.branchCardHeaderTap} onPress={() => openConditionEditor(branch.id)} activeOpacity={0.7}>
                <View style={[ifStyles.branchBadge, { backgroundColor: '#7c3aed' }]}>
                  <Text style={[ifStyles.branchLabel, { color: '#fff' }]}>ELSE IF</Text>
                </View>
                <Text style={ifStyles.condSummary} numberOfLines={1}>{conditionSummary(branch.condition)}</Text>
                <Pencil size={13} color="#c4b5fd" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert("Delete Branch", "Remove this ELSE IF branch and its steps?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => onUpdateIfCondition({ ...step, elseIfBranches: elseIfBranches.filter(b => b.id !== branch.id) }) },
                ])}
                hitSlop={8} activeOpacity={0.7}>
                <X size={13} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={() => onEnterScope({ kind: 'elseIf', stepId: step.id, label: `ELSE IF ${idx + 1}`, branchId: branch.id })}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: "#64748b" }}>{(branch.steps ?? []).length} step{(branch.steps ?? []).length !== 1 ? "s" : ""}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#7c3aed" }}>Enter</Text>
                <ArrowRight size={13} color="#7c3aed" />
              </View>
            </TouchableOpacity>
          </View>
        ))}

        {/* ELSE branch */}
        {elseSteps !== undefined && (
          <View style={[ifStyles.branchCard, { borderColor: '#d1d5db', backgroundColor: '#f9fafb' }]}>
            <View style={[ifStyles.branchCardHeader, { backgroundColor: '#f3f4f6' }]}>
              <View style={[ifStyles.branchBadge, { backgroundColor: '#6b7280' }]}>
                <Text style={[ifStyles.branchLabel, { color: '#fff' }]}>ELSE</Text>
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => Alert.alert("Delete Branch", "Remove the ELSE branch and its steps?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => onUpdateIfCondition({ ...step, elseSteps: undefined }) },
                ])}
                hitSlop={8} activeOpacity={0.7}>
                <X size={13} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={() => onEnterScope({ kind: 'else', stepId: step.id, label: 'ELSE' })}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: "#64748b" }}>{(elseSteps ?? []).length} step{(elseSteps ?? []).length !== 1 ? "s" : ""}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#6b7280" }}>Enter</Text>
                <ArrowRight size={13} color="#6b7280" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Branch controls */}
        <View style={ifStyles.branchControlRow}>
          <TouchableOpacity
            style={ifStyles.branchControlBtn}
            onPress={() => onUpdateIfCondition({
              ...step,
              elseIfBranches: [...elseIfBranches, { id: newId(), condition: { combinator: 'ALL', items: [] }, steps: [] }],
            })}
            activeOpacity={0.7}>
            <Plus size={11} color="#6b7280" />
            <Text style={ifStyles.branchControlText}>ELSE IF</Text>
          </TouchableOpacity>
          {elseSteps === undefined && (
            <TouchableOpacity
              style={ifStyles.branchControlBtn}
              onPress={() => onUpdateIfCondition({ ...step, elseSteps: [] })}
              activeOpacity={0.7}>
              <Plus size={11} color="#6b7280" />
              <Text style={ifStyles.branchControlText}>ELSE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}


// ── Insert divider ────────────────────────────────────────────────────────────

function InsertDivider({
  onPress,
  onPaste,
  inner,
  disabled,
}: {
  onPress: () => void;
  onPaste?: () => void;
  inner?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.insertDivider, inner && styles.insertDividerInner]}>
      <View style={styles.insertLine} />
      <TouchableOpacity onPress={disabled ? undefined : onPress} activeOpacity={disabled ? 1 : 0.6} hitSlop={4} disabled={disabled}>
        <View style={styles.insertBtn}>
          <Plus size={10} color={disabled ? "#d1d5db" : "#2563eb"} />
        </View>
      </TouchableOpacity>
      {onPaste && (
        <TouchableOpacity onPress={disabled ? undefined : onPaste} activeOpacity={disabled ? 1 : 0.6} hitSlop={4} disabled={disabled}>
          <View style={styles.insertPasteBtn}>
            <ClipboardPaste size={10} color={disabled ? "#d1d5db" : "#7c3aed"} />
          </View>
        </TouchableOpacity>
      )}
      <View style={styles.insertLine} />
    </View>
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function DragHandle({
  stepId,
  onStart,
  onMove,
  onEnd,
}: {
  stepId: string;
  onStart: (id: string) => void;
  onMove: (id: string, dy: number, absY: number) => void;
  onEnd: (id: string) => void;
}) {
  const sidRef   = useRef(stepId);
  const startRef = useRef(onStart);
  const moveRef  = useRef(onMove);
  const endRef   = useRef(onEnd);
  sidRef.current   = stepId;
  startRef.current = onStart;
  moveRef.current  = onMove;
  endRef.current   = onEnd;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:     ()       => startRef.current(sidRef.current),
      onPanResponderMove:      (_, gs)  => moveRef.current(sidRef.current, gs.dy, gs.moveY),
      onPanResponderRelease:   ()       => endRef.current(sidRef.current),
      onPanResponderTerminate: ()       => endRef.current(sidRef.current),
    })
  ).current;

  return (
    <View {...responder.panHandlers} style={styles.dragHandle} hitSlop={6}>
      <GripVertical size={16} color="#d1d5db" />
    </View>
  );
}

// ── Top-level step card ────────────────────────────────────────────────────────

function StepRow({
  step,
  index,
  isLast,
  isBeingDragged,
  isDropAbove,
  isDropBelow,
  isDragging,
  onEdit,
  onCopy,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onInsertAfter,
  onPasteAfter,
  onEnterScope,
  onUpdateIfCondition,
  onItemLayout,
  variables,
  contextVariables,
  onEnterRoutine,
}: {
  step: ProgramStep;
  index: number;
  isLast: boolean;
  isBeingDragged: boolean;
  isDropAbove: boolean;
  isDropBelow: boolean;
  isDragging: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, dy: number, absY: number) => void;
  onDragEnd: (id: string) => void;
  onInsertAfter: () => void;
  onPasteAfter?: () => void;
  onEnterScope: (frame: ScopeFrame) => void;
  onUpdateIfCondition: (updated: ProgramStep) => void;
  onItemLayout: (id: string, height: number) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onEnterRoutine?: (routineName: string) => void;
}) {
  const isLoop        = step.type === "Loop";
  const isIfCondition = step.type === "IfCondition";
  const isSetSpeed    = step.type === "SetSpeedL" || step.type === "SetSpeedJ"
                     || step.type === "Label"      || step.type === "GoToLabel";
  const isMoveStep    = step.type === "MoveL"  || step.type === "MoveJ"
                     || step.type === "JumpL"  || step.type === "JumpJ"
                     || step.type === "SetOutput";
  const innerSteps    = step.loopSteps ?? [];
  const theme         = STEP_THEME[step.type] ?? STEP_THEME["MoveL"];
  const detail        = stepDetail(step);
  const detailLines   = detail ? detail.split('\n') : [];

  return (
    <View
      onLayout={e => onItemLayout(step.id, e.nativeEvent.layout.height)}
      style={[
        isBeingDragged && styles.draggingItem,
        isDropAbove    && styles.dropTargetItemTop,
        isDropBelow    && styles.dropTargetItemBottom,
      ]}
    >
      <View style={[styles.stepCard, { borderLeftColor: theme.accent }]}>

        {/* Card header row */}
        <TouchableOpacity style={styles.stepCardHeader} onPress={onEdit} activeOpacity={0.75}>
          <DragHandle stepId={step.id} onStart={onDragStart} onMove={onDragMove} onEnd={onDragEnd} />

          <View style={[styles.stepCardIcon, { backgroundColor: theme.iconBg }]}>
            <StepIcon type={step.type} size={18} color={theme.iconColor} />
          </View>

          <View style={styles.stepCardText}>
            <Text style={[styles.stepCardType, { color: theme.accent }]}>
              {index + 1} · {theme.label.toUpperCase()}
            </Text>
            {(!isSetSpeed || !!step.name) && (
              <Text style={styles.stepCardName} numberOfLines={1}>
                {step.name || (isMoveStep ? (detailLines[0] ?? step.type) : (detail ?? step.type))}
              </Text>
            )}
            {isSetSpeed && detailLines.map((line, i) => (
              <Text key={i} style={styles.stepCardDetail}>{line}</Text>
            ))}
            {isMoveStep && (step.name ? detailLines : detailLines.slice(1)).map((line, i) => (
              <Text key={i} style={styles.stepCardDetail} numberOfLines={1}>{line}</Text>
            ))}
            {!isSetSpeed && !isMoveStep && !!step.name && detail && (
              <Text style={styles.stepCardDetail} numberOfLines={1}>{detail}</Text>
            )}
            {step.statusMessage && !step.name && step.type !== "StatusUpdate" && (
              <Text style={styles.stepCardStatus} numberOfLines={1}>{step.statusMessage}</Text>
            )}
          </View>

          <TouchableOpacity onPress={onCopy}   hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
            <Copy   size={15} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
            <Trash2 size={15} color="#ef4444" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* If Condition body — branch navigation */}
        {isIfCondition && (
          <IfConditionBody
            step={step}
            onEnterScope={onEnterScope}
            onUpdateIfCondition={onUpdateIfCondition}
            variables={variables}
            contextVariables={contextVariables}
          />
        )}

        {/* CallRoutine body — Enter navigation */}
        {step.type === 'CallRoutine' && step.routineName && onEnterRoutine && (
          <View style={[styles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => onEnterRoutine(step.routineName!)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: "#64748b" }}>{step.routineName}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.iconColor }}>Enter</Text>
                <ArrowRight size={13} color={theme.iconColor} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Loop body — Enter navigation */}
        {isLoop && (
          <View style={[styles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => onEnterScope({ kind: 'loop', stepId: step.id, label: stepLabel(step) })}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: "#64748b" }}>
                {innerSteps.length} step{innerSteps.length !== 1 ? "s" : ""} inside
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.iconColor }}>Enter</Text>
                <ArrowRight size={13} color={theme.iconColor} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Insert divider between steps */}
      {!isLast && (
        <InsertDivider onPress={onInsertAfter} onPaste={onPasteAfter} disabled={isDragging} />
      )}
    </View>
  );
}

// ── Variable edit modal ───────────────────────────────────────────────────────

function VariableEditModal({
  visible,
  variable,
  onSave,
  onClose,
}: {
  visible: boolean;
  variable: ProgramVariable | null;
  onSave: (v: ProgramVariable) => void;
  onClose: () => void;
}) {
  const [name,       setName]       = useState("");
  const [value,      setValue]      = useState("0");
  const [stringVal,  setStringVal]  = useState("");
  const [desc,       setDesc]       = useState("");
  const [varType,    setVarType]    = useState<'number' | 'boolean' | 'list' | 'points' | 'stopwatch' | 'string'>('number');
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [listValues, setListValues] = useState<string[]>(["0"]);
  const [isGlobal,          setIsGlobal]          = useState(false);
  const [displayOnMonitor,  setDisplayOnMonitor]  = useState(false);
  const [isPersistent,      setIsPersistent]      = useState(false);

  useEffect(() => {
    if (variable) {
      setName(variable.name);
      setDesc(variable.description ?? "");
      setIsGlobal(variable.isGlobal ?? false);
      setDisplayOnMonitor(variable.displayOnMonitor ?? false);
      setIsPersistent(variable.isPersistent ?? false);
      if (variable.points != null) {
        setVarType('points');
        setValue("0"); setStringVal(""); setListValues(["0"]);
      } else if (variable.values != null && variable.values.length > 0) {
        setVarType('list');
        setListValues(variable.values.map(String));
        setValue("0"); setStringVal("");
      } else if (variable.isBoolean) {
        setVarType('boolean');
        setValue(variable.value !== 0 ? "1" : "0");
        setStringVal(""); setListValues(["0"]);
      } else if (variable.isStopwatch) {
        setVarType('stopwatch');
        setValue("0"); setStringVal(""); setListValues(["0"]);
      } else if (variable.isString) {
        setVarType('string');
        setStringVal(variable.stringValue ?? "");
        setValue("0"); setListValues(["0"]);
      } else {
        setVarType('number');
        setValue(String(variable.value));
        setStringVal(""); setListValues(["0"]);
      }
    } else {
      setName(""); setValue("0"); setStringVal(""); setDesc(""); setVarType('number'); setListValues(["0"]); setIsGlobal(false); setDisplayOnMonitor(false); setIsPersistent(false);
    }
  }, [variable, visible]);

  const isNew   = variable === null;
  const canSave = name.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim());

  function updateListItem(index: number, raw: string) {
    if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
      setListValues(prev => prev.map((v, i) => i === index ? raw : v));
    }
  }

  function addListItem() {
    setListValues(prev => [...prev, "0"]);
  }

  function removeListItem(index: number) {
    setListValues(prev => prev.filter((_, i) => i !== index));
  }

  const refLabel = varType === 'points'
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0891b2", fontWeight: "600" }}>${name.trim() || "name"}[0].x</Text> in expressions. Populated at runtime by RunVision steps.</Text>
    : varType === 'list'
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}[0]</Text> in expressions.</Text>
    : varType === 'boolean'
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#16a34a", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions. <Text style={{ fontWeight: "600" }}>True = 1, False = 0.</Text></Text>
    : varType === 'stopwatch'
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0891b2", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions. Value is elapsed milliseconds.</Text>
    : varType === 'string'
    ? <Text style={ms.hintText}>Use <Text style={{ color: "#ea580c", fontWeight: "600" }}>${name.trim() || "name"}</Text> in StatusUpdate messages or string expressions. Supports <Text style={{ fontWeight: "600" }}>$otherVar</Text> interpolation in values.</Text>
    : <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions.</Text>;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.card} onPress={() => {}}>
          <View style={ms.header}>
            <View style={{ width: 18 }} />
            <Text style={ms.title}>{isNew ? "New Variable" : "Edit Variable"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Text style={ms.fieldLabel}>NAME</Text>
          <TextInput
            style={ms.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. speed, pickHeight, counter"
            placeholderTextColor="#9ca3af"
            autoFocus={isNew}
            autoCapitalize="none"
            returnKeyType="next"
          />
          {name.trim().length > 0 && !canSave && (
            <Text style={ms.fieldError}>Use letters, digits, and _ only. Must start with a letter.</Text>
          )}

          {/* Type dropdown */}
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>TYPE</Text>
          {(() => {
            const TYPE_OPTIONS: { key: typeof varType; label: string; color: string; bg: string; border: string }[] = [
              { key: 'number',    label: 'Number',    color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
              { key: 'boolean',   label: 'Boolean',   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
              { key: 'string',    label: 'String',    color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
              { key: 'list',      label: 'List',      color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
              { key: 'points',    label: 'Points',    color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
              { key: 'stopwatch', label: 'Stopwatch', color: '#0891b2', bg: '#e0f2fe', border: '#7dd3fc' },
            ];
            const selected = TYPE_OPTIONS.find(o => o.key === varType)!;
            return (
              <View style={{ marginBottom: 4 }}>
                <TouchableOpacity
                  onPress={() => setTypePickerOpen(v => !v)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    borderWidth: 1, borderColor: selected.border, borderRadius: 10,
                    backgroundColor: selected.bg, paddingHorizontal: 14, paddingVertical: 11,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: selected.color }}>{selected.label}</Text>
                  <ChevronDown size={16} color={selected.color} style={{ transform: [{ rotate: typePickerOpen ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>

                {typePickerOpen && (
                  <View style={{
                    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
                    backgroundColor: "#fff", marginTop: 4,
                    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
                    overflow: "hidden",
                  }}>
                    {TYPE_OPTIONS.map((opt, i) => (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => {
                          if (opt.key === 'boolean' && value !== "0" && value !== "1") setValue("0");
                          setVarType(opt.key as typeof varType);
                          setTypePickerOpen(false);
                        }}
                        activeOpacity={0.7}
                        style={[
                          { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                            paddingHorizontal: 14, paddingVertical: 12 },
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f3f4f6" },
                          varType === opt.key && { backgroundColor: opt.bg },
                        ]}
                      >
                        <Text style={{ fontSize: 14, fontWeight: varType === opt.key ? "700" : "500",
                          color: varType === opt.key ? opt.color : "#374151" }}>
                          {opt.label}
                        </Text>
                        {varType === opt.key && <Check size={15} color={opt.color} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })()}
          {refLabel}

          {varType === 'number' ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              <TextInput
                style={ms.input}
                value={value}
                onChangeText={v => { if (v === "" || /^-?\d*\.?\d*$/.test(v)) setValue(v); }}
                keyboardType="numbers-and-punctuation"
                selectTextOnFocus
              />
            </>
          ) : varType === 'boolean' ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                {([{ label: "False  (0)", v: "0" }, { label: "True  (1)", v: "1" }] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.v}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                      borderWidth: 1.5,
                      borderColor: value === opt.v ? "#16a34a" : "#e5e7eb",
                      backgroundColor: value === opt.v ? "#f0fdf4" : "#f9fafb" }]}
                    onPress={() => setValue(opt.v)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: value === opt.v ? "#16a34a" : "#6b7280" }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : varType === 'list' ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUES</Text>
              {listValues.map((v, idx) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: "#9ca3af", width: 22, textAlign: "right" }}>{idx}</Text>
                  <TextInput
                    style={[ms.input, { flex: 1, marginBottom: 0 }]}
                    value={v}
                    onChangeText={raw => updateListItem(idx, raw)}
                    keyboardType="numbers-and-punctuation"
                    selectTextOnFocus
                  />
                  <TouchableOpacity onPress={() => removeListItem(idx)} hitSlop={8} activeOpacity={0.7}>
                    <X size={15} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, paddingVertical: 6 }}
                onPress={addListItem}
                activeOpacity={0.7}
              >
                <Plus size={14} color="#7c3aed" />
                <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600" }}>Add item</Text>
              </TouchableOpacity>
            </>
          ) : varType === 'stopwatch' ? (
            <View style={{ backgroundColor: "#e0f2fe", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#7dd3fc" }}>
              <Text style={{ fontSize: 13, color: "#0369a1", lineHeight: 18 }}>
                This variable holds elapsed milliseconds. Use <Text style={{ fontWeight: "700" }}>StopwatchControl</Text> steps to Start, Stop, and Reset it.
              </Text>
              <Text style={{ fontSize: 12, color: "#0891b2", marginTop: 6 }}>
                Use <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}</Text> in expressions to read the elapsed time in ms.
              </Text>
            </View>
          ) : varType === 'string' ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              <TextInput
                style={ms.input}
                value={stringVal}
                onChangeText={setStringVal}
                placeholder="e.g.  Part A  or  Hello $partId"
                placeholderTextColor="#fba67a"
                autoCapitalize="none"
              />
              <Text style={[ms.hintText, { marginTop: 2 }]}>
                Use <Text style={{ fontWeight: "700", color: "#ea580c" }}>$varName</Text> inside the value to embed other variable values at runtime.
              </Text>
            </>
          ) : (
            <View style={{ backgroundColor: "#ecfeff", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#a5f3fc" }}>
              <Text style={{ fontSize: 13, color: "#0e7490", lineHeight: 18 }}>
                This variable will hold an array of detected blob positions (x, y, z, rx, ry, rz). It starts empty and is populated at runtime by a <Text style={{ fontWeight: "700" }}>RunVision</Text> step.
              </Text>
              <Text style={{ fontSize: 12, color: "#0891b2", marginTop: 6 }}>
                Use <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}[0].x</Text> in expression fields to read blob coordinates.
              </Text>
            </View>
          )}

          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DESCRIPTION  (optional)</Text>
          <TextInput
            style={ms.input}
            value={desc}
            onChangeText={setDesc}
            placeholder="What this variable controls…"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
          />

          {(varType === 'number' || varType === 'boolean' || varType === 'stopwatch' || varType === 'string') && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Show on Monitor</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Display the live value on the program detail page while running.
                  </Text>
                </View>
                <Switch
                  value={displayOnMonitor}
                  onValueChange={setDisplayOnMonitor}
                  trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Global Variable</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Shared across all programs running at the same time. First program to start sets the initial value.
                  </Text>
                </View>
                <Switch
                  value={isGlobal}
                  onValueChange={setIsGlobal}
                  trackColor={{ false: "#e5e7eb", true: "#16a34a" }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Persistent</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Value is saved to disk when the program finishes and restored on the next run.
                  </Text>
                </View>
                <Switch
                  value={isPersistent}
                  onValueChange={setIsPersistent}
                  trackColor={{ false: "#e5e7eb", true: "#7c3aed" }}
                />
              </View>
            </>
          )}

          </ScrollView>
          <View style={[ms.actions, { marginTop: 16 }]}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={ms.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.saveBtn, !canSave && { opacity: 0.4 }]}
              onPress={() => {
                if (!canSave) return;
                onSave({
                  id: variable?.id ?? newId(),
                  name: name.trim(),
                  value: (varType === 'number' || varType === 'boolean' || varType === 'stopwatch') ? (parseFloat(value) || 0) : 0,
                  values: varType === 'list' ? listValues.map(v => parseFloat(v) || 0) : undefined,
                  points: varType === 'points' ? (variable?.points ?? []) : undefined,
                  isBoolean:   varType === 'boolean'   ? true : undefined,
                  isStopwatch: varType === 'stopwatch' ? true : undefined,
                  isString:    varType === 'string'    ? true : undefined,
                  stringValue: varType === 'string'    ? stringVal : undefined,
                  isGlobal:        (varType === 'number' || varType === 'boolean' || varType === 'stopwatch' || varType === 'string') ? (isGlobal        || undefined) : undefined,
                  displayOnMonitor:(varType === 'number' || varType === 'boolean' || varType === 'stopwatch' || varType === 'string') ? (displayOnMonitor || undefined) : undefined,
                  isPersistent:    (varType === 'number' || varType === 'boolean' || varType === 'string') ? (isPersistent || undefined) : undefined,
                  description: desc.trim() || undefined,
                });
                onClose();
              }}
              activeOpacity={0.7}
              disabled={!canSave}
            >
              <Check size={15} color="white" />
              <Text style={ms.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Builder screen ────────────────────────────────────────────────────────────

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

// ── Modal styles ──────────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start", alignItems: "center",
    paddingTop: 52, paddingHorizontal: 24,
  },
  card: {
    width: "100%", maxWidth: 360, maxHeight: "88%",
    backgroundColor: "#fff", borderRadius: 18,
    paddingTop: 20, paddingHorizontal: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111" },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  rowActive: { backgroundColor: "#f0f9ff" },
  iconTile: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center",
  },
  rowText:        { flex: 1 },
  rowLabel:       { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowLabelActive: { color: "#2563eb" },
  rowDesc:        { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  radioRing: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#d1d5db",
    justifyContent: "center", alignItems: "center",
  },
  radioRingActive: { borderColor: "#2563eb" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },

  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.6 },
  input: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#111827", marginTop: 6,
  },
  emptyHint: { fontSize: 13, color: "#9ca3af", paddingVertical: 8, textAlign: "center" },
  hintText:   { fontSize: 12, color: "#9ca3af", marginTop: 8, lineHeight: 16 },
  fieldError: { fontSize: 12, color: "#dc2626", marginTop: 6 },

  typeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", marginTop: 6,
  },
  typeBtnActive:     { borderColor: "#7c3aed", backgroundColor: "#f5f3ff" },
  typeBtnText:       { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  typeBtnTextActive: { color: "#7c3aed" },

  // Two-column layout for accel/decel
  twoCol:     { flexDirection: "row", gap: 10 },
  twoColItem: { flex: 1 },

  segRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  seg: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center",
  },
  segActive:     { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  segText:       { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  segTextActive: { color: "#2563eb" },

  switchRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  switchLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },

  actions: {
    flexDirection: "row", gap: 10, marginTop: 16,
    paddingTop: 14, paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center",
  },
  cancelText: { fontSize: 15, color: "#6b7280", fontWeight: "600" },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13,
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Optional status section
  optStatusWrap: {
    marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  optStatusToggle: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 12,
  },
  optStatusToggleText: { flex: 1, fontSize: 13, color: "#6b7280", fontWeight: "600" },
  optStatusBody: { paddingBottom: 4 },

  // Sub-row navigation buttons (used on move step main page)
  subRowCard: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb",
    borderRadius: 12, overflow: "hidden", marginTop: 8,
  },
  subRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  subRowLeft: { flex: 1 },
  subRowLabel: { fontSize: 14, fontWeight: "600", color: "#111827" },
  subRowValue: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
});

// ── SetVariableFields styles ───────────────────────────────────────────────────
const svs = StyleSheet.create({
  // Dropdown trigger button (shared by var + op rows)
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f5f3ff",
    borderWidth: 1.5,
    borderColor: "#c4b5fd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 4,
  },
  selectBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7c3aed",
    flex: 1,
  },
  selectBtnSub: {
    fontSize: 12,
    color: "#a78bfa",
    flex: 2,
  },
  selectBtnPlaceholder: {
    color: "#c4b5fd",
    fontWeight: "400",
  },

  // Live expression preview
  preview: {
    marginTop: 10,
    fontSize: 12,
    color: "#a78bfa",
    fontStyle: "italic",
  },

  // Dropdown modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingTop: 18,
    paddingBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Option rows inside the modal
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  optionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  optionRowActive: { backgroundColor: "#f5f3ff" },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  optionTextActive: { color: "#7c3aed", fontWeight: "700" },

  // Operator-specific option layout
  opOptionLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  opOptionSymbol: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    width: 30,
  },
  opOptionDesc: { fontSize: 13, color: "#6b7280" },
});
