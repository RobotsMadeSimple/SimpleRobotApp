import React, { useRef } from "react";
import {
  PanResponder,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowRight, ClipboardPaste, Copy, GripVertical, Plus, Trash2 } from "lucide-react-native";
import { ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { sharedStyles } from "./builderStyles";
import { STEP_THEME, StepIcon, stepDetail, stepLabel, ScopeFrame } from "./stepUtils";
import { IfConditionBody } from "./IfConditionBody";

// ── Insert divider ────────────────────────────────────────────────────────────

export function InsertDivider({
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
    <View style={[sharedStyles.insertDivider, inner && sharedStyles.insertDividerInner]}>
      <View style={sharedStyles.insertLine} />
      <TouchableOpacity onPress={disabled ? undefined : onPress} activeOpacity={disabled ? 1 : 0.6} hitSlop={4} disabled={disabled}>
        <View style={sharedStyles.insertBtn}>
          <Plus size={10} color={disabled ? "#d1d5db" : "#2563eb"} />
        </View>
      </TouchableOpacity>
      {onPaste && (
        <TouchableOpacity onPress={disabled ? undefined : onPaste} activeOpacity={disabled ? 1 : 0.6} hitSlop={4} disabled={disabled}>
          <View style={sharedStyles.insertPasteBtn}>
            <ClipboardPaste size={10} color={disabled ? "#d1d5db" : "#7c3aed"} />
          </View>
        </TouchableOpacity>
      )}
      <View style={sharedStyles.insertLine} />
    </View>
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

export function DragHandle({
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
    <View {...responder.panHandlers} style={sharedStyles.dragHandle} hitSlop={6}>
      <GripVertical size={16} color="#d1d5db" />
    </View>
  );
}

// ── Top-level step card ───────────────────────────────────────────────────────

export function StepRow({
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
  onOpenCncBuilder,
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
  onOpenCncBuilder?: (stepId: string) => void;
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
  const detailLines   = detail ? detail.split("\n") : [];

  return (
    <View
      onLayout={e => onItemLayout(step.id, e.nativeEvent.layout.height)}
      style={[
        isBeingDragged && sharedStyles.draggingItem,
        isDropAbove    && sharedStyles.dropTargetItemTop,
        isDropBelow    && sharedStyles.dropTargetItemBottom,
      ]}
    >
      <View style={[sharedStyles.stepCard, { borderLeftColor: theme.accent }]}>

        {/* Card header row */}
        <TouchableOpacity style={sharedStyles.stepCardHeader} onPress={onEdit} activeOpacity={0.75}>
          <DragHandle stepId={step.id} onStart={onDragStart} onMove={onDragMove} onEnd={onDragEnd} />

          <View style={[sharedStyles.stepCardIcon, { backgroundColor: theme.iconBg }]}>
            <StepIcon type={step.type} size={18} color={theme.iconColor} />
          </View>

          <View style={sharedStyles.stepCardText}>
            <Text style={[sharedStyles.stepCardType, { color: theme.accent }]}>
              {index + 1} · {theme.label.toUpperCase()}
            </Text>
            {(!isSetSpeed || !!step.name) && (
              <Text style={sharedStyles.stepCardName} numberOfLines={1}>
                {step.name || (isMoveStep ? (detailLines[0] ?? step.type) : (detail ?? step.type))}
              </Text>
            )}
            {isSetSpeed && detailLines.map((line, i) => (
              <Text key={i} style={sharedStyles.stepCardDetail}>{line}</Text>
            ))}
            {isMoveStep && (step.name ? detailLines : detailLines.slice(1)).map((line, i) => (
              <Text key={i} style={sharedStyles.stepCardDetail} numberOfLines={1}>{line}</Text>
            ))}
            {!isSetSpeed && !isMoveStep && !!step.name && detail && (
              <Text style={sharedStyles.stepCardDetail} numberOfLines={1}>{detail}</Text>
            )}
            {step.statusMessage && !step.name && step.type !== "StatusUpdate" && (
              <Text style={sharedStyles.stepCardStatus} numberOfLines={1}>{step.statusMessage}</Text>
            )}
          </View>

          <TouchableOpacity onPress={onCopy}   hitSlop={8} style={sharedStyles.cardAction} activeOpacity={0.7}>
            <Copy   size={15} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={sharedStyles.cardAction} activeOpacity={0.7}>
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
        {step.type === "CallRoutine" && step.routineName && onEnterRoutine && (
          <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
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
          <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => onEnterScope({ kind: "loop", stepId: step.id, label: stepLabel(step) })}
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

        {/* CNC Program body — open dedicated builder */}
        {step.type === "CncProgram" && onOpenCncBuilder && (
          <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 }}
              onPress={() => onOpenCncBuilder(step.id)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: "#64748b" }}>
                {(step.cncProgramSteps ?? []).length / 2 | 0} hole{(step.cncProgramSteps ?? []).length / 2 !== 1 ? "s" : ""}{step.cncDxfFile ? `  ·  ${step.cncDxfFile}` : ""}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.iconColor }}>Open</Text>
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
