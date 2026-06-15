import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useBuiltPrograms, useConnected, useGrids, useLocals, useNanoIO, usePoints, useRelayIO, useSelectedRobot, useStacks, useTools } from "@/src/providers/RobotProvider";
import { LocalProgramService } from "@/src/services/LocalProgramService";
import { robotClient } from "@/src/services/RobotConnectService";
import { ArucoVisionStepOutput, AuxDeviceState, AuxAxisChannelState, BuiltProgram, ColorVisionStepOutput, ConditionGroup, ConditionItem, ConditionOp, ElseIfBranch, Grid, GridPoint, PolygonVisionStepOutput, ProgramStep, ProgramVariable, RobotStack, StackPoint, StepType, VisionProgram, VisionStepOutput, auxStepsPerUnit, auxUnitLabel } from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
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
  ImagePlus,
  MessageSquare,
  OctagonX,
  PauseCircle,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat2,
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
      const waitExpr = step.expressions?.waitMs;
      return `Wait  ${waitExpr ?? `${step.waitMs ?? 0} ms`}`;
    }
    case "Loop": {
      const loopExpr = step.expressions?.loopCount;
      const loopVal  = loopExpr ? loopExpr : (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1));
      return `Loop  ×${loopVal}`;
    }
    case "StatusUpdate": return step.statusMessage ? `"${step.statusMessage}"` : "Status update";
    case "CallRoutine":  return step.routineName ? `Routine → ${step.routineName}` : "Call Routine";
    case "RunVision":    return step.visionProgramName ? `Vision → ${step.visionProgramName}` : "Run Vision";
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
      if (!g || g.items.length === 0) return "If (no conditions)";
      if (g.items.length === 1) return `If  ${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}`;
      return `If  ${g.combinator} of ${g.items.length} conditions`;
    }
    case "SetTool":    return step.toolName  ? `Set Tool  →  ${step.toolName}`  : "Set Tool  →  None";
    case "SetLocal":   return step.localName ? `Set Local  →  ${step.localName}` : "Set Local  →  None";
    case "ClearLocal": return "Clear Local";
    case "RunHoming":  return "Run Homing";
    case "AuxMove": {
      const steps = step.auxSteps ?? 0;
      const dir   = steps < 0 ? "◀" : "▶";
      return `Aux Move  ·  Axis ${step.auxAxisIndex ?? 0}  ·  ${Math.abs(steps)} steps  ${dir}`;
    }
    case "AuxContinuous":
      return `Aux Run  ·  Axis ${step.auxAxisIndex ?? 0}  ·  ${step.auxVelocity ?? 800} steps/s`;
    case "AuxStop":
      return "Aux Stop";
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
    case "AuxMove":        return <ChevronsRight size={size} color={color} />;
    case "AuxContinuous":  return <Play          size={size} color={color} />;
    case "AuxStop":        return <OctagonX      size={size} color={color} />;
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
  RunVision:     { accent: "#0891b2", iconBg: "#cffafe", iconColor: "#0891b2", label: "Run Vision"          },
};

