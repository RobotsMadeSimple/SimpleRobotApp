import {
  ArrowRight,
  Bookmark,
  ChevronsRight,
  GitBranch,
  CornerUpLeft,
  Clock,
  Cpu,
  Gauge,
  Grid3x3,
  Hash,
  Hourglass,
  ImagePlus,
  Layers,
  Timer,
  MessageSquare,
  OctagonX,
  PauseCircle,
  Play,
  Radio,
  RefreshCw,
  RotateCw,
  Repeat2,
  ScanSearch,
  Square,
  Wrench,
  Home,
  Zap,
} from "lucide-react-native";
import React from "react";
import { ConditionGroup, ElseIfBranch, Grid, ProgramStep, RobotStack, StepType, THREAD_PRESETS } from "@/src/models/robotModels";

// ── ID generation ──────────────────────────────────────────────────────────────

export function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// ── Step label ─────────────────────────────────────────────────────────────────

export function stepLabel(step: ProgramStep): string {
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
    case "SetBlendRadius": return `Set Blend Radius  →  ${step.blendRadius ?? 0} mm`;
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
    case "CncProgram":
      return step.cncDxfFile ?? "(no DXF selected)";
    default:              return step.type;
  }
}

// ── Step icon ─────────────────────────────────────────────────────────────────

export function StepIcon({ type, size = 16, color = "#6b7280" }: { type: StepType; size?: number; color?: string }) {
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
    case "SetBlendRadius": return <CornerUpLeft size={size} color={color} />;
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
    case "ThreadMove":         return <RotateCw      size={size} color={color} />;
    case "CncProgram":         return <Cpu           size={size} color={color} />;
    default:               return <Cpu           size={size} color={color} />;
  }
}

// ── Step theme ────────────────────────────────────────────────────────────────

export const STEP_THEME: Record<string, { accent: string; iconBg: string; iconColor: string; label: string }> = {
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
  SetBlendRadius: { accent: "#0284c7", iconBg: "#e0f2fe", iconColor: "#0284c7", label: "Set Blend Radius" },
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
  ThreadMove:       { accent: "#2563eb", iconBg: "#dbeafe", iconColor: "#2563eb", label: "Thread Move"        },
  CncProgram:       { accent: "#7c3aed", iconBg: "#ede9fe", iconColor: "#7c3aed", label: "CNC Program"         },
};

// ── Move modifier formatting ──────────────────────────────────────────────────

