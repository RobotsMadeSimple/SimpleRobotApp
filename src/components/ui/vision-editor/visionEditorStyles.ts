import { StyleSheet } from "react-native";

export const ves = StyleSheet.create({
  // Bottom sheet rows
  sheetRow:       { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10 },
  sheetRowActive: { backgroundColor: "#ecfeff" },
  sheetRowName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  sheetRowSub:    { fontSize: 11, color: "#9ca3af", marginTop: 1 },
  sheetEmpty:     { fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 20 },
  dot:            { width: 8, height: 8, borderRadius: 4 },

  // Modal backdrop / sheet
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 4,
  },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 10 },

  // Inspection config modal chrome
  configRoot: { flex: 1, backgroundColor: "#f3f4f6" },
  configHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
  },
  configTitle:       { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" },
  configDoneBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#16a34a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  configDoneBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  configCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  configFieldLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280", width: 60 },
  configNameInput:  { flex: 1, fontSize: 14, color: "#111827" },

  // Headered card that groups related fields under a small caption (e.g. "DETAILS",
  // "COLORS TO MATCH"). Rows stack inside; groupRowBorder adds a divider between them.
  groupCard: {
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  groupTitle: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8 },
  groupRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  groupRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f0f0f0", paddingTop: 10,
  },

  colorEntryRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f9fafb", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: "#e5e7eb",
  },

  // Blob / polygon / aruco / line param panel
  blobPanel: {
    padding: 14, gap: 10,
    backgroundColor: "#f9fafb", borderRadius: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  blobPanelTitle: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 2 },
  paramRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  paramLabel: { flex: 1, fontSize: 13, color: "#374151" },
  paramDesc:  { fontSize: 11, color: "#9ca3af", marginTop: 2, lineHeight: 15 },
  paramInput: {
    width: 80, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, textAlign: "right",
    fontSize: 13, color: "#111827",
  },

  // Zone draw modal
  drawModalRoot:     { flex: 1, backgroundColor: "#000" },
  drawModalRootWide: { flexDirection: "row" },
  // The camera image lives here, sized to whatever the toolbar leaves. Canvas and
  // toolbar are flex siblings now, not a full-bleed canvas with the bar floating over
  // it, so the picture ends where the toolbar begins instead of running underneath.
  drawCanvasArea:    { flex: 1, position: "relative" },
  drawToolbarInner: {
    gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  drawToolRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  drawToolSpacer: { flex: 1 },
  drawCancelBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8,
  },
  drawCancelText:      { color: "#fff", fontSize: 13, fontWeight: "600" },
  // A standalone row in the vertical bottom bar: content-height (no flex:1, which would
  // grow it vertically and overlap the rows below) and wrapping so all four shape chips
  // stay on screen on a narrow phone.
  drawShapeRow:        { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  drawShapeChip:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8 },
  drawShapeChipActive: { backgroundColor: "#fff" },
  drawShapeText:       { fontSize: 13, fontWeight: "600", color: "#fff" },
  drawShapeTextActive: { color: "#0891b2" },
  drawFinishBtn:       { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#16a34a", borderRadius: 8 },
  drawFinishText:      { color: "#fff", fontSize: 13, fontWeight: "700" },
  drawClearBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(248,113,113,0.6)",
  },
  drawClearText:       { color: "#fca5a5", fontSize: 13, fontWeight: "600" },
  drawSaveBtn:         { paddingHorizontal: 18, paddingVertical: 7, backgroundColor: "#2563eb", borderRadius: 8 },
  drawSaveBtnDisabled: { backgroundColor: "rgba(255,255,255,0.15)" },
  drawSaveText:        { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Grid cell steppers + rotation reset — dark-toolbar twins of the light ones on the
  // zone list. The old GRID on/off toggle is gone: the lattice now rides on the Grid
  // shape, so there is nothing to toggle.
  drawStepper:          { flexDirection: "row", alignItems: "center", gap: 3 },
  drawStepperLabel:     { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.55)", marginRight: 1 },
  drawStepBtn: {
    width: 24, height: 24, borderRadius: 6, justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  drawStepValue: { fontSize: 13, fontWeight: "700", color: "#fff", minWidth: 18, textAlign: "center" },
  drawRotChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(249,115,22,0.6)", backgroundColor: "rgba(249,115,22,0.15)",
  },
  drawRotChipText: { fontSize: 12, fontWeight: "700", color: "#fdba74" },
  drawHint:            { position: "absolute", top: 56, left: 0, right: 0, alignItems: "center" },
  drawHintText: {
    color: "rgba(255,255,255,0.65)", fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
  },

  // Left-rail variant of the draw toolbar for wide screens: the same controls in a
  // fixed-width column down the left edge. An in-flow sibling of the canvas, so the
  // image ends where the rail begins rather than running underneath it.
  drawRail: {
    width: 240, gap: 12,
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.62)",
  },

  // Change-shape confirmation, drawn inside the draw modal (above its canvas) rather
  // than via the app-root alert, which stacks behind this modal's iframe on web.
  confirmOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 20, elevation: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  confirmCard: {
    width: "100%", maxWidth: 320, backgroundColor: "#fff", borderRadius: 16, padding: 20,
  },
  confirmTitle:      { fontSize: 16, fontWeight: "700", color: "#111827" },
  confirmMsg:        { fontSize: 13.5, color: "#6b7280", marginTop: 8, lineHeight: 19 },
  confirmActions:    { flexDirection: "row", gap: 10, marginTop: 20 },
  confirmCancelBtn:  { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 11, borderWidth: 1.5, borderColor: "#e5e7eb" },
  confirmCancelText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  confirmChangeBtn:  { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 11, backgroundColor: "#dc2626" },
  confirmChangeText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  // Shapes and actions run left-to-right in the bottom bar, top-to-bottom in the rail.
  drawShapeCol:  { flexDirection: "column", gap: 6 },
  drawColGroup:  { flexDirection: "column", gap: 8, alignItems: "stretch" },
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
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#ecfeff",
    justifyContent: "center", alignItems: "center",
  },

  // Section / empty / add
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8, marginBottom: 2 },
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  emptyText:   { fontSize: 13, color: "#9ca3af", textAlign: "center" },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#fff", borderRadius: 12,
    paddingVertical: 13, borderWidth: 1.5, borderColor: "#e5e7eb", borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: "#0891b2" },
  iconBtn:    { padding: 4 },
});
