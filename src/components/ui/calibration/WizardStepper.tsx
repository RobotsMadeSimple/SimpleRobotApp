import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

import { colors, radii, spacing } from "@/src/components/ui/kit";

/**
 * Numbered step strip (Setup → Detect → Teach → Solve → Verify). Steps up to
 * `reachable` can be tapped to jump back or forward; later ones are dimmed.
 */
export function WizardStepper({
  steps, current, reachable, onStep,
}: {
  steps: readonly string[];
  current: number;
  /** Highest step index the user may open right now. */
  reachable: number;
  onStep: (index: number) => void;
}) {
  return (
    <View style={styles.row}>
      {steps.map((label, k) => {
        const active = k === current;
        const done   = k < current;
        const open   = k <= reachable;
        return (
          <Pressable
            key={label}
            style={[styles.step, !open && styles.dim]}
            disabled={!open || active}
            onPress={() => onStep(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !open }}
          >
            <View style={[styles.badge, done && styles.badgeDone, active && styles.badgeActive]}>
              {done
                ? <Check size={13} color={colors.onAccent} />
                : <Text style={[styles.num, active && styles.numActive]}>{k + 1}</Text>}
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  step: { flex: 1, alignItems: "center", gap: spacing.xs, minWidth: 0 },
  dim: { opacity: 0.45 },
  badge: {
    width: 26, height: 26, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  badgeDone:   { backgroundColor: colors.success, borderColor: colors.success },
  badgeActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  num:         { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  numActive:   { color: colors.onAccent },
  label:       { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  labelActive: { color: colors.accent },
});
