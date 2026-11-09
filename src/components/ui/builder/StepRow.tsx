import React, { useEffect, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  ArrowRight, Check, ChevronDown, ChevronRight, ClipboardPaste, Copy, GripVertical,
  MoreVertical, Plus, Power, StickyNote,
} from "lucide-react-native";
import { Point, ProgramStep, ProgramVariable, isStepEnabled } from "@/src/models/robotModels";
import { sharedStyles } from "./builderStyles";
import { colors, accents, radii } from "@/src/components/ui/kit";
import { STEP_THEME, StepIcon, categoryForStep, stepDetail, stepLabel, ScopeFrame } from "./stepUtils";
import { IfConditionBody } from "./IfConditionBody";
import { SwitchBody, type CaseEditRequest } from "./SwitchBody";
import { TryBody } from "./TryBody";
import { ProblemBadge, StepComment, stepHasError } from "./StepAnnotations";
import type { StepProblems } from "./useProgramValidation";

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
      <TouchableOpacity onPress={disabled ? undefined : onPress} activeOpacity={disabled ? 1 : 0.6} hitSlop={4} disabled={disabled}
        accessibilityRole="button" accessibilityLabel="Insert step here">
        <View style={sharedStyles.insertBtn}>
          <Plus size={10} color={disabled ? colors.borderStrong : colors.accent} />
        </View>
      </TouchableOpacity>
      {onPaste && (
        <TouchableOpacity onPress={disabled ? undefined : onPaste} activeOpacity={disabled ? 1 : 0.6} hitSlop={4} disabled={disabled}
          accessibilityRole="button" accessibilityLabel="Paste here">
          <View style={sharedStyles.insertPasteBtn}>
            <ClipboardPaste size={10} color={disabled ? colors.borderStrong : accents.purple} />
          </View>
        </TouchableOpacity>
      )}
      <View style={sharedStyles.insertLine} />
    </View>
  );
}

// ── Drag handle ───────────────────────────────────────────────────────────────

/** The drag bar of a reorderable row; pair with `useDragReorder` (src/components/ui). */
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
  useEffect(() => {
    sidRef.current   = stepId;
    startRef.current = onStart;
    moveRef.current  = onMove;
    endRef.current   = onEnd;
  });

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant:     ()       => startRef.current(sidRef.current),
      onPanResponderMove:      (_, gs)  => moveRef.current(sidRef.current, gs.dy, gs.moveY),
      onPanResponderRelease:   ()       => endRef.current(sidRef.current),
      onPanResponderTerminate: ()       => endRef.current(sidRef.current),
    })
  );

  return (
    <View {...responder.panHandlers} style={sharedStyles.dragHandle} hitSlop={6}
      accessibilityRole="adjustable" accessibilityLabel="Drag to reorder">
      <GripVertical size={16} color={colors.borderStrong} />
    </View>
  );
}

// ── Step row ──────────────────────────────────────────────────────────────────

export type DragHandlers = {
  onStart: (id: string) => void;
  onMove: (id: string, dy: number, absY: number) => void;
  onEnd: (id: string) => void;
};

/** An "Enter ›" footer row for a body that is not shown inline. */
function EnterFooter({ text, tint, onPress }: { text: string; tint: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.enterRow} onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={`Enter: ${text}`}>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{text}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: tint }}>Enter</Text>
        <ArrowRight size={13} color={tint} />
      </View>
    </TouchableOpacity>
  );
}

