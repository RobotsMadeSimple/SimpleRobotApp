import { StyleSheet } from "react-native";

import { colors, spacing, type } from "@/src/components/ui/kit";

/** Styles shared by the calibration wizard steps. */
export const cs = StyleSheet.create({
  step:       { gap: spacing.lg },
  cardGap:    { gap: spacing.md },
  label:      { ...type.sectionLabel },
  body:       { ...type.body, lineHeight: 19 },
  caption:    { ...type.caption },
  strong:     { ...type.title },
  mono:       { ...type.mono },
  row:        { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  buttons:    { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grow:       { flex: 1 },
  // Wide screens: two panes side by side; they stack on phones.
  panes:      { gap: spacing.lg },
  panesWide:  { flexDirection: "row", alignItems: "flex-start" },
  pane:       { gap: spacing.lg },
  paneWide:   { flex: 1, minWidth: 0 },
  // Table rows (taught list, residuals).
  tr:         { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: spacing.sm },
  trBorder:   { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  th:         { ...type.caption, fontWeight: "700", letterSpacing: 0.4 },
  td:         { ...type.mono },
  tdRight:    { ...type.mono, textAlign: "right" },
});
