import { StyleSheet } from "react-native";
import { colors, spacing, radii, shadows, accents } from "@/src/components/ui/kit";

// ── Modal styles — used by StepConfigModal, VarPickerModal, StepTypePicker,
//    SetVariableFields, SaveImageFields, IfConditionBody, VariableEditModal,
//    and BuilderScreen (context/settings modals). ───────────────────────────────
export const ms = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: "flex-start", alignItems: "center",
    paddingTop: 52, paddingHorizontal: spacing.xl,
  },
  card: {
    width: "100%", maxWidth: 480, maxHeight: "88%",
    backgroundColor: colors.surface, borderRadius: radii.xl,
    paddingTop: 20, paddingHorizontal: 20,
    ...shadows.raised,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: spacing.lg,
  },
  title: { fontSize: 17, fontWeight: "700", color: colors.text },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, gap: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowActive: { backgroundColor: colors.accentSoft },
  iconTile: {
    width: 38, height: 38, borderRadius: radii.md,
    backgroundColor: colors.accentSoft, justifyContent: "center", alignItems: "center",
  },
  rowText:        { flex: 1 },
  rowLabel:       { fontSize: 15, fontWeight: "600", color: colors.text },
  rowLabelActive: { color: colors.accent },
  rowDesc:        { fontSize: 12, color: colors.textFaint, marginTop: 1 },

  radioRing: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong,
    justifyContent: "center", alignItems: "center",
  },
  radioRingActive: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },

  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    fontSize: 15, color: colors.text, marginTop: 6,
  },
  emptyHint: { fontSize: 13, color: colors.textFaint, paddingVertical: spacing.sm, textAlign: "center" },
  hintText:   { fontSize: 12, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 16 },
  fieldError: { fontSize: 12, color: colors.danger, marginTop: 6 },

  typeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", marginTop: 6,
  },
  // Purple is this app's "selected type" accent used consistently across the
  // expression/variable UI — accents.purple/purpleSoft.
  typeBtnActive:     { borderColor: accents.purple, backgroundColor: accents.purpleSoft },
  typeBtnText:       { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  typeBtnTextActive: { color: accents.purple },

  // Two-column layout for accel/decel
  twoCol:     { flexDirection: "row", gap: 10 },
  twoColItem: { flex: 1 },

  segRow: { flexDirection: "row", gap: spacing.sm, marginTop: 6 },
  seg: {
    flex: 1, paddingVertical: 10, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  segActive:     { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  segText:       { fontSize: 15, fontWeight: "600", color: colors.textMuted },
  segTextActive: { color: colors.accent },

  switchRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  switchLabel: { fontSize: 15, fontWeight: "600", color: colors.text },

  actions: {
    flexDirection: "row", gap: 10, marginTop: spacing.lg,
    paddingTop: 14, paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, alignItems: "center",
  },
  cancelText: { fontSize: 15, color: colors.textMuted, fontWeight: "600" },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 13,
  },
  saveText: { fontSize: 15, fontWeight: "700", color: colors.onAccent },

  // Optional status section
  optStatusWrap: {
    marginTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  optStatusToggle: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: spacing.md,
  },
  optStatusToggleText: { flex: 1, fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  optStatusBody: { paddingBottom: 4 },

  // Sub-row navigation buttons (used on move step main page)
  subRowCard: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    borderRadius: radii.md, overflow: "hidden", marginTop: spacing.sm,
  },
  subRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  subRowLeft: { flex: 1 },
  subRowLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  subRowValue: { fontSize: 12, color: colors.textFaint, marginTop: 2 },

  // Move-modifier rows rendered as cards. Set = solid card; unset = dashed "add" button.
  modRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingVertical: 11, paddingHorizontal: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  modRowAdd: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
    borderRadius: radii.sm, paddingVertical: 11, paddingHorizontal: spacing.md,
    marginBottom: spacing.sm, backgroundColor: "transparent",
  },
  // Approximated to textFaint — original (#b8bec9) was a one-off shade of the same muted gray.
  modAddText: { fontSize: 13, fontWeight: "600", color: colors.textFaint },
  // Card container for a toggle-style modifier (e.g. blend) that can expand.
  modCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingVertical: 11, paddingHorizontal: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  // Muted, dashed look for a toggle card while it is off — matches the "add" rows.
  modCardOff:  { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, backgroundColor: "transparent" },
  modLabelOff: { color: colors.textFaint },
});