export function fmtMoveModifiers(step: ProgramStep): string[] {
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

// ── fmtSetVar (needed by stepDetail and stepLabel) ────────────────────────────

export function fmtSetVar(varName: string | undefined, expr: string | undefined): string {
  if (!varName) return "Set Variable";
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = expr?.match(new RegExp(`^\\$${escapeRegex(varName)}\\s*([+\\-*/])\\s*(.+)$`));
  if (!m) return `$${varName} = ${expr || "?"}`;
  const opMap: Record<string, string> = { "+": "+=", "-": "-=", "*": "×=", "/": "/=" };
  const op  = opMap[m[1]] ?? "=";
  const val = m[2].trim();
  return op === "=" ? `$${varName} = ${val || "?"}` : `$${varName} ${op} ${val || "?"}`;
}

// ── Condition formatting ──────────────────────────────────────────────────────

/** Spells out every item of a condition group joined by AND/OR (not just a count). */
export function fmtConditionFull(group: ConditionGroup | undefined): string {
  const items = group?.items ?? [];
  if (items.length === 0) return "(no conditions)";
  const join = group!.combinator === "ANY" ? "  OR  " : "  AND  ";
  return items.map(i => `${i.left || "?"} ${i.operator} ${i.right || "?"}`).join(join);
}

// ── Step detail ───────────────────────────────────────────────────────────────

export function stepDetail(step: ProgramStep, grids?: Grid[], stacks?: RobotStack[]): string | null {
  switch (step.type) {
    case "MoveL":
    case "MoveJ": {
      const target = step.gridPoint ? "grid point"
        : step.stackPoint ? "stack point"
        : step.varPointName ? `$${step.varPointName}[${step.varPointIndex ?? "0"}]`
        : (step.pointName ?? "current pos");
      const lines = [`→ ${target}`];
      const spd = step.expressions?.speed ?? (step.speed != null ? `${step.speed} mm/s` : null);
      if (spd) lines.push(spd);
      const acc = step.expressions?.accel ?? (step.accel != null ? `${step.accel} mm/s²` : null);
      const dec = step.expressions?.decel ?? (step.decel != null ? `${step.decel} mm/s²` : null);
      if (acc) lines.push(`accel ${acc}`);
      if (dec) lines.push(`decel ${dec}`);
      if (step.localName) lines.push(`local: ${step.localName}`);
      if (step.type === "MoveL" && step.blend)
        lines.push(step.blendRadius != null ? `blend ${step.blendRadius} mm` : "blend on");
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
      if (step.jumpZStart != null || step.jumpZEnd != null) {
        const s = step.jumpZStart != null ? `start ${step.jumpZStart}` : null;
        const e = step.jumpZEnd   != null ? `end ${step.jumpZEnd}`     : null;
        lines.push(`Jump height  ${[s, e].filter(Boolean).join("  ·  ")}`);
      } else if (step.jumpZ != null) {
        lines.push(`Jump height ${step.jumpZ} mm`);
      }
      if (step.speed != null) lines.push(`${step.speed} mm/s`);
      if (step.accel != null) lines.push(`accel ${step.accel} mm/s²`);
      if (step.decel != null) lines.push(`decel ${step.decel} mm/s²`);
      if (step.localName) lines.push(`local: ${step.localName}`);
      if (step.type === "JumpL" && step.blend)
        lines.push(step.blendRadius != null ? `blend ${step.blendRadius} mm` : "blend on");
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
      if (step.pulseMs && step.pulseMs > 0) lines.push(`Pulse  ${step.pulseMs} ms${step.pulseBlocking ? "  (blocking)" : ""}`);
      return lines.join('\n');
    }
    case "Wait": {
      if (step.waitMode === 'condition') {
        const lines = [`until  ${fmtConditionFull(step.waitCondition)}`];
        const parts: string[] = [];
        if (step.waitTimeoutMs) parts.push(`max ${step.waitTimeoutMs} ms`);
        if (step.waitTimeoutVariableName) parts.push(`timeout → $${step.waitTimeoutVariableName}`);
        if (parts.length) lines.push(parts.join("  ·  "));
        return lines.join("\n");
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
        return `while  ${fmtConditionFull(g)}`;
      }
      const loopExpr = step.expressions?.loopCount;
      const countStr = `×${loopExpr ?? (step.loopCount === 0 ? "∞" : (step.loopCount ?? 1))}`;
      return step.forEachIndexVariableName ? `${countStr}  ·  index → $${step.forEachIndexVariableName}` : countStr;
    }
    case "StatusUpdate":
      return step.statusMessage || null;
    case "CallRoutine":
      return step.routineName ? `→ ${step.routineName}` : null;
    case "RunVision": {
      const lines: string[] = [];
      if (step.visionProgramName) lines.push(`→ ${step.visionProgramName}`);
      if (step.visionZoneVar) lines.push(`zone → $${step.visionZoneVar}`);
      else if (step.visionZoneId) lines.push(`zone override`);
      const outN = (step.visionOutputs?.length ?? 0) + (step.colorOutputs?.length ?? 0)
        + (step.polygonOutputs?.length ?? 0) + (step.arucoOutputs?.length ?? 0);
      if (outN > 0) lines.push(`${outN} output${outN !== 1 ? "s" : ""} → variables`);
      return lines.length ? lines.join("\n") : null;
    }
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
    case "SetBlendRadius":
      return `${step.blendRadius ?? 0} mm`;
    case "SetVariable":
      return step.variableName ? fmtSetVar(step.variableName, step.variableExpr) : null;
    case "Label":
      return step.labelName ? `⬤ ${step.labelName}` : null;
    case "GoToLabel":
      return step.labelName ? `↩ ${step.labelName}` : null;
    case "IfCondition":
      // Conditions are shown on the IF / ELSE-IF branch cards in the body below,
      // so don't repeat them in the card header.
      return null;
    case "SetTool":
      return step.toolName  ? `→ ${step.toolName}`  : "→ None";
    case "SetLocal":
      return step.localName ? `→ ${step.localName}` : "→ None";
    case "ClearLocal":
      return null;
    case "RunHoming":
      return "Runs the full homing sequence";
    case "AuxMove": {
      const unit   = step.auxUnit ?? "steps";
      const amount = step.auxUnit && step.auxDistance != null ? `${step.auxDistance} ${unit}`
        : step.auxSteps != null ? `${step.auxSteps} steps`
        : null;
      const parts: string[] = [];
      if (amount) parts.push(amount);
      parts.push(step.auxAbsolute ? "absolute" : "relative");
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
    case "StopwatchControl": {
      const action = step.stopwatchAction ?? "Start";
      return step.stopwatchVariableName ? `${action}  ·  $${step.stopwatchVariableName}` : action;
    }
    case "ThreadMove": {
      const parts: string[] = [];
      if (step.threadDistance != null) parts.push(`${step.threadDistance} mm`);
      if (step.threadPitch != null) {
        const preset = THREAD_PRESETS.find(p => Math.abs(p.pitch - step.threadPitch!) < 0.001);
        parts.push(preset ? preset.label : `${step.threadPitch} mm/rev`);
      }
      if (step.threadPeck) parts.push(`peck ${step.threadPeckDepth ?? '?'} mm`);
      if (step.threadReverseOut) parts.push('reverse out');
      return parts.length ? parts.join('  ·  ') : null;
    }
    case "CncProgram": {
      const n = Math.floor((step.cncProgramSteps ?? []).length / 2);
      const parts = [`${n} hole${n !== 1 ? 's' : ''}`];
      if (step.cncSafeZ != null) parts.push(`safe Z ${step.cncSafeZ} mm`);
      return parts.join('  ·  ');
    }
    default:
      return null;
  }
}

// ── Step type list, map, and categories ───────────────────────────────────────

export const STEP_TYPES: { type: StepType; label: string; desc: string }[] = [
  { type: "MoveL",        label: "Move Linear",   desc: "Move to a saved point in a straight line" },
  { type: "MoveJ",        label: "Move Joint",    desc: "Move to a saved point via joint interpolation" },
  { type: "ThreadMove",   label: "Thread Move",   desc: "Move the tool in Z while rotating RZ to follow a thread — set distance and pitch" },
  { type: "JumpL",        label: "Jump Linear",   desc: "Lift, move linearly over the target, then lower — avoids obstacles" },
  { type: "JumpJ",        label: "Jump Joint",    desc: "Lift, move via joint interpolation over the target, then lower — avoids obstacles" },
  { type: "SetOutput",    label: "Set Output",    desc: "Turn a digital output ON or OFF" },
  { type: "Wait",         label: "Wait",          desc: "Pause execution for a set duration" },
  { type: "Loop",         label: "Loop",          desc: "Repeat a block of steps N times" },
  { type: "StatusUpdate", label: "Status Update", desc: "Publish a message, warning, or error to the monitor" },
  { type: "CallRoutine",  label: "Call Routine",  desc: "Run a saved routine inline then continue" },
  { type: "SetSpeedL",    label: "Set Speed (Linear)", desc: "Update the linear move speed, accel and decel" },
  { type: "SetSpeedJ",    label: "Set Speed (Joint)",  desc: "Update the joint move speed, accel and decel" },
  { type: "SetBlendRadius", label: "Set Blend Radius", desc: "Set the default corner blend radius for subsequent blended MoveL steps" },
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
  { type: "CncProgram",      label: "CNC Program",            desc: "Generate a CNC threading toolpath from a DXF file — select holes and produce MoveL + ThreadMove steps" },
];

export const STEP_TYPE_MAP = Object.fromEntries(STEP_TYPES.map(s => [s.type, s])) as Record<string, typeof STEP_TYPES[0]>;

export const BACKGROUND_RESTRICTED: Set<StepType> = new Set([
  "MoveL", "MoveJ", "JumpL", "JumpJ", "ThreadMove", "CncProgram",
  "SetTool", "SetSpeedL", "SetSpeedJ", "SetLocal", "ClearLocal", "RunHoming",
]);

export const STEP_CATEGORIES: { label: string; color: string; types: StepType[] }[] = [
  { label: "Motion",       color: "#2563eb", types: ["MoveL", "MoveJ", "JumpL", "JumpJ", "ThreadMove"] },
  { label: "Flow",         color: "#0891b2", types: ["Loop", "IfCondition", "PauseProgram", "Label", "GoToLabel"] },
  { label: "I/O",          color: "#ea580c", types: ["SetOutput"] },
  { label: "Speed",        color: "#0284c7", types: ["SetSpeedL", "SetSpeedJ", "SetBlendRadius"] },
  { label: "Variables",    color: "#7c3aed", types: ["SetVariable"] },
  { label: "Vision",       color: "#0891b2", types: ["RunVision", "SaveImage"] },
  { label: "Aux Axes",     color: "#7c3aed", types: ["AuxMove", "AuxContinuous", "AuxStop", "AuxEnable"] },
  { label: "Tool & Frame", color: "#7c3aed", types: ["SetTool", "SetLocal", "ClearLocal"] },
  { label: "Utility",      color: "#475569", types: ["Wait", "StatusUpdate", "CallRoutine", "RunHoming"] },
  { label: "Background",   color: "#16a34a", types: ["StartBackground", "StopBackground", "WaitForBackground"] },
  { label: "Timing",       color: "#0891b2", types: ["StopwatchControl"] },
  { label: "CNC",          color: "#7c3aed", types: ["CncProgram"] },
];

// ── Insert target ─────────────────────────────────────────────────────────────

export type InsertTarget =
  | { mode: "append" }
  | { mode: "insert"; afterIndex: number };

// ── Drag info ─────────────────────────────────────────────────────────────────

export type DragInfo = {
  id: string;
  fromIndex: number;
  toIndex: number;
};

// ── Scope navigation ──────────────────────────────────────────────────────────

export type ScopeFrame = {
  kind: 'loop' | 'ifTrue' | 'elseIf' | 'else';
  stepId: string;
  label: string;
  branchId?: string;
};

export function getStepsAtScope(rootSteps: ProgramStep[], stack: ScopeFrame[]): ProgramStep[] {
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

export function setStepsAtScope(
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