function stepDetail(step: ProgramStep, grids?: Grid[], stacks?: RobotStack[]): string | null {
  switch (step.type) {
    case "MoveL":
    case "MoveJ": {
      const parts: string[] = [];
      const target = step.gridPoint ? "grid point"
        : step.stackPoint ? "stack point"
        : step.varPointName ? `$${step.varPointName}[${step.varPointIndex ?? "0"}]`
        : (step.pointName ?? "current pos");
      parts.push(`→ ${target}`);
      if (step.speed != null) parts.push(`${step.speed} mm/s`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "JumpL":
    case "JumpJ": {
      const parts: string[] = [];
      const target = step.gridPoint ? "grid point"
        : step.stackPoint ? "stack point"
        : step.varPointName ? `$${step.varPointName}[${step.varPointIndex ?? "0"}]`
        : (step.pointName ?? "current pos");
      parts.push(`→ ${target}`);
      if (step.jumpZ != null) parts.push(`Z: ${step.jumpZ} mm`);
      if (step.speed != null) parts.push(`${step.speed} mm/s`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "SetOutput":
      return `Output ${step.outputNumber ?? 1}  →  ${step.outputValue ? "ON" : "OFF"}`;
    case "Wait": {
      const waitExpr = step.expressions?.waitMs;
      return waitExpr ?? `${step.waitMs ?? 0} ms`;
    }
    case "Loop": {
      const loopExpr = step.expressions?.loopCount;
      return `×${loopExpr ?? (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1))}`;
    }
    case "StatusUpdate":
      return step.statusMessage || null;
    case "CallRoutine":
      return step.routineName ? `→ ${step.routineName}` : null;
    case "RunVision":
      return step.visionProgramName ? `→ ${step.visionProgramName}` : null;
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
      if (!g || g.items.length === 0) return "(no conditions)";
      if (g.items.length === 1) return `${g.items[0].left} ${g.items[0].operator} ${g.items[0].right}`;
      return `${g.combinator} of ${g.items.length} conditions`;
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
      const parts: string[] = [`Axis ${step.auxAxisIndex ?? 0}`];
      if (step.auxVelocity != null) parts.push(`${step.auxVelocity} steps/s`);
      if (step.auxWaitForDone === false) parts.push("no wait");
      return parts.join("  ·  ");
    }
    case "AuxContinuous":
      return `Axis ${step.auxAxisIndex ?? 0}  ·  ${step.auxVelocity ?? 800} steps/s  (continuous)`;
    case "AuxStop":
      return step.auxImmediate ? "Immediate halt" : "Controlled stop";
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
  { type: "RunVision",     label: "Run Vision",         desc: "Trigger a vision program, wait for one inspection result, then continue" },
];

// ── Insert target — tracks where the next step should be placed ───────────────

type InsertTarget =
  | { mode: "append" }
  | { mode: "insert";      afterIndex: number }
  | { mode: "appendLoop";  loopId: string }
  | { mode: "insertLoop";  loopId: string; afterIndex: number }
  | { mode: "appendIf";    stepId: string; branchKey: string }
  | { mode: "insertIf";    stepId: string; branchKey: string; afterIndex: number };

// ── Drag info ─────────────────────────────────────────────────────────────────

type DragInfo = {
  id: string;
  loopId?: string; // set if dragging an inner loop step
  fromIndex: number;
  toIndex: number;
};

// ── Step type picker modal ────────────────────────────────────────────────────

function StepTypePicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (type: StepType) => void;
  onClose: () => void;
}) {
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
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {STEP_TYPES.map((s, i) => {
              const theme = STEP_THEME[s.type] ?? STEP_THEME["MoveL"];
              return (
                <TouchableOpacity
                  key={s.type}
                  style={[ms.row, i < STEP_TYPES.length - 1 && ms.rowBorder]}
                  onPress={() => { onPick(s.type); onClose(); }}
                  activeOpacity={0.7}
                >
                  <View style={[ms.iconTile, { backgroundColor: theme.iconBg }]}>
                    <StepIcon type={s.type} size={18} color={theme.iconColor} />
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, { color: theme.accent }]}>{s.label}</Text>
                    <Text style={ms.rowDesc}>{s.desc}</Text>
                  </View>
                  <ChevronRight size={16} color="#d1d5db" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Condition editor ─────────────────────────────────────────────────────────

const COND_OPS: ConditionOp[] = ['==', '!=', '>', '>=', '<', '<='];

function conditionSummary(group: ConditionGroup | undefined): string {
  if (!group || group.items.length === 0) return '(no conditions)';
  if (group.items.length === 1) {
    const it = group.items[0];
    return `${it.left || '?'} ${it.operator} ${it.right || '?'}`;
  }
  return `${group.combinator} of ${group.items.length} conditions`;
}

function ConditionItemEditor({
  item,
  variables,
  onChange,
  onDelete,
}: {
  item: ConditionItem;
  variables?: ProgramVariable[];
  onChange: (updated: ConditionItem) => void;
  onDelete: () => void;
}) {
  const [opOpen, setOpOpen] = React.useState(false);
  const [leftPickerOpen, setLeftPickerOpen] = React.useState(false);
  return (
    <View style={{ marginBottom: 8, borderWidth: 1, borderColor: '#bae6fd', borderRadius: 8, padding: 8, backgroundColor: '#fff' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 7, fontSize: 13, color: '#7c3aed', minWidth: 0 }}
          value={item.left}
          onChangeText={v => onChange({ ...item, left: v })}
          placeholder="$var or $stb.in1"
          placeholderTextColor="#c4b5fd"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={{ paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#0891b2', borderRadius: 7, backgroundColor: '#e0f2fe', minWidth: 40, alignItems: 'center' }}
          onPress={() => setOpOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0891b2' }}>{item.operator}</Text>
        </TouchableOpacity>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 7, fontSize: 13, color: '#111827', minWidth: 0 }}
          value={item.right}
          onChangeText={v => onChange({ ...item, right: v })}
          placeholder="value"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7}>
          <X size={14} color="#9ca3af" />
        </TouchableOpacity>
      </View>
      {variables && variables.length > 0 && (
        <>
          <TouchableOpacity
            onPress={() => setLeftPickerOpen(true)}
            activeOpacity={0.7}
            style={{ marginTop: 5, alignSelf: 'flex-start', backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>+ var</Text>
          </TouchableOpacity>
          <VarPickerModal
            visible={leftPickerOpen}
            onClose={() => setLeftPickerOpen(false)}
            variables={variables}
            selected={item.left.startsWith('$') ? item.left.slice(1) : undefined}
            title="Left Variable"
            onSelect={v => { if (v) onChange({ ...item, left: `$${v.name}` }); }}
          />
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: '#9ca3af', alignSelf: 'center', marginRight: 2 }}>Right:</Text>
        {(['True', 'False', '1', '0'] as const).map(val => (
          <TouchableOpacity key={val} onPress={() => onChange({ ...item, right: val })} activeOpacity={0.7}
            style={{ backgroundColor: val === 'True' || val === '1' ? '#f0fdf4' : '#fef2f2',
              borderWidth: 1, borderColor: val === 'True' || val === '1' ? '#bbf7d0' : '#fecaca',
              borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: val === 'True' || val === '1' ? '#16a34a' : '#dc2626' }}>{val}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Modal visible={opOpen} transparent animationType="fade" onRequestClose={() => setOpOpen(false)}>
        <Pressable style={svs.modalOverlay} onPress={() => setOpOpen(false)}>
          <Pressable style={svs.modalCard} onPress={() => {}}>
            <Text style={svs.modalTitle}>Operator</Text>
            {COND_OPS.map((op, i) => (
              <TouchableOpacity key={op}
                style={[svs.optionRow, i < COND_OPS.length - 1 && svs.optionRowBorder, op === item.operator && svs.optionRowActive]}
                onPress={() => { onChange({ ...item, operator: op }); setOpOpen(false); }} activeOpacity={0.7}>
                <Text style={[svs.optionText, op === item.operator && svs.optionTextActive]}>{op}</Text>
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
}: {
  group: ConditionGroup;
  onChange: (updated: ConditionGroup) => void;
  variables?: ProgramVariable[];
}) {
  const accent = '#0891b2';
  return (
    <View style={{ marginTop: 8, padding: 12, borderWidth: 1, borderColor: '#e0f2fe', borderRadius: 10, backgroundColor: '#f0f9ff' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
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
      {group.items.length === 0 && (
        <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8, fontStyle: 'italic' }}>No conditions — branch always runs.</Text>
      )}
      {group.items.map((item, i) => (
        <ConditionItemEditor key={item.id} item={item} variables={variables}
          onChange={updated => onChange({ ...group, items: group.items.map((ci, j) => j === i ? updated : ci) })}
          onDelete={() => onChange({ ...group, items: group.items.filter((_, j) => j !== i) })} />
      ))}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 6 }}
        onPress={() => onChange({ ...group, items: [...group.items, { id: newId(), left: '', operator: '==' as ConditionOp, right: '1' }] })}
        activeOpacity={0.7}>
        <Plus size={12} color={accent} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>Add Condition</Text>
      </TouchableOpacity>
    </View>
  );
}


// ── Variable picker modal ─────────────────────────────────────────────────────

type VarKind = 'number' | 'boolean' | 'list' | 'points';

function varKind(v: ProgramVariable): VarKind {
  if (v.points != null) return 'points';
  if (v.values != null && v.values.length > 0) return 'list';
  if (v.isBoolean) return 'boolean';
  return 'number';
}

const VAR_KIND_META: Record<VarKind, { label: string; color: string; bg: string; border: string }> = {
  number:  { label: 'NUM',  color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  boolean: { label: 'BOOL', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  list:    { label: 'LIST', color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  points:  { label: 'PTS',  color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
};

function VarPickerModal({
  visible, onClose, variables, selected, onSelect, title, showNone = false,
}: {
  visible: boolean;
  onClose: () => void;
  variables: ProgramVariable[];
  selected: string | undefined;
  onSelect: (variable: ProgramVariable | undefined) => void;
  title: string;
  showNone?: boolean;
}) {
  const [search,     setSearch]     = useState('');
  const [kindFilter, setKindFilter] = useState<VarKind | 'all'>('all');

  useEffect(() => {
    if (visible) { setSearch(''); setKindFilter('all'); }
  }, [visible]);

  const kinds = useMemo(() => {
    const seen = new Set<VarKind>();
    variables.forEach(v => seen.add(varKind(v)));
    return [...seen];
  }, [variables]);

  const filtered = useMemo(() =>
    variables.filter(v => {
      if (kindFilter !== 'all' && varKind(v) !== kindFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || v.name.toLowerCase().includes(q);
    }), [variables, kindFilter, search]);

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
  set,
}: {
  draft: ProgramStep;
  variables: ProgramVariable[] | undefined;
  set: (p: Partial<ProgramStep>) => void;
}) {
  const varList = (variables ?? []).map(v => v.name);
  const initial = useMemo(() => parseVarExpr(draft.variableName, draft.variableExpr), []);
  const [op, setOp]           = useState<SetVarOp>(initial.op);
  const [rawVal, setRawVal]   = useState(initial.val);
  const [varDropOpen, setVarDropOpen] = useState(false);
  const [opDropOpen,  setOpDropOpen]  = useState(false);

  function apply(varName: string | undefined, operator: SetVarOp, value: string) {
    if (!varName) return;
    set({ variableName: varName, variableExpr: buildVarExpr(varName, operator, value) });
  }

  function selectVar(name: string) {
    setVarDropOpen(false);
    set({ variableName: name, variableExpr: buildVarExpr(name, op, rawVal) });
  }

  function selectOp(next: SetVarOp) {
    setOpDropOpen(false);
    setOp(next);
    apply(draft.variableName, next, rawVal);
  }

  function changeVal(val: string) {
    setRawVal(val);
    apply(draft.variableName, op, val);
  }

  if (varList.length === 0) {
    return (
      <Text style={ms.emptyHint}>
        No variables defined. Add variables in the Variables section of the builder.
      </Text>
    );
  }

  const preview = draft.variableName && rawVal
    ? `$${draft.variableName} = ${buildVarExpr(draft.variableName, op, rawVal) ?? "?"}`
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

      {/* Row 2 — Operator */}
      <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OPERATION</Text>
      <TouchableOpacity style={svs.selectBtn} onPress={() => setOpDropOpen(true)} activeOpacity={0.75}>
        <Text style={svs.selectBtnText}>{op}</Text>
        <Text style={svs.selectBtnSub} numberOfLines={1}>{OP_LABELS[op]}</Text>
        <ChevronDown size={14} color="#7c3aed" />
      </TouchableOpacity>

      {/* Row 3 — Value */}
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
      </SvDropdownModal>

      {/* Operator picker modal */}
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
    </>
  );
}

function StepConfigModal({
  visible,
  step,
  variables,
  scopeSteps,
  stepIndex,
  onSave,
  onClose,
}: {
  visible: boolean;
  step: ProgramStep | null;
  variables?: ProgramVariable[];
  scopeSteps?: ProgramStep[];
  stepIndex?: number;
  onSave: (updated: ProgramStep) => void;
  onClose: () => void;
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
  const [auxDevices, setAuxDevices]   = useState<AuxDeviceState[]>([]);
  const [visionPrograms, setVisionPrograms] = useState<VisionProgram[]>([]);
  const [visionPicker, setVisionPicker]   = useState<{ inspId: string; field: 'detectedVar' | 'countVar' | 'pointsVar' } | null>(null);
  const [colorPicker, setColorPicker]     = useState<{ inspId: string; field: 'coverageVar' | 'passedVar' } | null>(null);
  const [polygonPicker, setPolygonPicker] = useState<{ inspId: string; field: keyof Omit<PolygonVisionStepOutput, 'inspectionId'> } | null>(null);
  const [arucoPicker, setArucoPicker]     = useState<{ inspId: string; field: keyof Omit<ArucoVisionStepOutput, 'inspectionId'> } | null>(null);
  const [statusVarPickerOpen, setStatusVarPickerOpen] = useState(false);

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
    return robotClient.onAuxAxis(devices => setAuxDevices(devices));
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
            ) : (
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
            )}

            {gridPointMode === 'varPoint' && (() => {
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
            })()}
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

      case "Wait":
        return (
          <>
            <Text style={ms.fieldLabel}>DURATION  (ms)</Text>
            <ExpressionInput style={ms.input} fieldKey="waitMs"
              value={draft!.waitMs} expressions={draft!.expressions}
              onChangeValue={v => set({ waitMs: v !== undefined ? Math.round(v) : undefined })}
              onChangeExpr={setExpr} variables={variables} autoFocus />
          </>
        );

      case "Loop":
        return (
          <>
            <Text style={ms.fieldLabel}>REPEAT COUNT  (0 = infinite)</Text>
            <ExpressionInput style={ms.input} fieldKey="loopCount"
              value={draft!.loopCount ?? 1} expressions={draft!.expressions}
              onChangeValue={v => set({ loopCount: v !== undefined ? Math.round(v) : 1 })}
              onChangeExpr={setExpr} variables={variables} autoFocus />
            <Text style={ms.hintText}>Add steps inside this loop from the builder after saving.</Text>
          </>
        );

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
            <Text style={ms.hintText}>
              Starts the selected vision program, waits for one inspection result, then continues.
            </Text>
            {visionPrograms.length === 0 && (
              <Text style={ms.emptyHint}>No vision programs saved yet. Create one from the Vision Programs page.</Text>
            )}
            {visionPrograms.map((vp, i) => {
              const active = draft!.visionProgramId === vp.id;
              return (
                <TouchableOpacity
                  key={vp.id}
                  style={[ms.row, i < visionPrograms.length - 1 && ms.rowBorder, active && ms.rowActive]}
                  onPress={() => set({ visionProgramId: vp.id, visionProgramName: vp.name, visionOutputs: [] })}
                  activeOpacity={0.7}
                >
                  <View style={[ms.radioRing, active && ms.radioRingActive]}>
                    {active && <View style={ms.radioDot} />}
                  </View>
                  <View style={ms.rowText}>
                    <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{vp.name}</Text>
                    {!!vp.description && <Text style={ms.rowDesc}>{vp.description}</Text>}
                    <Text style={ms.rowDesc}>{vp.cameraId || "No camera"} · {vp.zones.length} zone{vp.zones.length !== 1 ? "s" : ""}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

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
        return <SetVariableFields draft={draft!} variables={variables} set={set} />;

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
        const deviceId   = draft!.auxDeviceId ?? "AUX_STEPPER_001";
        const axisIndex  = draft!.auxAxisIndex ?? 0;
        const auxDevice  = auxDevices.find(d => d.deviceId === deviceId);
        const axisCfg    = auxDevice?.axes.find(a => a.axisIndex === axisIndex);
        const isPhysical = !!axisCfg?.axisType;
        const unit       = isPhysical ? auxUnitLabel(axisCfg!) : "steps";
        // In physical mode use auxDistance; in steps mode use auxSteps
        const rawDist    = draft!.auxDistance ?? 0;
        const rawSteps   = draft!.auxSteps ?? 0;
        const distVal    = isPhysical ? rawDist : rawSteps;
        const dir        = (isPhysical ? rawDist : rawSteps) < 0 ? -1 : 1;

        const axisLabel = (n: number) => {
          const a = auxDevice?.axes.find(ax => ax.axisIndex === n);
          return a?.name ? `${n}  ${a.name}` : String(n);
        };

        const setDir = (d: 1 | -1) => {
          if (isPhysical) set({ auxDistance: Math.abs(rawDist || 100) * d, auxUnit: unit });
          else            set({ auxSteps: Math.round(Math.abs(rawSteps || 1600)) * d });
        };

        return (
          <>
            <Text style={ms.hintText}>
              {isPhysical
                ? `Move an aux stepper axis a fixed distance in ${unit} with trapezoidal acceleration.`
                : "Move an aux stepper axis a fixed number of steps with trapezoidal acceleration."}
              {" "}Positive = CW (forward), negative = CCW (reverse).
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DEVICE ID</Text>
            <TextInput
              style={ms.input}
              value={deviceId}
              onChangeText={v => set({ auxDeviceId: v || undefined })}
              placeholder="AUX_STEPPER_001"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              returnKeyType="done"
            />
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>AXIS</Text>
            <View style={ms.segRow}>
              {[0, 1, 2, 3].map(n => {
                const active = axisIndex === n;
                return (
                  <TouchableOpacity key={n} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ auxAxisIndex: n })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{axisLabel(n)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DIRECTION</Text>
            <View style={ms.segRow}>
              {([{ label: "▶  CW (+)", val: 1 }, { label: "◀  CCW (−)", val: -1 }] as const).map(({ label, val }) => {
                const active = dir === val;
                return (
                  <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => setDir(val)} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>{unit.toUpperCase()}</Text>
            {isPhysical
              ? <ExpressionInput style={ms.input} fieldKey="auxDistance"
                  value={Math.abs(rawDist) || undefined}
                  expressions={draft!.expressions}
                  onChangeValue={v => set({ auxDistance: v !== undefined ? v * dir : undefined, auxUnit: unit })}
                  onChangeExpr={setExpr}
                  placeholder="100"
                  variables={variables} />
              : <ExpressionInput style={ms.input} fieldKey="auxSteps"
                  value={Math.abs(rawSteps) || undefined}
                  expressions={draft!.expressions}
                  onChangeValue={v => set({ auxSteps: v !== undefined ? Math.round(v) * dir : undefined })}
                  onChangeExpr={setExpr}
                  placeholder="1600"
                  variables={variables} />
            }
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>VELOCITY  ({unit}/s)</Text>
                <ExpressionInput style={ms.input} fieldKey="auxVelocity"
                  value={draft!.auxVelocity} expressions={draft!.expressions}
                  onChangeValue={v => set({ auxVelocity: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder={isPhysical ? "10" : "1600"} variables={variables} />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  ({unit}/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="auxAccel"
                  value={draft!.auxAccel} expressions={draft!.expressions}
                  onChangeValue={v => set({ auxAccel: v })} onChangeExpr={setExpr}
                  allowUndefined placeholder={isPhysical ? "50" : "3200"} variables={variables} />
              </View>
            </View>
            <View style={ms.twoCol}>
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
        const deviceId  = draft!.auxDeviceId ?? "AUX_STEPPER_001";
        const axisIndex = draft!.auxAxisIndex ?? 0;
        const auxDevice = auxDevices.find(d => d.deviceId === deviceId);
        const axisCfg   = auxDevice?.axes.find(a => a.axisIndex === axisIndex);
        const isPhysical = !!axisCfg?.axisType;
        const unit      = isPhysical ? auxUnitLabel(axisCfg!) : "steps";
        const velocity  = draft!.auxVelocity ?? (isPhysical ? 10 : 800);
        const dir       = velocity < 0 ? -1 : 1;

        const axisLabel = (n: number) => {
          const a = auxDevice?.axes.find(ax => ax.axisIndex === n);
          return a?.name ? `${n}  ${a.name}` : String(n);
        };

        return (
          <>
            <Text style={ms.hintText}>
              Start the aux axis running continuously at the given speed.
              Use an AuxStop step later to stop it.
              Positive velocity = CW (forward), negative = CCW (reverse).
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DEVICE ID</Text>
            <TextInput
              style={ms.input}
              value={deviceId}
              onChangeText={v => set({ auxDeviceId: v || undefined })}
              placeholder="AUX_STEPPER_001"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              returnKeyType="done"
            />
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>AXIS</Text>
            <View style={ms.segRow}>
              {[0, 1, 2, 3].map(n => {
                const active = axisIndex === n;
                return (
                  <TouchableOpacity key={n} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ auxAxisIndex: n })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{axisLabel(n)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DIRECTION</Text>
            <View style={ms.segRow}>
              {([{ label: "▶  CW (+)", val: 1 }, { label: "◀  CCW (−)", val: -1 }] as const).map(({ label, val }) => {
                const active = dir === val;
                return (
                  <TouchableOpacity key={val} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
                    onPress={() => set({ auxVelocity: Math.abs(velocity || (isPhysical ? 10 : 800)) * val, auxUnit: isPhysical ? unit : undefined })} activeOpacity={0.8}>
                    <Text style={[ms.segText, active && ms.segTextActive]}>{label}</Text>
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

      case "AuxStop":
        return (
          <>
            <Text style={ms.hintText}>
              Stop all aux axis motion. Controlled stop ramps down gracefully; immediate halt cuts power instantly.
            </Text>
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DECEL RATE  (steps/s²)</Text>
            <ExpressionInput style={ms.input} fieldKey="auxDecel"
              value={draft!.auxDecel} expressions={draft!.expressions}
              onChangeValue={v => set({ auxDecel: v })} onChangeExpr={setExpr}
              allowUndefined placeholder="5000" variables={variables} />
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

      case "IfCondition":
        return (
          <Text style={ms.hintText}>
            Edit conditions using the pencil icon on each branch. Add or remove Else If / Else branches from the block controls at the bottom.
          </Text>
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
  branchHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5,
  },
  branchBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
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
  isDragging,
  onEditInner,
  onCopyInner,
  onDeleteInner,
  onInsertIfInner,
  onPasteIfInner,
  onUpdateIfCondition,
  variables,
}: {
  step: ProgramStep;
  isDragging: boolean;
  onEditInner: (inner: ProgramStep) => void;
  onCopyInner: (inner: ProgramStep) => void;
  onDeleteInner: (id: string) => void;
  onInsertIfInner: (branchKey: string, afterIndex?: number) => void;
  onPasteIfInner?: (branchKey: string, afterIndex?: number) => void;
  onUpdateIfCondition: (updated: ProgramStep) => void;
  variables?: ProgramVariable[];
}) {
  const theme = STEP_THEME['IfCondition'] ?? STEP_THEME['MoveL'];
  const ifSteps        = step.ifSteps        ?? [];
  const elseIfBranches = step.elseIfBranches ?? [];
  const elseSteps      = step.elseSteps;

  const [editingKey, setEditingKey]           = useState<null | 'if' | string>(null);
  const [draftCondition, setDraftCondition]   = useState<ConditionGroup | null>(null);

  function openConditionEditor(key: 'if' | string) {
    const cond =
      key === 'if'
        ? (step.condition ?? { combinator: 'ALL' as const, items: [] })
        : (elseIfBranches.find(b => b.id === key)?.condition ?? { combinator: 'ALL' as const, items: [] });
    setDraftCondition({ ...cond, items: [...cond.items] });
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

  function renderBranchSteps(steps: ProgramStep[], branchKey: string) {
    return (
      <>
        {steps.length === 0 && (
          <Text style={[styles.loopEmptyText, { color: '#9ca3af' }]}>No steps in this branch</Text>
        )}
        {steps.length > 0 && (
          <InsertDivider inner
            onPress={() => onInsertIfInner(branchKey, -1)}
            onPaste={onPasteIfInner ? () => onPasteIfInner!(branchKey, -1) : undefined}
            disabled={isDragging}
          />
        )}
        {steps.map((inner, j) => (
          <React.Fragment key={inner.id}>
            <LoopInnerRow
              step={inner} index={j} loopId={step.id}
              isBeingDragged={false} isDropAbove={false} isDropBelow={false}
              onEdit={() => onEditInner(inner)}
              onCopy={() => onCopyInner(inner)}
              onDelete={() => onDeleteInner(inner.id)}
              onDragStart={() => {}} onDragMove={() => {}} onDragEnd={() => {}}
              onItemLayout={() => {}}
            />
            {j < steps.length - 1 && (
              <InsertDivider inner
                onPress={() => onInsertIfInner(branchKey, j)}
                onPaste={onPasteIfInner ? () => onPasteIfInner!(branchKey, j) : undefined}
                disabled={isDragging}
              />
            )}
          </React.Fragment>
        ))}
        <View style={styles.loopAddRow}>
          <TouchableOpacity
            style={[styles.loopAddBtn, { borderColor: theme.accent + '60' }]}
            onPress={() => onInsertIfInner(branchKey)} activeOpacity={0.7}>
            <Plus size={13} color={theme.iconColor} />
            <Text style={[styles.loopAddText, { color: theme.iconColor }]}>Add Step</Text>
          </TouchableOpacity>
          {onPasteIfInner && (
            <TouchableOpacity
              style={[styles.loopAddBtn, { borderColor: '#ddd6fe' }]}
              onPress={() => onPasteIfInner!(branchKey)} activeOpacity={0.7}>
              <ClipboardPaste size={13} color="#7c3aed" />
              <Text style={[styles.loopAddText, { color: '#7c3aed' }]}>Paste</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  }

  return (
    <View style={[styles.loopCardBody, { borderTopColor: theme.accent + '40' }]}>

      {/* Condition editing modal */}
      <Modal visible={editingKey !== null} transparent animationType="fade"
        onRequestClose={() => setEditingKey(null)}>
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
                <ConditionGroupEditor
                  group={draftCondition}
                  onChange={setDraftCondition}
                  variables={variables}
                />
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

      {/* IF branch */}
      <View style={ifStyles.branchHeader}>
        <View style={[ifStyles.branchBadge, { backgroundColor: theme.iconBg }]}>
          <Text style={[ifStyles.branchLabel, { color: theme.accent }]}>IF</Text>
        </View>
        <Text style={ifStyles.condSummary} numberOfLines={1}>{conditionSummary(step.condition)}</Text>
        <TouchableOpacity onPress={() => openConditionEditor('if')} hitSlop={8} activeOpacity={0.7}>
          <Pencil size={13} color="#9ca3af" />
        </TouchableOpacity>
      </View>
      {renderBranchSteps(ifSteps, 'if')}

      {/* ELSE IF branches */}
      {elseIfBranches.map(branch => (
        <React.Fragment key={branch.id}>
          <View style={[ifStyles.branchHeader, { marginTop: 10 }]}>
            <View style={[ifStyles.branchBadge, { backgroundColor: '#f3f4f6' }]}>
              <Text style={[ifStyles.branchLabel, { color: '#374151' }]}>ELSE IF</Text>
            </View>
            <Text style={ifStyles.condSummary} numberOfLines={1}>{conditionSummary(branch.condition)}</Text>
            <TouchableOpacity onPress={() => openConditionEditor(branch.id)} hitSlop={8} activeOpacity={0.7}>
              <Pencil size={13} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onUpdateIfCondition({ ...step, elseIfBranches: elseIfBranches.filter(b => b.id !== branch.id) })}
              hitSlop={8} activeOpacity={0.7}>
              <X size={13} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {renderBranchSteps(branch.steps, branch.id)}
        </React.Fragment>
      ))}

      {/* ELSE branch */}
      {elseSteps !== undefined && (
        <>
          <View style={[ifStyles.branchHeader, { marginTop: 10 }]}>
            <View style={[ifStyles.branchBadge, { backgroundColor: '#f3f4f6' }]}>
              <Text style={[ifStyles.branchLabel, { color: '#374151' }]}>ELSE</Text>
            </View>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => onUpdateIfCondition({ ...step, elseSteps: undefined })}
              hitSlop={8} activeOpacity={0.7}>
              <X size={13} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          {renderBranchSteps(elseSteps, 'else')}
        </>
      )}

      {/* Branch structure controls — visually separated from step content */}
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
  loopId,
  onStart,
  onMove,
  onEnd,
}: {
  stepId: string;
  loopId?: string;
  onStart: (id: string, loopId?: string) => void;
  onMove: (id: string, dy: number, absY: number, loopId?: string) => void;
  onEnd: (id: string, loopId?: string) => void;
}) {
  // Keep latest callbacks in refs so the PanResponder (created once) always calls current versions
  const sidRef  = useRef(stepId);
  const lidRef  = useRef(loopId);
  const startRef = useRef(onStart);
  const moveRef  = useRef(onMove);
  const endRef   = useRef(onEnd);
  sidRef.current  = stepId;
  lidRef.current  = loopId;
  startRef.current = onStart;
  moveRef.current  = onMove;
  endRef.current   = onEnd;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:     ()       => startRef.current(sidRef.current, lidRef.current),
      onPanResponderMove:      (_, gs)  => moveRef.current(sidRef.current, gs.dy, gs.moveY, lidRef.current),
      onPanResponderRelease:   ()       => endRef.current(sidRef.current, lidRef.current),
      onPanResponderTerminate: ()       => endRef.current(sidRef.current, lidRef.current),
    })
  ).current;

  return (
    <View {...responder.panHandlers} style={styles.dragHandle} hitSlop={6}>
      <GripVertical size={16} color="#d1d5db" />
    </View>
  );
}

// ── Loop inner card ────────────────────────────────────────────────────────────

function LoopInnerRow({
  step,
  index,
  loopId,
  isBeingDragged,
  isDropAbove,
  isDropBelow,
  onEdit,
  onCopy,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onItemLayout,
}: {
  step: ProgramStep;
  index: number;
  loopId: string;
  isBeingDragged: boolean;
  isDropAbove: boolean;
  isDropBelow: boolean;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDragStart: (id: string, loopId?: string) => void;
  onDragMove: (id: string, dy: number, absY: number, loopId?: string) => void;
  onDragEnd: (id: string, loopId?: string) => void;
  onItemLayout: (id: string, height: number) => void;
}) {
  const theme      = STEP_THEME[step.type] ?? STEP_THEME["MoveL"];
  const detail     = stepDetail(step);
  const isSetSpeed = step.type === "SetSpeedL" || step.type === "SetSpeedJ"
                  || step.type === "Label"      || step.type === "GoToLabel";

  return (
    <View
      onLayout={e => onItemLayout(step.id, e.nativeEvent.layout.height)}
      style={[
        isBeingDragged && styles.draggingItem,
        isDropAbove    && styles.dropTargetItemTop,
        isDropBelow    && styles.dropTargetItemBottom,
      ]}
    >
      <TouchableOpacity
        style={[styles.innerCard, { borderLeftColor: theme.accent }]}
        onPress={onEdit}
        activeOpacity={0.75}
      >
        <DragHandle
          stepId={step.id}
          loopId={loopId}
          onStart={onDragStart}
          onMove={onDragMove}
          onEnd={onDragEnd}
        />
        <View style={[styles.stepCardIcon, styles.stepCardIconSmall, { backgroundColor: theme.iconBg }]}>
          <StepIcon type={step.type} size={15} color={theme.iconColor} />
        </View>
        <View style={styles.stepCardText}>
          <Text style={[styles.stepCardType, { color: theme.accent }]}>
            {index + 1} · {theme.label.toUpperCase()}
          </Text>
          {(!isSetSpeed || !!step.name) && (
            <Text style={styles.stepCardName} numberOfLines={1}>
              {step.name || (detail ?? step.type)}
            </Text>
          )}
          {isSetSpeed && detail && detail.split("\n").map((line, i) => (
            <Text key={i} style={styles.stepCardDetail}>{line}</Text>
          ))}
          {!isSetSpeed && !!step.name && detail && (
            <Text style={styles.stepCardDetail} numberOfLines={1}>{detail}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onCopy}   hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
          <Copy   size={14} color="#9ca3af" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
          <Trash2 size={14} color="#ef4444" />
        </TouchableOpacity>
      </TouchableOpacity>
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
  collapsed,
  innerDrag,
  onToggleCollapse,
  onEdit,
  onCopy,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
  onInsertAfter,
  onPasteAfter,
  onInsertInner,
  onPasteInner,
  onEditInner,
  onCopyInner,
  onDeleteInner,
  onInsertAfterInner,
  onPasteAfterInner,
  onInsertIfInner,
  onPasteIfInner,
  onUpdateIfCondition,
  onItemLayout,
  variables,
}: {
  step: ProgramStep;
  index: number;
  isLast: boolean;
  isBeingDragged: boolean;
  isDropAbove: boolean;
  isDropBelow: boolean;
  isDragging: boolean;
  collapsed: boolean;
  innerDrag: DragInfo | null;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDragStart: (id: string, loopId?: string) => void;
  onDragMove: (id: string, dy: number, absY: number, loopId?: string) => void;
  onDragEnd: (id: string, loopId?: string) => void;
  onInsertAfter: () => void;
  onPasteAfter?: () => void;
  onInsertInner: () => void;
  onPasteInner?: () => void;
  onEditInner: (inner: ProgramStep) => void;
  onCopyInner: (inner: ProgramStep) => void;
  onDeleteInner: (id: string) => void;
  onInsertAfterInner: (afterIndex: number) => void;
  onPasteAfterInner?: (afterIndex: number) => void;
  onInsertIfInner: (branchKey: string, afterIndex?: number) => void;
  onPasteIfInner?: (branchKey: string, afterIndex?: number) => void;
  onUpdateIfCondition: (updated: ProgramStep) => void;
  onItemLayout: (id: string, height: number) => void;
  variables?: ProgramVariable[];
}) {
  const isLoop        = step.type === "Loop";
  const isIfCondition = step.type === "IfCondition";
  const isSetSpeed = step.type === "SetSpeedL" || step.type === "SetSpeedJ"
                  || step.type === "Label"      || step.type === "GoToLabel";
  const innerSteps = step.loopSteps ?? [];
  const isExpanded = (isLoop || isIfCondition) && !collapsed;
  const theme  = STEP_THEME[step.type] ?? STEP_THEME["MoveL"];
  const detail = stepDetail(step);

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
                {step.name || (detail ?? step.type)}
              </Text>
            )}
            {isSetSpeed && detail && detail.split("\n").map((line, i) => (
              <Text key={i} style={styles.stepCardDetail}>{line}</Text>
            ))}
            {!isSetSpeed && !!step.name && detail && (
              <Text style={styles.stepCardDetail} numberOfLines={1}>{detail}</Text>
            )}
            {step.statusMessage && !step.name && step.type !== "StatusUpdate" && (
              <Text style={styles.stepCardStatus} numberOfLines={1}>{step.statusMessage}</Text>
            )}
          </View>

          {(isLoop || isIfCondition) && (
            <TouchableOpacity onPress={onToggleCollapse} hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
              {collapsed ? <ChevronDown size={16} color="#9ca3af" /> : <ChevronUp size={16} color="#9ca3af" />}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onCopy}   hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
            <Copy   size={15} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.cardAction} activeOpacity={0.7}>
            <Trash2 size={15} color="#ef4444" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* If Condition body */}
        {isIfCondition && isExpanded && (
          <IfConditionBody
            step={step}
            isDragging={isDragging}
            onEditInner={onEditInner}
            onCopyInner={onCopyInner}
            onDeleteInner={onDeleteInner}
            onInsertIfInner={onInsertIfInner}
            onPasteIfInner={onPasteIfInner}
            onUpdateIfCondition={onUpdateIfCondition}
            variables={variables}
          />
        )}

        {/* Loop body — inner step cards */}
        {isLoop && isExpanded && (
          <View style={[styles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            {innerSteps.length === 0 && (
              <Text style={styles.loopEmptyText}>No steps inside this loop</Text>
            )}
            {innerSteps.length > 0 && (
              <InsertDivider inner
                onPress={() => onInsertAfterInner(-1)}
                onPaste={onPasteAfterInner ? () => onPasteAfterInner(-1) : undefined}
                disabled={isDragging || !!innerDrag}
              />
            )}
            {innerSteps.map((inner, j) => (
              <React.Fragment key={inner.id}>
                <LoopInnerRow
                  step={inner}
                  index={j}
                  loopId={step.id}
                  isBeingDragged={innerDrag?.id === inner.id}
                  isDropAbove={!!(innerDrag && innerDrag.id !== inner.id && innerDrag.toIndex < innerDrag.fromIndex && innerDrag.toIndex === j)}
                  isDropBelow={!!(innerDrag && innerDrag.id !== inner.id && innerDrag.toIndex > innerDrag.fromIndex && innerDrag.toIndex === j)}
                  onEdit={() => onEditInner(inner)}
                  onCopy={() => onCopyInner(inner)}
                  onDelete={() => onDeleteInner(inner.id)}
                  onDragStart={onDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  onItemLayout={onItemLayout}
                />
                {j < innerSteps.length - 1 && (
                  <InsertDivider
                    inner
                    onPress={() => onInsertAfterInner(j)}
                    onPaste={onPasteAfterInner ? () => onPasteAfterInner(j) : undefined}
                    disabled={isDragging || !!innerDrag}
                  />
                )}
              </React.Fragment>
            ))}

            <View style={styles.loopAddRow}>
              <TouchableOpacity
                style={[styles.loopAddBtn, { borderColor: theme.accent + "60" }]}
                onPress={onInsertInner}
                activeOpacity={0.7}
              >
                <Plus size={13} color={theme.iconColor} />
                <Text style={[styles.loopAddText, { color: theme.iconColor }]}>Add Step</Text>
              </TouchableOpacity>
              {onPasteInner && (
                <TouchableOpacity
                  style={[styles.loopAddBtn, { borderColor: "#ddd6fe" }]}
                  onPress={onPasteInner}
                  activeOpacity={0.7}
                >
                  <ClipboardPaste size={13} color="#7c3aed" />
                  <Text style={[styles.loopAddText, { color: "#7c3aed" }]}>Paste</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Insert divider between top-level steps */}
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
  const [desc,       setDesc]       = useState("");
  const [varType,    setVarType]    = useState<'number' | 'boolean' | 'list' | 'points'>('number');
  const [listValues, setListValues] = useState<string[]>(["0"]);

  useEffect(() => {
    if (variable) {
      setName(variable.name);
      setDesc(variable.description ?? "");
      if (variable.points != null) {
        setVarType('points');
        setValue("0");
        setListValues(["0"]);
      } else if (variable.values != null && variable.values.length > 0) {
        setVarType('list');
        setListValues(variable.values.map(String));
        setValue("0");
      } else if (variable.isBoolean) {
        setVarType('boolean');
        setValue(variable.value !== 0 ? "1" : "0");
        setListValues(["0"]);
      } else {
        setVarType('number');
        setValue(String(variable.value));
        setListValues(["0"]);
      }
    } else {
      setName(""); setValue("0"); setDesc(""); setVarType('number'); setListValues(["0"]);
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

          {/* Type toggle */}
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>TYPE</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <TouchableOpacity
              style={[ms.typeBtn, varType === 'number' && ms.typeBtnActive]}
              onPress={() => setVarType('number')}
              activeOpacity={0.7}
            >
              <Text style={[ms.typeBtnText, varType === 'number' && ms.typeBtnTextActive]}>Number</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.typeBtn, varType === 'boolean' && { ...ms.typeBtnActive, backgroundColor: "#f0fdf4", borderColor: "#16a34a" }]}
              onPress={() => { setVarType('boolean'); if (value !== "0" && value !== "1") setValue("0"); }}
              activeOpacity={0.7}
            >
              <Text style={[ms.typeBtnText, varType === 'boolean' && { color: "#16a34a", fontWeight: "700" }]}>Boolean</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.typeBtn, varType === 'list' && ms.typeBtnActive]}
              onPress={() => setVarType('list')}
              activeOpacity={0.7}
            >
              <Text style={[ms.typeBtnText, varType === 'list' && ms.typeBtnTextActive]}>List</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.typeBtn, varType === 'points' && { ...ms.typeBtnActive, backgroundColor: "#ecfeff", borderColor: "#0891b2" }]}
              onPress={() => setVarType('points')}
              activeOpacity={0.7}
            >
              <Text style={[ms.typeBtnText, varType === 'points' && { color: "#0891b2", fontWeight: "700" }]}>Points</Text>
            </TouchableOpacity>
          </View>
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
                  value: (varType === 'number' || varType === 'boolean') ? (parseFloat(value) || 0) : 0,
                  values: varType === 'list' ? listValues.map(v => parseFloat(v) || 0) : undefined,
                  points: varType === 'points' ? (variable?.points ?? []) : undefined,
                  isBoolean: varType === 'boolean' ? true : undefined,
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
  const { name: editName, isRoutine: isRoutineParam, source: sourceParam } = useLocalSearchParams<{ name?: string; isRoutine?: string; source?: string }>();
  const builtPrograms = useBuiltPrograms();
  const connected     = useConnected();
  const isLocalMode   = sourceParam === 'local';

  const existing = !isLocalMode && editName
    ? builtPrograms.find(p => p.name === editName) ?? null
    : null;

  const [isRoutineMode, setIsRoutineMode] = useState(
    () => isRoutineParam === "1" || (!isLocalMode && builtPrograms.find(p => p.name === editName)?.isRoutine === true)
  );

  const [programName, setProgramName] = useState(existing?.name ?? "");
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
      const arr = [...prev];
      switch (target.mode) {
        case "append":
          return [...arr, step];
        case "insert":
          arr.splice(target.afterIndex + 1, 0, step);
          return arr;
        case "appendLoop":
          return arr.map(s =>
            s.id === target.loopId
              ? { ...s, loopSteps: [...(s.loopSteps ?? []), step] }
              : s
          );
        case "insertLoop":
          return arr.map(s => {
            if (s.id !== target.loopId) return s;
            const inner = [...(s.loopSteps ?? [])];
            inner.splice(target.afterIndex + 1, 0, step);
            return { ...s, loopSteps: inner };
          });
        case "appendIf":
          return applyToIfBranch(arr, target.stepId, target.branchKey, s => [...s, step]);
        case "insertIf":
          return applyToIfBranch(arr, target.stepId, target.branchKey, s => {
            const inner = [...s];
            inner.splice(target.afterIndex + 1, 0, step);
            return inner;
          });
      }
    });
    if (target.mode === "appendLoop" || target.mode === "insertLoop") {
      // Ensure the loop is expanded when a step is pasted inside it
      setCollapsedLoops(prev => { const next = new Set(prev); next.delete(target.loopId); return next; });
    }
  }

  // Sync steps to a ref so drag callbacks always see the latest array
  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

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

  // Derive the step list scope and index for the currently-editing step (for Label/GoToLabel pickers)
  const editingScope = useMemo<ProgramStep[]>(() => {
    if (!editingStep) return steps;
    if (steps.some(s => s.id === editingStep.id)) return steps;
    for (const s of steps) {
      if (s.loopSteps?.some(ls => ls.id === editingStep.id)) return s.loopSteps!;
      if (s.ifSteps?.some(ls => ls.id === editingStep.id)) return s.ifSteps!;
      if (s.elseSteps?.some(ls => ls.id === editingStep.id)) return s.elseSteps!;
      for (const b of s.elseIfBranches ?? []) {
        if (b.steps.some(ls => ls.id === editingStep.id)) return b.steps;
      }
    }
    return steps;
  }, [editingStep, steps]);

  const editingStepIndex = useMemo(() => {
    if (!editingStep) return -1;
    return editingScope.findIndex(s => s.id === editingStep.id);
  }, [editingStep, editingScope]);
  const [insertTarget, setInsertTarget]     = useState<InsertTarget>({ mode: "append" });
  // Ref mirrors state so addStep always reads the latest value regardless of closure age
  const insertTargetRef = useRef<InsertTarget>({ mode: "append" });

  // Loop collapse — keys in set are COLLAPSED; by default everything is expanded
  const [collapsedLoops, setCollapsedLoops] = useState<Set<string>>(new Set());
  function toggleLoop(id: string) {
    setCollapsedLoops(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Drag state ────────────────────────────────────────────────────────────

  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  // Auto-scroll while dragging
  const scrollViewRef      = useRef<ScrollView>(null);
  const scrollYRef         = useRef(0);
  const autoScrollTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

  function startAutoScroll(dir: 1 | -1) {
    if (autoScrollTimer.current) return;
    autoScrollTimer.current = setInterval(() => {
      scrollYRef.current = Math.max(0, scrollYRef.current + dir * 8);
      scrollViewRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
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

  function handleDragStart(stepId: string, loopId?: string) {
    if (loopId) {
      const loop = stepsRef.current.find(s => s.id === loopId);
      const idx  = loop?.loopSteps?.findIndex(s => s.id === stepId) ?? -1;
      const info: DragInfo = { id: stepId, loopId, fromIndex: idx, toIndex: idx };
      dragRef.current = info;
      setDrag(info);
    } else {
      const idx  = stepsRef.current.findIndex(s => s.id === stepId);
      const info: DragInfo = { id: stepId, fromIndex: idx, toIndex: idx };
      dragRef.current = info;
      setDrag(info);
    }
  }

  function handleDragMove(stepId: string, dy: number, absY: number, loopId?: string) {
    const d = dragRef.current;
    if (!d || d.id !== stepId) return;

    const arr = loopId
      ? (stepsRef.current.find(s => s.id === loopId)?.loopSteps ?? [])
      : stepsRef.current;

    const newTo = calcDropIndex(d.fromIndex, dy, arr);
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

  function handleDragEnd(stepId: string, loopId?: string) {
    stopAutoScroll();
    const d = dragRef.current;
    if (d && d.id === stepId && d.toIndex !== d.fromIndex) {
      if (loopId) {
        moveLoopStepTo(loopId, d.fromIndex, d.toIndex);
      } else {
        moveStepTo(d.fromIndex, d.toIndex);
      }
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
      visionProgramId: undefined, visionProgramName: undefined, visionOutputs: undefined,
      varPointName: undefined, varPointIndex: undefined,
      variableName: undefined, variableExpr: undefined,
      expressions: undefined,
      labelId: type === "Label" ? newId() : undefined,
      labelName: undefined,
      condition: type === "IfCondition" ? { combinator: 'ALL' as const, items: [] } : undefined,
      ifSteps:   type === "IfCondition" ? [] : undefined,
      toolName:  undefined,
      localName: undefined,
    };
  }

  function openTypePicker(target: InsertTarget) {
    insertTargetRef.current = target; // sync update so addStep always sees latest
    setInsertTarget(target);
    setTypePickerOpen(true);
  }

  function applyToIfBranch(arr: ProgramStep[], stepId: string, branchKey: string, fn: (s: ProgramStep[]) => ProgramStep[]): ProgramStep[] {
    return arr.map(s => {
      if (s.id !== stepId) return s;
      if (branchKey === 'if')   return { ...s, ifSteps:   fn(s.ifSteps   ?? []) };
      if (branchKey === 'else') return { ...s, elseSteps: fn(s.elseSteps ?? []) };
      return { ...s, elseIfBranches: (s.elseIfBranches ?? []).map(b =>
        b.id === branchKey ? { ...b, steps: fn(b.steps) } : b) };
    });
  }

  function addStep(type: StepType) {
    const target = insertTargetRef.current; // read from ref, never stale
    const step = defaultStep(type);

    setSteps(prev => {
      const arr = [...prev];
      switch (target.mode) {
        case "append":
          return [...arr, step];
        case "insert":
          arr.splice(target.afterIndex + 1, 0, step);
          return arr;
        case "appendLoop":
          return arr.map(s =>
            s.id === target.loopId
              ? { ...s, loopSteps: [...(s.loopSteps ?? []), step] }
              : s
          );
        case "insertLoop":
          return arr.map(s => {
            if (s.id !== target.loopId) return s;
            const inner = [...(s.loopSteps ?? [])];
            inner.splice(target.afterIndex + 1, 0, step);
            return { ...s, loopSteps: inner };
          });
        case "appendIf":
          return applyToIfBranch(arr, target.stepId, target.branchKey, s => [...s, step]);
        case "insertIf":
          return applyToIfBranch(arr, target.stepId, target.branchKey, s => {
            const inner = [...s];
            inner.splice(target.afterIndex + 1, 0, step);
            return inner;
          });
      }
    });

    // If adding to a loop, make sure it's expanded
    if (target.mode === "appendLoop" || target.mode === "insertLoop") {
      setCollapsedLoops(prev => { const next = new Set(prev); next.delete(target.loopId); return next; });
    }

    setEditingStep(step);
    setConfigOpen(true);
  }

  function updateStep(updated: ProgramStep) {
    setSteps(prev => {
      if (prev.some(s => s.id === updated.id))
        return prev.map(s => s.id === updated.id ? updated : s);
      return prev.map(s => {
        if (s.loopSteps?.some(ls => ls.id === updated.id))
          return { ...s, loopSteps: s.loopSteps!.map(ls => ls.id === updated.id ? updated : ls) };
        if (s.ifSteps?.some(ls => ls.id === updated.id))
          return { ...s, ifSteps: s.ifSteps!.map(ls => ls.id === updated.id ? updated : ls) };
        if (s.elseSteps?.some(ls => ls.id === updated.id))
          return { ...s, elseSteps: s.elseSteps!.map(ls => ls.id === updated.id ? updated : ls) };
        const updatedElseIf = s.elseIfBranches?.map(b =>
          b.steps.some(ls => ls.id === updated.id)
            ? { ...b, steps: b.steps.map(ls => ls.id === updated.id ? updated : ls) }
            : b
        );
        if (updatedElseIf && updatedElseIf !== s.elseIfBranches)
          return { ...s, elseIfBranches: updatedElseIf };
        return s;
      });
    });
  }

  function deleteStep(id: string) {
    setSteps(prev => {
      if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
      return prev.map(s => ({
        ...s,
        loopSteps:      s.loopSteps?.filter(ls => ls.id !== id),
        ifSteps:        s.ifSteps?.filter(ls => ls.id !== id),
        elseSteps:      s.elseSteps?.filter(ls => ls.id !== id),
        elseIfBranches: s.elseIfBranches?.map(b => ({ ...b, steps: b.steps.filter(ls => ls.id !== id) })),
      }));
    });
  }

  function moveStepTo(from: number, to: number) {
    setSteps(prev => {
      const arr = [...prev];
      const [removed] = arr.splice(from, 1);
      arr.splice(to, 0, removed);
      return arr;
    });
  }

  function moveLoopStepTo(loopId: string, from: number, to: number) {
    setSteps(prev => prev.map(s => {
      if (s.id !== loopId || !s.loopSteps) return s;
      const arr = [...s.loopSteps];
      const [removed] = arr.splice(from, 1);
      arr.splice(to, 0, removed);
      return { ...s, loopSteps: arr };
    }));
  }

  // ── Save / Run ────────────────────────────────────────────────────────────

  function buildProg(): BuiltProgram {
    return {
      name: programName.trim(),
      description: description.trim(),
      steps,
      variables: variables.length > 0 ? variables : undefined,
      lastUpdatedUnixMs: Date.now(),
      isRoutine: isRoutineMode,
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

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

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

  const builderTitle = `${isRoutineMode ? "Routine" : "Program"} Builder${isLocalMode ? " · Local" : ""}`;

  return (
    <View style={styles.container}>
      <SubPageHeader title={builderTitle} onBack={handleBack} />
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
            placeholder={isRoutineMode ? "Routine name…" : "Program name…"}
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

          {/* Cover image row — hidden for routines */}
          {!isRoutineMode && <View style={styles.imageRow}>
            {/* Preview */}
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

            {/* Picker buttons */}
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
          </View>}
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
                    </View>
                    {v.description ? (
                      <Text style={styles.varDesc}>{v.description}</Text>
                    ) : v.points != null ? (
                      <Text style={styles.varDesc}>Vector6[ ] — populated by RunVision</Text>
                    ) : v.isBoolean ? (
                      <Text style={styles.varDesc}>Boolean — initial: {v.value !== 0 ? "True" : "False"}</Text>
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

        {/* Steps */}
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
                isBeingDragged={drag?.id === step.id && !drag.loopId}
                isDropAbove={!!(drag && !drag.loopId && drag.id !== step.id && drag.toIndex < drag.fromIndex && drag.toIndex === i)}
                isDropBelow={!!(drag && !drag.loopId && drag.id !== step.id && drag.toIndex > drag.fromIndex && drag.toIndex === i)}
                isDragging={!!(drag && !drag.loopId)}
                collapsed={collapsedLoops.has(step.id)}
                innerDrag={drag?.loopId === step.id ? drag : null}
                onToggleCollapse={() => toggleLoop(step.id)}
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
                onInsertInner={() => openTypePicker({ mode: "appendLoop", loopId: step.id })}
                onPasteInner={clipboard ? () => pasteStep({ mode: "appendLoop", loopId: step.id }) : undefined}
                onEditInner={inner => { setEditingStep(inner); setConfigOpen(true); }}
                onCopyInner={inner => setClipboard(inner)}
                onDeleteInner={id => Alert.alert("Delete Step", "Remove this inner step?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteStep(id) },
                ])}
                onInsertAfterInner={j => openTypePicker({ mode: "insertLoop", loopId: step.id, afterIndex: j })}
                onPasteAfterInner={clipboard ? j => pasteStep({ mode: "insertLoop", loopId: step.id, afterIndex: j }) : undefined}
                onInsertIfInner={(branchKey, afterIndex) =>
                  afterIndex !== undefined
                    ? openTypePicker({ mode: "insertIf", stepId: step.id, branchKey, afterIndex })
                    : openTypePicker({ mode: "appendIf", stepId: step.id, branchKey })
                }
                onPasteIfInner={clipboard ? (branchKey, afterIndex) =>
                  afterIndex !== undefined
                    ? pasteStep({ mode: "insertIf", stepId: step.id, branchKey, afterIndex })
                    : pasteStep({ mode: "appendIf", stepId: step.id, branchKey })
                : undefined}
                onUpdateIfCondition={updateStep}
                onItemLayout={handleItemLayout}
                variables={variables}
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


      <StepTypePicker
        visible={typePickerOpen}
        onPick={addStep}
        onClose={() => setTypePickerOpen(false)}
      />
      <StepConfigModal
        visible={configOpen}
        step={editingStep}
        variables={variables}
        scopeSteps={editingScope}
        stepIndex={editingStepIndex}
        onSave={updateStep}
        onClose={() => setConfigOpen(false)}
      />
      <VariableEditModal
        visible={varModalOpen}
        variable={editingVar}
        onSave={saveVar}
        onClose={() => setVarModalOpen(false)}
      />
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
