import { StyleSheet } from "react-native";
import { colors, spacing, radii, shadows, accents } from "@/src/components/ui/kit";

export const ves = StyleSheet.create({
  // Bottom sheet rows
  sheetRow:       { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radii.sm },
  // Vision editor's own accent-soft tint — accents.cyanSoft.
  sheetRowActive: { backgroundColor: accents.cyanSoft },
  sheetRowName:   { fontSize: 14, fontWeight: "600", color: colors.text },
  sheetRowSub:    { fontSize: 11, color: colors.textFaint, marginTop: 1 },
  sheetEmpty:     { fontSize: 13, color: colors.textFaint, textAlign: "center", padding: spacing.lg },
  dot:            { width: 8, height: 8, borderRadius: 4 },

  // Modal backdrop / sheet
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xs,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },

  // Inspection config modal chrome
  configRoot: { flex: 1, backgroundColor: colors.background },
  configHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  configTitle:       { flex: 1, fontSize: 17, fontWeight: "700", color: colors.text },
  configDoneBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: colors.success, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  configDoneBtnText: { fontSize: 13, fontWeight: "700", color: colors.onAccent },
  configCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    ...shadows.soft,
  },
  configFieldLabel: { fontSize: 12, fontWeight: "600", color: colors.textMuted, width: 60 },
  configNameInput:  { flex: 1, fontSize: 14, color: colors.text },

  // Headered card that groups related fields under a small caption (e.g. "DETAILS",
  // "COLORS TO MATCH"). Rows stack inside; groupRowBorder adds a divider between them.
  groupCard: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.sm,
    ...shadows.soft,
  },
  groupTitle: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8 },
  groupRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm,
  },

  colorEntryRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceMuted, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },

  // Blob / polygon / aruco / line param panel
  blobPanel: {
    padding: spacing.md, gap: spacing.sm,
    backgroundColor: colors.surfaceMuted, borderRadius: radii.md,
    ...shadows.soft,
  },
  blobPanelTitle: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 2 },
  paramRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  paramLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  paramDesc:  { fontSize: 11, color: colors.textFaint, marginTop: 2, lineHeight: 15 },
  paramInput: {
    width: 80, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: "right",
    fontSize: 13, color: colors.text,
  },

  // Zone draw modal
  drawModalRoot:     { flex: 1, backgroundColor: "#000" }, // full-bleed camera viewfinder, intentionally not a token
  drawModalRootWide: { flexDirection: "row" },
  // The camera image lives here, sized to whatever the toolbar leaves. Canvas and
  // toolbar are flex siblings now, not a full-bleed canvas with the bar floating over
  // it, so the picture ends where the toolbar begins instead of running underneath.
  drawCanvasArea:    { flex: 1, position: "relative" },
  drawToolbarInner: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.overlayDark, // dark drawing toolbar over the camera feed
  },
  drawToolRow:    { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  drawToolSpacer: { flex: 1 },
  drawCancelBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radii.sm,
  },
  drawCancelText:      { color: colors.onAccent, fontSize: 13, fontWeight: "600" },
  // A standalone row in the vertical bottom bar: content-height (no flex:1, which would
  // grow it vertically and overlap the rows below) and wrapping so all four shape chips
  // stay on screen on a narrow phone.
  drawShapeRow:        { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  drawShapeChip:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: radii.sm },
  drawShapeChipActive: { backgroundColor: colors.surface },
  drawShapeText:       { fontSize: 13, fontWeight: "600", color: colors.onAccent },
  drawShapeTextActive: { color: accents.cyan }, // vision editor's own accent — accents.cyan
  drawFinishBtn:       { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.success, borderRadius: radii.sm },
  drawFinishText:      { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
  drawClearBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.sm,
    borderWidth: 1, borderColor: "rgba(248,113,113,0.6)", // translucent danger tint on dark toolbar, no matching token
  },
  drawClearText:       { color: "#fca5a5", fontSize: 13, fontWeight: "600" }, // pairs with the border above, no matching token
  drawSaveBtn:         { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.accent, borderRadius: radii.sm },
  drawSaveBtnDisabled: { backgroundColor: "rgba(255,255,255,0.15)" },
  drawSaveText:        { color: colors.onAccent, fontSize: 13, fontWeight: "700" },

  // Grid cell steppers + rotation reset — dark-toolbar twins of the light ones on the
  // zone list. The old GRID on/off toggle is gone: the lattice now rides on the Grid
  // shape, so there is nothing to toggle.
  drawStepper:          { flexDirection: "row", alignItems: "center", gap: 3 },
  drawStepperLabel:     { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.55)", marginRight: 1 },
  drawStepBtn: {
    width: 24, height: 24, borderRadius: radii.sm, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  drawStepValue: { fontSize: 13, fontWeight: "700", color: colors.onAccent, minWidth: 18, textAlign: "center" },
  drawRotChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    // Rotation-active indicator — functionally meaningful (draws attention to a non-zero
    // rotation), not just chrome; no matching token for this orange tint.
    borderWidth: 1, borderColor: "rgba(249,115,22,0.6)", backgroundColor: "rgba(249,115,22,0.15)",
  },
  drawRotChipText: { fontSize: 12, fontWeight: "700", color: "#fdba74" }, // pairs with drawRotChip above, no matching token
  drawHint:            { position: "absolute", top: 56, left: 0, right: 0, alignItems: "center" },
  drawHintText: {
    color: "rgba(255,255,255,0.65)", fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.sm,
  },

  // Left-rail variant of the draw toolbar for wide screens: the same controls in a
  // fixed-width column down the left edge. An in-flow sibling of the canvas, so the
  // image ends where the rail begins rather than running underneath it.
  drawRail: {
    width: 240, gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.overlayDark,
  },

  // Change-shape confirmation, drawn inside the draw modal (above its canvas) rather
  // than via the app-root alert, which stacks behind this modal's iframe on web.
  confirmOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 20, elevation: 20,
    backgroundColor: colors.overlay,
    alignItems: "center", justifyContent: "center", padding: spacing.xl,
  },
  confirmCard: {
    width: "100%", maxWidth: 320, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg,
  },
  confirmTitle:      { fontSize: 16, fontWeight: "700", color: colors.text },
  confirmMsg:        { fontSize: 13.5, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 },
  confirmActions:    { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  confirmCancelBtn:  { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  confirmChangeBtn:  { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radii.md, backgroundColor: colors.danger },
  confirmChangeText: { fontSize: 14, fontWeight: "700", color: colors.onAccent },
  // Shapes and actions run left-to-right in the bottom bar, top-to-bottom in the rail.
  drawShapeCol:  { flexDirection: "column", gap: spacing.xs },
  drawColGroup:  { flexDirection: "column", gap: spacing.sm, alignItems: "stretch" },
  // A chip/button that fills the rail's width with its label centred.
  drawChipWide:  { width: "100%", alignItems: "center" },
  // Pushes the action group to the foot of the rail so Save sits where the thumb expects.
  drawRailSpacer: { flex: 1 },
  drawRailLabel: {
    fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.6, marginBottom: 2,
  },

  // Inspection type picker
  typePickerIcon: {
    width: 36, height: 36, borderRadius: radii.sm,
    backgroundColor: accents.cyanSoft, // vision editor's own accent-soft tint — accents.cyanSoft
    justifyContent: "center", alignItems: "center",
  },

  // Section / empty / add
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.8, marginBottom: 2 },
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, alignItems: "center",
    ...shadows.soft,
  },
  emptyText:   { fontSize: 13, color: colors.textFaint, textAlign: "center" },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingVertical: 13, borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: accents.cyan }, // vision editor's own accent — accents.cyan
  iconBtn:    { padding: 4 },
});