export function StepRow({
  step,
  index,
  isLast,
  isBeingDragged,
  dropAt,
  isDragging,
  drag,
  onRowLayout,
  onEdit,
  onCopy,
  onMore,
  onToggleEnabled,
  onInsertAfter,
  onPasteAfter,
  onEnterScope,
  onUpdateStep,
  ifEditRequest,
  caseEditRequest,
  variables,
  contextVariables,
  onEnterRoutine,
  onOpenCncBuilder,
  selectMode,
  selected,
  onLongPress,
  onToggleSelect,
  problems,
  points,
  breakpoint,
  running,
  searchHit,
  expanded,
  onToggleExpand,
  sectionCollapsed,
  hiddenCount,
  onToggleSection,
}: {
  step: ProgramStep;
  index: number;
  isLast: boolean;
  isBeingDragged: boolean;
  dropAt: "above" | "below" | null;
  isDragging: boolean;
  drag: DragHandlers;
  onRowLayout?: (e: { nativeEvent: { layout: { height: number } } }) => void;
  onEdit: () => void;
  onCopy: () => void;
  /** Opens the row's actions (run from here, breakpoint, delete, …). */
  onMore: () => void;
  onToggleEnabled: () => void;
  onInsertAfter: () => void;
  onPasteAfter?: () => void;
  onEnterScope: (frame: ScopeFrame) => void;
  /** Writes an edit made on the row itself (branch conditions, case values, added branches). */
  onUpdateStep: (updated: ProgramStep) => void;
  /** Opens an If branch's condition editor ("if" or an else-if id), e.g. right after adding it. */
  ifEditRequest?: { key: string; tick: number };
  /** Opens a Switch case's values editor. */
  caseEditRequest?: CaseEditRequest;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onEnterRoutine?: (routineName: string) => void;
  onOpenCncBuilder?: (stepId: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  /** Validation problems on this step or nested inside it. */
  problems?: StepProblems;
  /** Live saved points, used to resolve a move step's point name by stable id
   *  (so a rename shows the new name) and to flag an orphaned reference. */
  points?: Point[];
  /** The program pauses before this step (a red dot on the rail). */
  breakpoint?: boolean;
  /** The step the running program is on ("running"), or paused before ("paused"). */
  running?: boolean | "paused";
  /** Matches the step search. */
  searchHit?: boolean;
  /** Its body is shown inline below the row (block steps only). */
  expanded?: boolean;
  /** Present when the body can be shown inline (a chevron toggles it). */
  onToggleExpand?: () => void;
  /** Section notes: the steps up to the next section are folded away. */
  sectionCollapsed?: boolean;
  hiddenCount?: number;
  onToggleSection?: () => void;
}) {
  // Pulsing red wash over cards with validation ERRORS (warnings stay static).
  // A translucent danger overlay breathes 4%→14% opacity under the content.
  const isError = problems ? stepHasError(problems) : false;
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (isError) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 850, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
    return () => cancelAnimation(pulse);
  }, [isError, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.04 + pulse.value * 0.1 }));
  const isIfCondition = step.type === "IfCondition";
  // An If block has nothing to configure beyond its branches, so tapping its header opens the
  // IF condition editor directly (the body owns that modal; a tick nudges it open).
  const [ifEditTick, setIfEditTick] = useState(0);
  const isSetSpeed    = step.type === "SetSpeedL" || step.type === "SetSpeedJ"
                     || step.type === "Label"      || step.type === "GoToLabel";
  const theme         = STEP_THEME[step.type] ?? STEP_THEME["MoveL"];
  // A disabled step (and its body) is skipped at run time: dim the card and say so.
  const disabled      = !isStepEnabled(step);
  // The 4px rail carries the block's *category* colour, so a program reads as
  // bands of Motion / Logic / I-O at a glance; the icon tile and type label keep
  // the step's own theme so individual steps stay distinguishable within a band.
  const category      = categoryForStep(step.type);
  const isNote        = step.type === "Note";
  const isSection     = isNote && step.noteStyle === "section";
  const detail        = isNote ? null : stepDetail(step, undefined, undefined, points);
  const detailLines   = detail ? detail.split("\n") : [];
  const showName      = !(isSetSpeed || isIfCondition) || !!step.name;
  const bodyCompact   = !!expanded;

  const wrapperStyle = [
    isBeingDragged    && sharedStyles.draggingItem,
    dropAt === "above" && sharedStyles.dropTargetItemTop,
    dropAt === "below" && sharedStyles.dropTargetItemBottom,
  ];

  const actions = !selectMode && (
    <>
      <TouchableOpacity onPress={onToggleEnabled} hitSlop={8} style={sharedStyles.cardAction} activeOpacity={0.7}
        accessibilityRole="switch" accessibilityState={{ checked: !disabled }}
        accessibilityLabel={disabled ? "Enable step" : "Disable step"}>
        <Power size={15} color={disabled ? colors.danger : colors.textFaint} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onCopy} hitSlop={8} style={sharedStyles.cardAction} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel="Copy step">
        <Copy size={15} color={colors.textFaint} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onMore} hitSlop={8} style={sharedStyles.cardAction} activeOpacity={0.7}
        accessibilityRole="button" accessibilityLabel="Step actions">
        <MoreVertical size={16} color={colors.textFaint} />
      </TouchableOpacity>
    </>
  );

  const handle = selectMode ? (
    <View style={sharedStyles.dragHandle}>
      <View style={[sharedStyles.selectCheckbox, selected && sharedStyles.selectCheckboxOn]}>
        {selected && <Check size={13} color={colors.onAccent} strokeWidth={3} />}
      </View>
    </View>
  ) : (
    <DragHandle stepId={step.id} onStart={drag.onStart} onMove={drag.onMove} onEnd={drag.onEnd} />
  );

  const bpDot = breakpoint ? <View style={st.bpDot} pointerEvents="none" accessibilityLabel="Breakpoint" /> : null;

  // ── Notes and section headers: a light divider-style row ────────────────
  if (isNote) {
    const text = (step.comment ?? "").trim();
    return (
      <View onLayout={onRowLayout} style={wrapperStyle}>
        <View style={[
          st.noteCard, isSection && st.sectionCard,
          selected && sharedStyles.stepCardSelected,
          disabled && sharedStyles.stepCardDisabled,
          searchHit && st.searchHit,
        ]}>
          {bpDot}
          <TouchableOpacity style={st.noteHeader}
            onPress={selectMode ? onToggleSelect : onEdit} onLongPress={onLongPress} delayLongPress={300} activeOpacity={0.75}>
            {handle}
            {isSection ? (
              <TouchableOpacity onPress={onToggleSection} hitSlop={8} activeOpacity={0.7} disabled={!onToggleSection}
                accessibilityRole="button" accessibilityLabel={sectionCollapsed ? "Show section steps" : "Fold section steps"}>
                {sectionCollapsed
                  ? <ChevronRight size={18} color={colors.textSecondary} />
                  : <ChevronDown size={18} color={colors.textSecondary} />}
              </TouchableOpacity>
            ) : (
              <StickyNote size={15} color={colors.textMuted} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              {isSection ? (
                <Text style={st.sectionTitle} numberOfLines={1}>{text.split("\n")[0] || "Section"}</Text>
              ) : (
                <Text style={[st.noteText, !text && { color: colors.textFaint }]} numberOfLines={3}>{text || "Empty note — tap to write it"}</Text>
              )}
              {isSection && sectionCollapsed && !!hiddenCount && (
                <Text style={st.noteMeta}>{hiddenCount} step{hiddenCount === 1 ? "" : "s"} folded</Text>
              )}
              {disabled && <Text style={st.noteMeta}>DISABLED</Text>}
            </View>
            {actions}
          </TouchableOpacity>
        </View>
        {!isLast && <InsertDivider onPress={onInsertAfter} onPaste={onPasteAfter} disabled={isDragging} />}
      </View>
    );
  }

  return (
    <View onLayout={onRowLayout} style={wrapperStyle}>
      {problems && (
        <View style={sharedStyles.problemBadgeAnchor} pointerEvents="box-none">
          <ProblemBadge problems={problems} />
        </View>
      )}
      <View style={[
        sharedStyles.stepCard,
        { borderLeftColor: category.color },
        problems && (stepHasError(problems) ? sharedStyles.stepCardError : sharedStyles.stepCardWarning),
        selected && sharedStyles.stepCardSelected,
        disabled && sharedStyles.stepCardDisabled,
        searchHit && st.searchHit,
        running && st.running,
      ]}>
        {isError && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.danger, borderRadius: radii.lg }, pulseStyle]}
          />
        )}
        {bpDot}

        {/* Card header row */}
        <TouchableOpacity
          style={sharedStyles.stepCardHeader}
          onPress={selectMode ? onToggleSelect : isIfCondition ? () => setIfEditTick(t => t + 1) : onEdit}
          onLongPress={onLongPress}
          delayLongPress={300}
          activeOpacity={0.75}
        >
          {handle}

          <View style={[sharedStyles.stepCardIcon, { backgroundColor: theme.iconBg }]}>
            <StepIcon type={step.type} size={18} color={theme.iconColor} />
          </View>

          <View style={sharedStyles.stepCardText}>
            <View style={sharedStyles.stepCardTypeRow}>
              <Text style={[sharedStyles.stepCardType, { color: theme.accent }]}>
                {index + 1} · {theme.label.toUpperCase()}{disabled ? " · DISABLED" : ""}{running === "paused" ? " · PAUSED HERE" : running ? " · RUNNING" : ""}
              </Text>
            </View>
            {showName && (
              <Text style={[sharedStyles.stepCardName, disabled && sharedStyles.stepCardStruck]} numberOfLines={1}>
                {step.name || detailLines[0] || theme.label}
              </Text>
            )}
            {(isSetSpeed ? detailLines : (step.name ? detailLines : detailLines.slice(1))).map((line, i) => (
              <Text key={i} style={sharedStyles.stepCardDetail} numberOfLines={1}>{line}</Text>
            ))}
            {step.statusMessage && !step.name && step.type !== "StatusUpdate" && step.type !== "EndProgram" && (
              <Text style={sharedStyles.stepCardStatus} numberOfLines={1}>{step.statusMessage}</Text>
            )}
            {!!step.comment && <StepComment text={step.comment} />}
          </View>

          {actions}
          {onToggleExpand && !selectMode && (
            <TouchableOpacity onPress={onToggleExpand} hitSlop={8} style={sharedStyles.cardAction} activeOpacity={0.7}
              accessibilityRole="button" accessibilityLabel={expanded ? "Collapse block" : "Show block steps here"}>
              {expanded ? <ChevronDown size={17} color={theme.iconColor} /> : <ChevronRight size={17} color={colors.textFaint} />}
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* If Condition body — branch navigation (controls only when shown inline) */}
        {isIfCondition && (
          <IfConditionBody
            step={step}
            onEnterScope={onEnterScope}
            onUpdateIfCondition={onUpdateStep}
            variables={variables}
            contextVariables={contextVariables}
            editTrigger={ifEditTick}
            editRequest={ifEditRequest}
            compact={bodyCompact}
          />
        )}

        {step.type === "Switch" && (
          <SwitchBody
            step={step}
            onEnterScope={onEnterScope}
            onUpdate={onUpdateStep}
            variables={variables}
            contextVariables={contextVariables}
            editRequest={caseEditRequest}
            compact={bodyCompact}
          />
        )}

        {step.type === "Try" && !bodyCompact && <TryBody step={step} onEnterScope={onEnterScope} />}

        {/* CallRoutine body — Enter navigation */}
        {step.type === "CallRoutine" && step.routineName && onEnterRoutine && (
          <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            <EnterFooter text={step.routineName} tint={theme.iconColor}
              onPress={() => selectMode ? onToggleSelect?.() : onEnterRoutine(step.routineName!)} />
          </View>
        )}

        {/* Loop body — Enter navigation (shown inline instead when expanded) */}
        {step.type === "Loop" && !bodyCompact && (
          <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            <EnterFooter
              text={`${(step.loopSteps ?? []).length} step${(step.loopSteps ?? []).length !== 1 ? "s" : ""} inside`}
              tint={theme.iconColor}
              onPress={() => selectMode ? onToggleSelect?.() : onEnterScope({ kind: "loop", stepId: step.id, label: stepLabel(step, points) })} />
          </View>
        )}

        {/* CNC Program body — open dedicated builder */}
        {step.type === "CncProgram" && onOpenCncBuilder && (
          <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
            {/* Counts and file live in the detail rows above — this is just the door */}
            <TouchableOpacity style={st.enterRow} onPress={() => selectMode ? onToggleSelect?.() : onOpenCncBuilder(step.id)} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>Edit toolpath</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: theme.iconColor }}>Open</Text>
                <ArrowRight size={13} color={theme.iconColor} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Insert divider between steps */}
      {!isLast && !expanded && (
        <InsertDivider onPress={onInsertAfter} onPaste={onPasteAfter} disabled={isDragging} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  enterRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bpDot: {
    position: "absolute", left: -8, top: 18, zIndex: 30,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.surface,
  },
  running: { borderWidth: 2, borderColor: colors.success, borderLeftWidth: 4 },
  searchHit: { backgroundColor: "#fef9c3", borderWidth: 1.5, borderColor: "#facc15", borderLeftWidth: 4 },
  noteCard: {
    borderRadius: radii.md, borderLeftWidth: 4, borderLeftColor: "#94a3b8",
    backgroundColor: "#f8fafc", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  sectionCard: { backgroundColor: colors.surface, borderLeftColor: colors.textSecondary },
  noteHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  noteText: { fontSize: 13, color: colors.textSecondary, fontStyle: "italic", lineHeight: 18 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.text, letterSpacing: 0.2 },
  noteMeta: { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5, marginTop: 2 },
});
