import { isValidElement, ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { AlertTriangle, CircleAlert, Info } from "lucide-react-native";

import { colors, radii, spacing, type } from "@/src/components/ui/kit";

export type NoticeTone = "danger" | "warning" | "info";

const TONES: Record<NoticeTone, { fg: string; bg: string; border: string; Icon: typeof Info }> = {
  danger:  { fg: colors.danger,  bg: colors.dangerSoft,  border: colors.dangerBorder,  Icon: CircleAlert },
  warning: { fg: colors.warning, bg: colors.warningSoft, border: colors.warningBorder, Icon: AlertTriangle },
  info:    { fg: colors.accent,  bg: colors.accentSoft,  border: colors.accentBorder,  Icon: Info },
};

/**
 * Tinted callout for the calibration wizard: a controller error with what to fix,
 * an amber quality warning, or guidance. Composed from kit tokens (the kit's
 * HintBanner is dismissible info only).
 */
export function Notice({
  tone, title, children, action, style,
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  /** Optional trailing control (a kit Button size="sm"). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      <t.Icon size={16} color={t.fg} style={styles.icon} />
      <View style={styles.body}>
        {!!title && <Text style={[styles.title, { color: t.fg }]}>{title}</Text>}
        {/* Plain text (including interpolated pieces) is wrapped; a single element renders as-is. */}
        {children != null && (isValidElement(children) ? children : <Text style={styles.text}>{children}</Text>)}
        {action && <View style={styles.action}>{action}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: spacing.xs },
  title: { fontSize: 14, fontWeight: "700" },
  text: { ...type.body, lineHeight: 19 },
  action: { flexDirection: "row", marginTop: spacing.xs },
});
