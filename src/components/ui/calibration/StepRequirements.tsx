import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Check, Circle, CircleDashed } from "lucide-react-native";

import { Button, colors, radii, spacing, type } from "@/src/components/ui/kit";
import { cs } from "./calibrationStyles";

/**
 * One thing a wizard step needs before "Next" makes sense. Required items gate the
 * button; optional ones are shown as recommendations and never block.
 */
export type Requirement = {
  key: string;
  /** Short imperative label: "Enter the dot pitch", "Teach at least 2 dots (1 of 2)". */
  label: string;
  met: boolean;
  /** Recommended rather than required: shown, never blocks Next. */
  optional?: boolean;
  /** Extra line under the label explaining how to satisfy it. */
  hint?: string;
};

export const unmetRequired = (reqs: Requirement[]) => reqs.filter(r => !r.met && !r.optional);

/**
 * Highlights a section the user still has to fill in: an amber border plus a small
 * "Required" (or custom) tag. Renders children untouched when `show` is false, so it
 * can wrap any card or form row permanently.
 */
export function Attention({
  show, tag = "Required", children, style,
}: {
  show: boolean;
  tag?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!show) return <View style={style}>{children}</View>;
  return (
    <View style={[styles.attention, style]}>
      <View style={styles.attentionTag}>
        <Text style={styles.attentionTagText}>{tag}</Text>
      </View>
      {children}
    </View>
  );
}

/**
 * The checklist + Back/Next row every step ends with. Next is disabled until every
 * required item is met, and the unmet ones are listed right under it so the user
 * never has to guess why the button is grey.
 */
export function StepFooter({
  requirements, nextLabel, onNext, onBack, backLabel = "Back", busy = false, nextIcon,
}: {
  requirements: Requirement[];
  nextLabel: string;
  onNext: () => void;
  onBack?: () => void;
  backLabel?: string;
  busy?: boolean;
  nextIcon?: ReactNode;
}) {
  const missing = unmetRequired(requirements);
  const canNext = missing.length === 0 && !busy;

  return (
    <View style={styles.footer}>
      <View style={styles.checklist}>
        <Text style={styles.checklistTitle}>{canNext ? "Ready to continue" : "Before you continue"}</Text>
        {requirements.map(r => {
          const tone = r.met ? colors.success : r.optional ? colors.textFaint : colors.warning;
          const Icon = r.met ? Check : r.optional ? CircleDashed : Circle;
          return (
            <View key={r.key} style={styles.item}>
              <View style={[styles.itemIcon, { borderColor: tone, backgroundColor: r.met ? colors.successSoft : colors.surface }]}>
                <Icon size={12} color={tone} strokeWidth={r.met ? 3 : 2} />
              </View>
              <View style={cs.grow}>
                <Text style={[styles.itemLabel, r.met && styles.itemLabelMet, !r.met && !r.optional && styles.itemLabelMissing]}>
                  {r.label}
                  {r.optional && !r.met ? <Text style={styles.recommended}>  recommended</Text> : null}
                </Text>
                {!!r.hint && !r.met && <Text style={styles.itemHint}>{r.hint}</Text>}
              </View>
            </View>
          );
        })}
      </View>

      <View style={cs.buttons}>
        {onBack && <Button label={backLabel} variant="secondary" onPress={onBack} style={cs.grow} />}
        <Button label={nextLabel} icon={nextIcon} loading={busy} disabled={!canNext} onPress={onNext} style={cs.grow} />
      </View>
      {missing.length > 0 && (
        <Text style={styles.missingLine}>
          Missing: {missing.map(m => m.label.replace(/\s*\(.*\)$/, "")).join(" · ")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  checklist: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  checklistTitle: { ...type.sectionLabel, marginBottom: spacing.xs },
  item: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  itemIcon: {
    width: 20, height: 20, borderRadius: radii.pill, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  itemLabel:        { ...type.body, color: colors.text },
  itemLabelMet:     { color: colors.textMuted },
  itemLabelMissing: { fontWeight: "600" },
  itemHint:         { ...type.caption, marginTop: 2 },
  recommended:      { ...type.caption, color: colors.textFaint, fontStyle: "italic" },
  missingLine:      { ...type.caption, color: colors.warning, fontWeight: "600", textAlign: "center" },
  attention: {
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radii.lg,
    padding: spacing.xs,
    backgroundColor: colors.warningSoft,
  },
  attentionTag: {
    alignSelf: "flex-start",
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  attentionTagText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, color: colors.onAccent },
});
