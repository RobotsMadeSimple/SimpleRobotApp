import { StepIcon, stepLabel, STEP_THEME } from "@/src/components/ui/builder/stepUtils";
import type { BreakpointsView } from "@/src/components/ui/builder/useBreakpoints";
import { colors, InfoTip, spacing } from "@/src/components/ui/kit";
import type { Point, ProgramStep } from "@/src/models/robotModels";
import { walkSteps } from "@/src/models/stepTree";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

// The monitor's step list (controller docs/program-language.md §7.3): the program's steps as a
// tree, the one the controller reports (currentStepId / pausedAtStepId) highlighted and scrolled
// into view, and a breakpoint dot in the rail of every step. Breakpoints are per device, per
// program id (useBreakpoints) — the monitor passes them with the run and pushes changes live.

export type TraceHighlight = "running" | "paused" | "error";

const HIGHLIGHT: Record<TraceHighlight, { bg: string; bar: string; tag: string; tagColor: string }> = {
  running: { bg: colors.successSoft, bar: colors.success, tag: "NOW",    tagColor: colors.success },
  paused:  { bg: colors.warningSoft, bar: colors.warning, tag: "NEXT",   tagColor: colors.warning },
  error:   { bg: colors.dangerSoft,  bar: colors.danger,  tag: "FAILED", tagColor: colors.danger },
};

type Props = {
  steps: ProgramStep[];
  points?: Point[];
  /** The step to highlight (and how), e.g. the paused-at step. */
  highlightId?: string | null;
  highlight?: TraceHighlight | null;
  /** Null hides the breakpoint rail (background programs never stop at breakpoints). */
  breakpoints: BreakpointsView | null;
  /** Fill the parent's height (desktop column) instead of a fixed-height box. */
  fill?: boolean;
};

export function ProgramStepTrace({ steps, points, highlightId, highlight, breakpoints, fill }: Props) {
  const rows = useMemo(() => [...walkSteps(steps)], [steps]);
  const byId = useMemo(() => new Map(rows.map(r => [r.step.id, r.step])), [rows]);

  // Scroll the highlighted step into view when it changes.
  const scrollRef = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!highlightId) return;
    const y = rowY.current[highlightId];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
  }, [highlightId]);

  const bpSteps = breakpoints ? breakpoints.list.map(id => byId.get(id)).filter((s): s is ProgramStep => !!s) : [];
  const theme = highlight ? HIGHLIGHT[highlight] : null;

  return (
    <View style={[styles.wrap, fill && { flex: 1 }]}>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>STEPS</Text>
        <InfoTip text={breakpoints
          ? "The step the robot is on is highlighted. Tap the dot beside a step to pause before it (a breakpoint). Breakpoints are kept on this device and apply the next time you press Run, and straight away while the program runs."
          : "The step the robot is on is highlighted. Background programs do not stop at breakpoints."} />
        <View style={{ flex: 1 }} />
        {breakpoints && bpSteps.length > 0 && (
          <Pressable onPress={breakpoints.clear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear all breakpoints">
            <Text style={styles.clearText}>Clear {bpSteps.length === 1 ? "breakpoint" : `${bpSteps.length} breakpoints`}</Text>
          </Pressable>
        )}
      </View>

      {breakpoints && bpSteps.length > 0 && (
        <View style={styles.bpChips}>
          {bpSteps.map(s => (
            <Pressable
              key={s.id}
              style={styles.bpChip}
              onPress={() => breakpoints.set(s.id, false)}
              accessibilityRole="button"
              accessibilityLabel={`Remove breakpoint at ${stepLabel(s, points)}`}
            >
              <View style={styles.bpDotSmall} />
              <Text style={styles.bpChipText} numberOfLines={1}>{stepLabel(s, points)}</Text>
              <X size={12} color={colors.danger} />
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={fill ? styles.listFill : styles.list}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {rows.length === 0 && <Text style={styles.empty}>This program has no steps.</Text>}
        {rows.map(({ step, depth }, i) => {
          const isNote = step.type === "Note";
          const disabled = step.enabled === false;
          const hit = !!theme && step.id === highlightId;
          const bp = !!breakpoints && breakpoints.has(step.id);
          const label = stepLabel(step, points);
          return (
            <View
              key={step.id || `row-${i}`}
              onLayout={e => { if (step.id) rowY.current[step.id] = e.nativeEvent.layout.y; }}
              style={[styles.row, hit && { backgroundColor: theme!.bg, borderLeftColor: theme!.bar }]}
            >
              {breakpoints ? (
                isNote ? <View style={styles.rail} /> : (
                  <Pressable
                    style={styles.rail}
                    onPress={() => breakpoints.toggle(step.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 8, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={`${bp ? "Remove" : "Add"} breakpoint at ${label}`}
                  >
                    <View style={[styles.bpDot, bp ? styles.bpDotOn : styles.bpDotOff]} />
                  </Pressable>
                )
              ) : <View style={styles.railNarrow} />}
              <View style={{ width: depth * 14 }} />
              {isNote ? (
                <Text style={[styles.note, disabled && styles.disabled]} numberOfLines={1}>{label}</Text>
              ) : (
                <>
                  <View style={[styles.icon, { backgroundColor: STEP_THEME[step.type]?.iconBg ?? colors.surfaceMuted }]}>
                    <StepIcon type={step.type} size={12} color={STEP_THEME[step.type]?.iconColor ?? colors.textMuted} />
                  </View>
                  <Text style={[styles.label, hit && styles.labelHit, disabled && styles.disabled]} numberOfLines={1}>
                    {label}{disabled ? " · disabled" : ""}
                  </Text>
                </>
              )}
              {hit && <Text style={[styles.tag, { color: theme!.tagColor }]}>{theme!.tag}</Text>}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 1 },
  clearText: { fontSize: 12, fontWeight: "700", color: colors.danger },
  bpChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bpChip: {
    flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%",
    backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  bpChipText: { fontSize: 12, fontWeight: "600", color: colors.danger, flexShrink: 1 },
  bpDotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  list: { maxHeight: 320, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  listFill: { flex: 1, minHeight: 200, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  empty: { padding: spacing.md, fontSize: 13, color: colors.textFaint, fontStyle: "italic" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    minHeight: 34, paddingRight: 10,
    borderLeftWidth: 3, borderLeftColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rail: { width: 28, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  railNarrow: { width: 6 },
  bpDot: { width: 11, height: 11, borderRadius: 6 },
  bpDotOn: { backgroundColor: colors.danger },
  bpDotOff: { borderWidth: 1.5, borderColor: colors.borderStrong },
  icon: { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, color: colors.textSecondary },
  labelHit: { fontWeight: "700", color: colors.text },
  note: { flex: 1, fontSize: 12, fontWeight: "700", color: colors.textMuted, fontStyle: "italic" },
  disabled: { opacity: 0.45 },
  tag: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
});
