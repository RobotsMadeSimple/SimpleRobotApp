import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { useBuiltPrograms, useNanoIO, usePoints, useRelayIO, useTools } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { BuiltProgram, ProgramStep, ProgramVariable, StepType } from "@/src/models/robotModels";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
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
  GripVertical,
  Hash,
  ImagePlus,
  MessageSquare,
  OctagonX,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat2,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
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
  const inputRef = useRef<any>(null);

  // Sync when draft changes externally (modal re-opens)
  useEffect(() => {
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
      onChangeExpr(fieldKey, t);
    }
  }

  function insertVar(varName: string) {
    const ref = text.trim();
    const next = ref ? `${ref} + $${varName}` : `$${varName}`;
    setText(next);
    onChangeExpr(fieldKey, next);
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
          onBlur={() => commit(text)}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 6 }}
          contentContainerStyle={{ gap: 5 }}
          keyboardShouldPersistTaps="always"
        >
          {variables!.map(v => (
            <TouchableOpacity
              key={v.id}
              onPress={() => insertVar(v.name)}
              activeOpacity={0.7}
              style={exprStyles.chip}
            >
              <Text style={exprStyles.chipText}>${v.name}</Text>
              {v.description ? (
                <Text style={exprStyles.chipHint}>{v.description}</Text>
              ) : (
                <Text style={exprStyles.chipHint}>{v.value}</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
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
});

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function stepLabel(step: ProgramStep): string {
  switch (step.type) {
    case "MoveL":
    case "MoveJ": {
      const hasOffset    = step.offsetX || step.offsetY || step.offsetZ || step.offsetRX || step.offsetRY || step.offsetRZ;
      const hasToolOff   = step.toolOffsetX || step.toolOffsetY || step.toolOffsetZ || step.toolOffsetRX || step.toolOffsetRY || step.toolOffsetRZ;
      const suffix = [
        hasToolOff ? "toolOffset" : null,
        hasOffset  ? "offset"     : null,
      ].filter(Boolean).join("  ");
      const base = `${step.type}  →  ${step.pointName ?? "—"}`;
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
    case "Wait":         return `Wait  ${step.waitMs ?? 0} ms`;
    case "Loop": {
      const loopExpr = step.expressions?.loopCount;
      const loopVal  = loopExpr ? loopExpr : (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1));
      return `Loop  ×${loopVal}`;
    }
    case "StatusUpdate": return step.statusMessage ? `"${step.statusMessage}"` : "Status update";
    case "CallRoutine":  return step.routineName ? `Routine → ${step.routineName}` : "Call Routine";
    case "SetSpeedL":    return `Set Linear Speed  →  ${step.speed ?? "?"} mm/s`;
    case "SetSpeedJ":    return `Set Joint Speed  →  ${step.speed ?? "?"} mm/s`;
    case "SetVariable":  return step.variableName ? `$${step.variableName} = ${step.variableExpr ?? "?"}` : "Set Variable";
    default:             return step.type;
  }
}

function StepIcon({ type, size = 16, color = "#6b7280" }: { type: StepType; size?: number; color?: string }) {
  switch (type) {
    case "MoveL":
    case "MoveJ":        return <ArrowRight    size={size} color={color} />;
    case "SetOutput":    return <Zap           size={size} color={color} />;
    case "Wait":         return <Clock         size={size} color={color} />;
    case "Loop":         return <RefreshCw     size={size} color={color} />;
    case "StatusUpdate": return <MessageSquare size={size} color={color} />;
    case "CallRoutine":  return <Repeat2       size={size} color={color} />;
    case "SetSpeedL":
    case "SetSpeedJ":    return <Gauge         size={size} color={color} />;
    case "SetVariable":  return <Hash          size={size} color={color} />;
    default:             return <Cpu           size={size} color={color} />;
  }
}

// ── Step theme + card detail ──────────────────────────────────────────────────

const STEP_THEME: Record<string, { accent: string; iconBg: string; iconColor: string; label: string }> = {
  MoveL:        { accent: "#2563eb", iconBg: "#dbeafe", iconColor: "#2563eb", label: "Move Linear"  },
  MoveJ:        { accent: "#2563eb", iconBg: "#dbeafe", iconColor: "#2563eb", label: "Move Joint"   },
  SetOutput:    { accent: "#ea580c", iconBg: "#fed7aa", iconColor: "#ea580c", label: "Set Output"   },
  Wait:         { accent: "#d97706", iconBg: "#fde68a", iconColor: "#b45309", label: "Wait"         },
  Loop:         { accent: "#7c3aed", iconBg: "#ddd6fe", iconColor: "#7c3aed", label: "Loop"         },
  StatusUpdate: { accent: "#475569", iconBg: "#e2e8f0", iconColor: "#475569", label: "Status Update"},
  CallRoutine:  { accent: "#16a34a", iconBg: "#bbf7d0", iconColor: "#16a34a", label: "Call Routine" },
  SetSpeedL:    { accent: "#0284c7", iconBg: "#e0f2fe", iconColor: "#0284c7", label: "Set Speed (Linear)" },
  SetSpeedJ:    { accent: "#0d9488", iconBg: "#ccfbf1", iconColor: "#0d9488", label: "Set Speed (Joint)"  },
  SetVariable:  { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "Set Variable"       },
};

function stepDetail(step: ProgramStep): string | null {
  switch (step.type) {
    case "MoveL":
    case "MoveJ": {
      const parts: string[] = [];
      if (step.pointName) parts.push(`→ ${step.pointName}`);
      if (step.speed != null) parts.push(`${step.speed} mm/s`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "SetOutput":
      return `Output ${step.outputNumber ?? 1}  →  ${step.outputValue ? "ON" : "OFF"}`;
    case "Wait":
      return `${step.waitMs ?? 0} ms`;
    case "Loop": {
      const loopExpr = step.expressions?.loopCount;
      return `×${loopExpr ?? (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1))}`;
    }
    case "StatusUpdate":
      return step.statusMessage || null;
    case "CallRoutine":
      return step.routineName ? `→ ${step.routineName}` : null;
    case "SetSpeedL":
    case "SetSpeedJ": {
      const parts: string[] = [];
      if (step.speed != null)  parts.push(`${step.speed} mm/s`);
      if (step.accel != null)  parts.push(`accel ${step.accel}`);
      if (step.decel != null)  parts.push(`decel ${step.decel}`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "SetVariable":
      return step.variableName
        ? `$${step.variableName} = ${step.variableExpr ?? "?"}`
        : null;
    default:
      return null;
  }
}

const STEP_TYPES: { type: StepType; label: string; desc: string }[] = [
  { type: "MoveL",        label: "Move Linear",   desc: "Move to a saved point in a straight line" },
  { type: "MoveJ",        label: "Move Joint",    desc: "Move to a saved point via joint interpolation" },
  { type: "SetOutput",    label: "Set Output",    desc: "Turn a digital output ON or OFF" },
  { type: "Wait",         label: "Wait",          desc: "Pause execution for a set duration" },
  { type: "Loop",         label: "Loop",          desc: "Repeat a block of steps N times" },
  { type: "StatusUpdate", label: "Status Update", desc: "Publish a message, warning, or error to the monitor" },
  { type: "CallRoutine",  label: "Call Routine",  desc: "Run a saved routine inline then continue" },
  { type: "SetSpeedL",    label: "Set Speed (Linear)", desc: "Update the linear move speed, accel and decel" },
  { type: "SetSpeedJ",    label: "Set Speed (Joint)",  desc: "Update the joint move speed, accel and decel" },
  { type: "SetVariable",  label: "Set Variable",       desc: "Assign a new value or expression to a program variable" },
];

// ── Insert target — tracks where the next step should be placed ───────────────

type InsertTarget =
  | { mode: "append" }
  | { mode: "insert";      afterIndex: number }
  | { mode: "appendLoop";  loopId: string }
  | { mode: "insertLoop";  loopId: string; afterIndex: number };

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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Step config modal ─────────────────────────────────────────────────────────

type SubPage = null | "point" | "speed" | "posOffset" | "toolOffset";

function StepConfigModal({
  visible,
  step,
  variables,
  onSave,
  onClose,
}: {
  visible: boolean;
  step: ProgramStep | null;
  variables?: ProgramVariable[];
  onSave: (updated: ProgramStep) => void;
  onClose: () => void;
}) {
  const points        = usePoints();
  const allPrograms   = useBuiltPrograms();
  const routines      = allPrograms.filter(p => p.isRoutine);
  const nanos         = useNanoIO();
  const relay         = useRelayIO();
  const [draft, setDraft]           = useState<ProgramStep | null>(null);
  const [waitMsText, setWaitMs]     = useState("");
  const [pulseMsText, setPulseMs]   = useState("");
  const [subPage, setSubPage]       = useState<SubPage>(null);

  useEffect(() => {
    if (step) {
      setDraft({ ...step });
      setWaitMs(step.waitMs !== undefined ? String(step.waitMs) : "");
      setPulseMs(step.pulseMs !== undefined && step.pulseMs > 0 ? String(step.pulseMs) : "");
    } else {
      setDraft(null);
      setWaitMs("");
      setPulseMs("");
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

  const hasOffset  = draft.offsetX || draft.offsetY || draft.offsetZ ||
                     draft.offsetRX || draft.offsetRY || draft.offsetRZ;
  const hasToolOff = draft.toolOffsetX || draft.toolOffsetY || draft.toolOffsetZ ||
                     draft.toolOffsetRX || draft.toolOffsetRY || draft.toolOffsetRZ;

  // ── Sub-page content ──────────────────────────────────────────────────────

  function renderSubPage() {
    switch (subPage) {
      case "point":
        return (
          <>
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
        );

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

      case "posOffset":
        return (
          <>
            <View style={ms.twoCol}>
              {(["offsetX","offsetY","offsetZ"] as const).map(k => (
                <View key={k} style={ms.twoColItem}>
                  <Text style={ms.fieldLabel}>{k.replace("offset","").toUpperCase()}  (mm)</Text>
                  <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                    value={draft![k]} expressions={draft!.expressions}
                    onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
                </View>
              ))}
            </View>
            <View style={[ms.twoCol, { marginTop: 8 }]}>
              {(["offsetRX","offsetRY","offsetRZ"] as const).map(k => (
                <View key={k} style={ms.twoColItem}>
                  <Text style={ms.fieldLabel}>{k.replace("offset","").toUpperCase()}  (°)</Text>
                  <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                    value={draft![k]} expressions={draft!.expressions}
                    onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => set({ offsetX:undefined,offsetY:undefined,offsetZ:undefined,offsetRX:undefined,offsetRY:undefined,offsetRZ:undefined })}
              style={{ marginTop: 12 }} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>Clear offset</Text>
            </TouchableOpacity>
          </>
        );

      case "toolOffset":
        return (
          <>
            <View style={ms.twoCol}>
              {(["toolOffsetX","toolOffsetY","toolOffsetZ"] as const).map(k => (
                <View key={k} style={ms.twoColItem}>
                  <Text style={ms.fieldLabel}>{k.replace("toolOffset","").toUpperCase()}  (mm)</Text>
                  <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                    value={draft![k]} expressions={draft!.expressions}
                    onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
                </View>
              ))}
            </View>
            <View style={[ms.twoCol, { marginTop: 8 }]}>
              {(["toolOffsetRX","toolOffsetRY","toolOffsetRZ"] as const).map(k => (
                <View key={k} style={ms.twoColItem}>
                  <Text style={ms.fieldLabel}>{k.replace("toolOffset","").toUpperCase()}  (°)</Text>
                  <ExpressionInput key={draft!.id + k} style={ms.input} fieldKey={k}
                    value={draft![k]} expressions={draft!.expressions}
                    onChangeValue={n => set({ [k]: n })} onChangeExpr={setExpr} variables={variables} />
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => set({ toolOffsetX:undefined,toolOffsetY:undefined,toolOffsetZ:undefined,toolOffsetRX:undefined,toolOffsetRY:undefined,toolOffsetRZ:undefined })}
              style={{ marginTop: 12 }} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>Clear offset</Text>
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
      case "MoveJ":
        return (
          <>
            <TouchableOpacity style={ms.subRow} onPress={() => setSubPage("point")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Point</Text>
                <Text style={ms.subRowValue}>{draft!.pointName ?? "Not set"}</Text>
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
            <TouchableOpacity style={[ms.subRow, { borderBottomWidth: 0 }]} onPress={() => setSubPage("toolOffset")} activeOpacity={0.7}>
              <View style={ms.subRowLeft}>
                <Text style={ms.subRowLabel}>Tool Offset</Text>
                <Text style={ms.subRowValue}>{hasToolOff ? "Set" : "None"}</Text>
              </View>
              <ChevronRight size={16} color="#d1d5db" />
            </TouchableOpacity>
          </>
        );

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
                { key: "stb",   label: "STB4100", Icon: CircuitBoard, color: "#16a34a" },
                { key: "relay", label: "Relay",   Icon: Radio,        color: "#0891b2" },
                { key: "nano",  label: "Nano",    Icon: Cpu,          color: "#4f46e5" },
              ] as const).map(({ key, label, Icon, color }) => {
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
                <Text style={ms.hintText}>
                  Output goes {draft!.outputValue ? "ON" : "OFF"} immediately, then flips {draft!.outputValue ? "OFF" : "ON"} after the pulse. Program continues without waiting.
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
            {draft!.expressions?.waitMs ? (
              <ExpressionInput style={ms.input} fieldKey="waitMs"
                value={draft!.waitMs} expressions={draft!.expressions}
                onChangeValue={v => { set({ waitMs: v !== undefined ? Math.round(v) : undefined }); setWaitMs(v !== undefined ? String(Math.round(v)) : ""); }}
                onChangeExpr={setExpr} variables={variables} autoFocus />
            ) : (
              <>
                <View style={[ms.input, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: "#111827" }}
                    value={waitMsText}
                    onChangeText={v => { if (v === "" || /^\d+$/.test(v)) setWaitMs(v); }}
                    keyboardType="numeric" selectTextOnFocus autoFocus
                  />
                  <TouchableOpacity onPress={() => setExpr("waitMs", "$")} hitSlop={8} activeOpacity={0.7} style={{ paddingLeft: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#a78bfa" }}>$</Text>
                  </TouchableOpacity>
                </View>
                {waitMsText === "" && <Text style={ms.fieldError}>Enter a duration to save this step.</Text>}
              </>
            )}
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

      case "StatusUpdate":
        return (
          <>
            <Text style={ms.fieldLabel}>STEP MESSAGE</Text>
            <TextInput style={ms.input} value={draft!.statusMessage ?? ""}
              onChangeText={v => set({ statusMessage: v })}
              placeholder="e.g. Picking part from tray…" placeholderTextColor="#c4c4c4"
              returnKeyType="done" autoFocus />
            <Text style={ms.hintText}>Appears as the current step description in the monitor.</Text>
          </>
        );

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
              value={draft!.speed ?? 100} expressions={draft!.expressions}
              onChangeValue={v => set({ speed: v })} onChangeExpr={setExpr} variables={variables} autoFocus />
            <View style={ms.twoCol}>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>ACCEL  (mm/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="accel"
                  value={draft!.accel ?? 100} expressions={draft!.expressions}
                  onChangeValue={v => set({ accel: v })} onChangeExpr={setExpr} variables={variables} />
              </View>
              <View style={ms.twoColItem}>
                <Text style={[ms.fieldLabel, { marginTop: 10 }]}>DECEL  (mm/s²)</Text>
                <ExpressionInput style={ms.input} fieldKey="decel"
                  value={draft!.decel ?? 100} expressions={draft!.expressions}
                  onChangeValue={v => set({ decel: v })} onChangeExpr={setExpr} variables={variables} />
              </View>
            </View>
          </>
        );
      }

      case "SetVariable": {
        const varNames = (variables ?? []).map(v => v.name);
        return (
          <>
            <Text style={ms.fieldLabel}>VARIABLE</Text>
            {varNames.length === 0 ? (
              <Text style={ms.emptyHint}>
                No variables defined. Add variables in the Variables section of the builder.
              </Text>
            ) : (
              <View style={ms.segRow}>
                {varNames.map(n => {
                  const active = draft!.variableName === n;
                  return (
                    <TouchableOpacity key={n} style={[ms.seg, active && ms.segActive]}
                      onPress={() => set({ variableName: n })} activeOpacity={0.8}>
                      <Text style={[ms.segText, active && ms.segTextActive]}>${n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <Text style={[ms.fieldLabel, { marginTop: 12 }]}>NEW VALUE  (expression)</Text>
            <Text style={ms.hintText}>
              Use a number or an expression: <Text style={{ color: "#7c3aed", fontWeight: "600" }}>$counter + 1</Text>
            </Text>
            <TextInput
              style={[ms.input, { color: draft!.variableExpr ? "#7c3aed" : "#111827" }]}
              value={draft!.variableExpr ?? ""}
              onChangeText={v => set({ variableExpr: v || undefined })}
              placeholder="e.g. $counter + 1"
              placeholderTextColor="#c4b5fd"
              returnKeyType="done"
              autoFocus={varNames.length === 0 ? false : !draft!.variableName}
            />
          </>
        );
      }

      default:
        return null;
    }
  }

  const subPageTitle: Record<NonNullable<SubPage>, string> = {
    point: "Select Point", speed: "Override Speed",
    posOffset: "Position Offset", toolOffset: "Tool Offset",
  };

  const isMove     = draft.type === "MoveL"    || draft.type === "MoveJ";
  const isSetSpeed = draft.type === "SetSpeedL" || draft.type === "SetSpeedJ" || draft.type === "SetVariable";

  return (
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

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                    if (draft!.type === "Wait") {
                      const ms = parseInt(waitMsText);
                      if (!waitMsText || isNaN(ms) || ms <= 0) return;
                      onSave({ ...draft!, waitMs: ms });
                    } else {
                      onSave(draft!);
                    }
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
  onMove: (id: string, dy: number, loopId?: string) => void;
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
      onPanResponderMove:      (_, gs)  => moveRef.current(sidRef.current, gs.dy, lidRef.current),
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
  onDragMove: (id: string, dy: number, loopId?: string) => void;
  onDragEnd: (id: string, loopId?: string) => void;
  onItemLayout: (id: string, height: number) => void;
}) {
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
          <Text style={styles.stepCardName} numberOfLines={1}>
            {step.name || (detail ?? step.type)}
          </Text>
          {step.name && detail && (
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
  onItemLayout,
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
  onDragMove: (id: string, dy: number, loopId?: string) => void;
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
  onItemLayout: (id: string, height: number) => void;
}) {
  const isLoop     = step.type === "Loop";
  const innerSteps = step.loopSteps ?? [];
  const isExpanded = isLoop && !collapsed;
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
            <Text style={styles.stepCardName} numberOfLines={1}>
              {step.name || (detail ?? step.type)}
            </Text>
            {step.name && detail && (
              <Text style={styles.stepCardDetail} numberOfLines={1}>{detail}</Text>
            )}
            {step.statusMessage && !step.name && step.type !== "StatusUpdate" && (
              <Text style={styles.stepCardStatus} numberOfLines={1}>{step.statusMessage}</Text>
            )}
          </View>

          {isLoop && (
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

        {/* Loop body — inner step cards */}
        {isExpanded && (
          <View style={[styles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            {innerSteps.length === 0 && (
              <Text style={styles.loopEmptyText}>No steps inside this loop</Text>
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
  const [name,  setName]  = useState("");
  const [value, setValue] = useState("0");
  const [desc,  setDesc]  = useState("");

  useEffect(() => {
    if (variable) {
      setName(variable.name);
      setValue(String(variable.value));
      setDesc(variable.description ?? "");
    } else {
      setName(""); setValue("0"); setDesc("");
    }
  }, [variable]);

  const isNew = variable === null;
  const canSave = name.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim());

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
          <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions.</Text>

          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
          <TextInput
            style={ms.input}
            value={value}
            onChangeText={v => { if (v === "" || /^-?\d*\.?\d*$/.test(v)) setValue(v); }}
            keyboardType="numbers-and-punctuation"
            selectTextOnFocus
          />

          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DESCRIPTION  (optional)</Text>
          <TextInput
            style={ms.input}
            value={desc}
            onChangeText={setDesc}
            placeholder="What this variable controls…"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
          />

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
                  value: parseFloat(value) || 0,
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
  const { name: editName, isRoutine: isRoutineParam } = useLocalSearchParams<{ name?: string; isRoutine?: string }>();
  const builtPrograms = useBuiltPrograms();
  const isRoutineMode = isRoutineParam === "1" || builtPrograms.find(p => p.name === editName)?.isRoutine === true;

  const existing = editName
    ? builtPrograms.find(p => p.name === editName) ?? null
    : null;

  const [programName, setProgramName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [steps, setSteps]             = useState<ProgramStep[]>(existing?.steps ?? []);
  const [variables, setVariables]     = useState<ProgramVariable[]>(existing?.variables ?? []);
  const [coverImage, setCoverImage]   = useState<string | null>(null);

  // Load existing cover image when editing
  useEffect(() => {
    if (!editName) return;
    robotClient.getProgramImages()
      .then(imgs => { if (imgs[editName]) setCoverImage(imgs[editName]!); })
      .catch(() => {});
  }, [editName]);

  // Assign fresh IDs to any steps that lost theirs during server round-trip
  function rehydrateIds(src: ProgramStep[]): ProgramStep[] {
    return src.map(s => ({
      ...s,
      id: s.id || newId(),
      loopSteps: s.loopSteps ? rehydrateIds(s.loopSteps) : s.loopSteps,
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
      loopSteps: step.loopSteps?.map(cloneStepWithNewIds),
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

  function handleDragMove(stepId: string, dy: number, loopId?: string) {
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
  }

  function handleDragEnd(stepId: string, loopId?: string) {
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
      outputNumber: 1, outputValue: false,
      waitMs: 500,
      loopCount: 1, loopSteps: type === "Loop" ? [] : undefined,
      statusMessage: undefined, statusWarning: undefined, statusError: undefined,
      routineName: undefined,
      variableName: undefined, variableExpr: undefined,
      expressions: undefined,
    };
  }

  function openTypePicker(target: InsertTarget) {
    insertTargetRef.current = target; // sync update so addStep always sees latest
    setInsertTarget(target);
    setTypePickerOpen(true);
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
      return prev.map(s =>
        s.loopSteps
          ? { ...s, loopSteps: s.loopSteps.map(ls => ls.id === updated.id ? updated : ls) }
          : s
      );
    });
  }

  function deleteStep(id: string) {
    setSteps(prev => {
      if (prev.some(s => s.id === id)) return prev.filter(s => s.id !== id);
      return prev.map(s =>
        s.loopSteps
          ? { ...s, loopSteps: s.loopSteps.filter(ls => ls.id !== id) }
          : s
      );
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

  async function save(): Promise<boolean> {
    const name = programName.trim();
    if (!name) {
      Alert.alert("Name required", "Please give the program a name.");
      return false;
    }
    const prog: BuiltProgram = {
      name, description: description.trim(), steps,
      variables: variables.length > 0 ? variables : undefined,
      lastUpdatedUnixMs: 0,
      isRoutine: isRoutineMode,
    };
    await robotClient.saveBuiltProgram(prog).catch(() => {});
    if (coverImage) {
      await robotClient.saveProgramImage(name, coverImage).catch(() => {});
    }
    return true;
  }

  async function handleSave() { if (await save()) router.back(); }

  async function handleRun() {
    if (!(await save())) return;
    const name = programName.trim();
    await robotClient.executeBuiltProgram(name).catch(() => {});
    router.push(`/(tabs)/program/monitor-program?name=${encodeURIComponent(name)}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <SubPageHeader title={isRoutineMode ? "Routine Builder" : "Program Builder"} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={drag === null}
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

          {/* Cover image row */}
          <View style={styles.imageRow}>
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
          </View>
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
                <View style={styles.varRow}>
                  <View style={styles.varInfo}>
                    <Text style={styles.varName}>${v.name}</Text>
                    {v.description ? (
                      <Text style={styles.varDesc}>{v.description}</Text>
                    ) : (
                      <Text style={styles.varDesc}>Initial: {v.value}</Text>
                    )}
                  </View>
                  <Text style={styles.varValue}>{v.value}</Text>
                  <TouchableOpacity onPress={() => openEditVar(v)} hitSlop={8} style={{ paddingHorizontal: 4 }} activeOpacity={0.7}>
                    <Text style={styles.varEditBtn}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => Alert.alert("Delete Variable", `Remove $${v.name}?`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => deleteVar(v.id) },
                    ])}
                    hitSlop={8} activeOpacity={0.7}
                  >
                    <Trash2 size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
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
                onItemLayout={handleItemLayout}
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
  varValue: { fontSize: 14, fontWeight: "600", color: "#374151", marginRight: 4 },
  varEditBtn: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
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
    backgroundColor: "#fff", borderRadius: 18, padding: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
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
    paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
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
