import { Button, buttonTextColor, Card, colors, Divider, InfoTip, spacing, type } from "@/src/components/ui/kit";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { Crosshair } from "lucide-react-native";
import { Fragment, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * Shared bits for the Space editor pages (grid, stack, tool, local): the whole setup lives in one
 * card with small field labels and hairline dividers, and the teach action sits on the heading of
 * the section it fills in.
 */

/** Small field label (matches the kit FormRow label) with an optional info tip. */
export function FieldLabel({ text, tip }: { text: string; tip?: string }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label} numberOfLines={1}>{text}</Text>
      {!!tip && <InfoTip text={tip} size={13} />}
    </View>
  );
}

/** Section sub-heading inside the card: title, a faint unit, an optional info tip and a right-hand action. */
export function SectionHeading({
  title, unit, tip, action,
}: {
  title: string;
  unit?: string;
  tip?: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.heading}>
      <View style={s.headingLead}>
        <View style={s.headingTitle}>
          <Text style={s.label}>{title}</Text>
          {!!unit && <Text style={s.unit}>{unit}</Text>}
        </View>
        {!!tip && <InfoTip text={tip} size={13} />}
      </View>
      {action}
    </View>
  );
}

/** The small outlined Teach button that goes on a section heading. */
export function TeachButton({ onPress, label = "Teach" }: { onPress: () => void; label?: string }) {
  return (
    <Button
      label={label}
      size="sm"
      variant="secondary"
      icon={<Crosshair size={14} color={buttonTextColor("secondary")} />}
      onPress={onPress}
    />
  );
}

/** One-line hint under a section's fields. */
export function FieldHint({ children }: { children: ReactNode }) {
  return <Text style={s.hint}>{children}</Text>;
}

/** A vertical group of fields with the card's standard spacing. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <View style={s.group}>{children}</View>;
}

/**
 * The one setup card. Below desktop width the sections stack (in `stacked` order, else left then
 * right) split by hairlines; on desktop (≥1100) the card splits into two halves.
 */
export function EditorCard({
  left, right, stacked,
}: {
  left: ReactNode[];
  right: ReactNode[];
  stacked?: ReactNode[];
}) {
  const isDesktop = usePaneLayout() === "desktop";
  const withDividers = (sections: ReactNode[]) =>
    sections.map((section, i) => (
      <Fragment key={i}>
        {i > 0 && <Divider style={s.divider} />}
        {section}
      </Fragment>
    ));

  if (isDesktop) {
    return (
      <Card padded={false} style={s.cardRow}>
        <View style={s.cardCol}>{withDividers(left)}</View>
        <Divider vertical style={s.vDivider} />
        <View style={s.cardCol}>{withDividers(right)}</View>
      </Card>
    );
  }
  return <Card>{withDividers(stacked ?? [...left, ...right])}</Card>;
}

const s = StyleSheet.create({
  group:   { gap: spacing.md },
  divider: { marginVertical: spacing.lg - 2 },

  // Desktop: two columns inside the one card, split by a hairline.
  cardRow:  { flexDirection: "row", alignItems: "stretch" },
  cardCol:  { flex: 1, padding: spacing.lg - 2 },
  vDivider: { marginHorizontal: 0 },

  // Same look as the kit FormRow label.
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, marginBottom: spacing.xs + 2 },
  label:    { fontSize: 13, fontWeight: "600", color: colors.textSecondary, flexShrink: 1 },
  unit:     { ...type.caption },
  hint:     { ...type.caption, fontSize: 12 },

  heading:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  headingLead:  { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2, flexShrink: 1 },
  headingTitle: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexShrink: 1 },
});