// ── SetVariableFields styles — used by SetVariableFields and ConditionEditor ────
export const svs = StyleSheet.create({
  // Dropdown trigger button (shared by var + op rows)
  // Purple (accents.purple/purpleSoft) is this app's "expression / variable" accent,
  // used consistently across the builder. The border/sub-text tints (#c4b5fd/#a78bfa)
  // are one-off shades with no exact kit token match, left as-is.
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: accents.purpleSoft,
    borderWidth: 1.5,
    borderColor: "#c4b5fd",
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginTop: 4,
  },
  selectBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: accents.purple,
    flex: 1,
  },
  selectBtnSub: {
    fontSize: 12,
    color: "#a78bfa",
    flex: 2,
  },
  selectBtnPlaceholder: {
    color: "#c4b5fd",
    fontWeight: "400",
  },

  // Live expression preview
  preview: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: "#a78bfa",
    fontStyle: "italic",
  },

  // Dropdown modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingTop: 18,
    paddingBottom: 6,
    ...shadows.raised,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },

  // Option rows inside the modal
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  optionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // Purple semantic (see selectBtn note above).
  optionRowActive: { backgroundColor: accents.purpleSoft },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  optionTextActive: { color: accents.purple, fontWeight: "700" },

  // Operator-specific option layout
  opOptionLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  opOptionSymbol: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textSecondary,
    width: 30,
  },
  opOptionDesc: { fontSize: 13, color: colors.textMuted },
});

// ── Shared step-card styles — used by StepRow, InsertDivider, DragHandle,
//    and IfConditionBody. ────────────────────────────────────────────────────────
export const sharedStyles = StyleSheet.create({
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    ...shadows.soft,
    overflow: "hidden",
  },

  stepCardHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14,
    gap: 10,
  },

  stepCardIcon: {
    width: 36, height: 36, borderRadius: radii.md,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  stepCardIconSmall: { width: 30, height: 30, borderRadius: radii.sm },

  stepCardText:   { flex: 1, minWidth: 0, gap: 1 },
  stepCardType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  stepCardName:   { fontSize: 14, fontWeight: "600", color: colors.text },
  stepCardDetail: { fontSize: 12, color: colors.textMuted },
  stepCardStatus: { fontSize: 12, color: colors.accentFaded, fontStyle: "italic" },
  cardAction:     { padding: 4 },

  // Multi-select mode
  stepCardSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  selectCheckbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.borderStrong,
    justifyContent: "center", alignItems: "center",
    backgroundColor: colors.surface,
  },
  selectCheckboxOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },

  dragHandle: {
    paddingHorizontal: 2,
    justifyContent: "center", alignItems: "center",
  },

  // Drag visual feedback
  draggingItem: { opacity: 0.35 },
  dropTargetItemTop: {
    borderTopWidth: 2.5,
    borderTopColor: colors.accent,
  },
  dropTargetItemBottom: {
    borderBottomWidth: 2.5,
    borderBottomColor: colors.accent,
  },

  // Inner card (inside loop) — defined for completeness
  innerCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    borderLeftWidth: 3,
    paddingLeft: 10, paddingRight: 8, paddingVertical: 11,
    gap: 8,
  },

  // Loop / IfCondition / CallRoutine / CncProgram expanded body
  loopCardBody: {
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 4,
  },
  // Purple (#c4b5fd) semantic — see the "expression / variable" note in `svs` above.
  loopEmptyText: {
    fontSize: 12, color: "#c4b5fd", fontStyle: "italic",
    paddingVertical: 6,
  },
  loopAddRow: {
    flexDirection: "row", gap: spacing.sm,
    paddingTop: spacing.sm, marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  loopAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 10,
    borderWidth: 1, borderRadius: 8,
    backgroundColor: "transparent",
  },
  loopAddText: { fontSize: 12, fontWeight: "600" },

  // Insert divider
  insertDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 2, gap: 6,
  },
  insertDividerInner: { paddingHorizontal: spacing.sm, paddingVertical: 1 },
  insertLine: { flex: 1, height: 1, backgroundColor: colors.border },
  insertBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder,
    justifyContent: "center", alignItems: "center",
  },
  // Purple semantic (paste = "expression/variable" family) — see note above.
  insertPasteBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: accents.purpleSoft, borderWidth: 1, borderColor: accents.purpleBorder,
    justifyContent: "center", alignItems: "center",
  },
});
