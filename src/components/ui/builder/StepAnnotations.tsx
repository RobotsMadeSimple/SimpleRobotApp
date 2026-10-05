import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EyeOff, TriangleAlert } from "lucide-react-native";
import { colors, spacing, StatusPill } from "@/src/components/ui/kit";
import type { StepProblems } from "./useProgramValidation";

/** Small pill beside a disabled step's type label. */
export function DisabledPill() {
  return (
    <StatusPill
      label="disabled"
      tone="neutral"
      icon={<EyeOff size={10} color={colors.textMuted} />}
      style={styles.pill}
    />
  );
}

/** The step's comment as a muted line under its details. */
export function StepComment({ text }: { text: string }) {
  return <Text style={styles.comment} numberOfLines={3}>{text}</Text>;
}

export const stepHasError = (p: StepProblems) =>
  [...p.own, ...p.nested].some(x => x.severity === "error");

/** One-line summary used by the badge tooltip (same wording the inline message used). */
export function problemSummary(problems: StepProblems): string {
  const first = problems.own[0] ?? problems.nested[0];
  if (!first) return "";
  const text = problems.own.length > 0
    ? first.message
    : `${problems.nested.length} problem${problems.nested.length === 1 ? "" : "s"} inside — ${first.message}`;
  const more = problems.own.length > 1 ? `  (+${problems.own.length - 1} more)` : "";
  return `${text}${more}`;
}

/**
 * Caution-triangle badge floating over a bad step card's top-right corner.
 * Hover (web) or press (touch) shows a floating tooltip bubble anchored under
 * the badge — rendered inline (no Modal) so hover in/out can't flicker.
 * Position it from the card's UNCLIPPED outer wrapper — stepCard itself has
 * overflow:hidden.
 */
export function ProblemBadge({ problems }: { problems: StepProblems }) {
  const [open, setOpen] = useState(false);
  const count = problems.own.length + problems.nested.length;
  return (
    <View style={styles.badgeWrap}>
      <Pressable
        onPress={() => setOpen(v => !v)}
        onHoverIn={() => setOpen(true)}
        onHoverOut={() => setOpen(false)}
        hitSlop={8}
        style={styles.badge}
        accessibilityRole="button"
        accessibilityLabel={`${count} problem${count === 1 ? "" : "s"}`}
      >
        <TriangleAlert size={13} color={CAUTION_ICON} strokeWidth={2.5} />
      </Pressable>
      {open && (
        <View style={styles.badgeTip} pointerEvents="none">
          <Text style={styles.badgeTipText}>{problemSummary(problems)}</Text>
        </View>
      )}
    </View>
  );
}

// Caution yellow — deliberate one-off: the kit's warning amber is too muted for
// a "something is broken here" badge; this is signage yellow with black accents.
const CAUTION_BG   = "#facc15";
const CAUTION_ICON = "#111111";

const styles = StyleSheet.create({
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CAUTION_BG,
    borderWidth: 1.5,
    borderColor: CAUTION_ICON,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  badgeWrap: { alignItems: "flex-end" },
  // Dark tooltip bubble anchored under the badge (mirrors kit InfoTip's look).
  badgeTip: {
    position: "absolute",
    top: 28,
    right: 0,
    width: 240,
    backgroundColor: colors.surfaceDark,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 30,
  },
  badgeTipText: { color: colors.onSurfaceDark, fontSize: 12, lineHeight: 17 },
  problem: { fontSize: 12, marginTop: spacing.xs },
  pill:    { paddingVertical: 1, paddingHorizontal: 6 },
  comment: { fontSize: 12, color: colors.textFaint, fontStyle: "italic", marginTop: spacing.xs },
});
