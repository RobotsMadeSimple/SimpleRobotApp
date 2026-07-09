import { StyleSheet } from "react-native";

// ── Modal styles — used by StepConfigModal, VarPickerModal, StepTypePicker,
//    SetVariableFields, SaveImageFields, IfConditionBody, VariableEditModal,
//    and BuilderScreen (context/settings modals). ───────────────────────────────
export const ms = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start", alignItems: "center",
    paddingTop: 52, paddingHorizontal: 24,
  },
  card: {
    width: "100%", maxWidth: 360, maxHeight: "88%",
    backgroundColor: "#fff", borderRadius: 18,
    paddingTop: 20, paddingHorizontal: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#111" },

  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  rowActive: { backgroundColor: "#f0f9ff" },
  iconTile: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#eff6ff", justifyContent: "center", alignItems: "center",
  },
  rowText:        { flex: 1 },
  rowLabel:       { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowLabelActive: { color: "#2563eb" },
  rowDesc:        { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  radioRing: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#d1d5db",
    justifyContent: "center", alignItems: "center",
  },
  radioRingActive: { borderColor: "#2563eb" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2563eb" },

  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.6 },
  input: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: "#111827", marginTop: 6,
  },
  emptyHint: { fontSize: 13, color: "#9ca3af", paddingVertical: 8, textAlign: "center" },
  hintText:   { fontSize: 12, color: "#9ca3af", marginTop: 8, lineHeight: 16 },
  fieldError: { fontSize: 12, color: "#dc2626", marginTop: 6 },

  typeBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", marginTop: 6,
  },
  typeBtnActive:     { borderColor: "#7c3aed", backgroundColor: "#f5f3ff" },
  typeBtnText:       { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  typeBtnTextActive: { color: "#7c3aed" },

  // Two-column layout for accel/decel
  twoCol:     { flexDirection: "row", gap: 10 },
  twoColItem: { flex: 1 },

  segRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  seg: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center",
  },
  segActive:     { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  segText:       { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  segTextActive: { color: "#2563eb" },

  switchRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  switchLabel: { fontSize: 15, fontWeight: "600", color: "#111827" },

  actions: {
    flexDirection: "row", gap: 10, marginTop: 16,
    paddingTop: 14, paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center",
  },
  cancelText: { fontSize: 15, color: "#6b7280", fontWeight: "600" },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13,
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Optional status section
  optStatusWrap: {
    marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
  },
  optStatusToggle: {
    flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 12,
  },
  optStatusToggleText: { flex: 1, fontSize: 13, color: "#6b7280", fontWeight: "600" },
  optStatusBody: { paddingBottom: 4 },

  // Sub-row navigation buttons (used on move step main page)
  subRowCard: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb",
    borderRadius: 12, overflow: "hidden", marginTop: 8,
  },
  subRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 13, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  subRowLeft: { flex: 1 },
  subRowLabel: { fontSize: 14, fontWeight: "600", color: "#111827" },
  subRowValue: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
});

// ── SetVariableFields styles — used by SetVariableFields and ConditionEditor ────
export const svs = StyleSheet.create({
  // Dropdown trigger button (shared by var + op rows)
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f5f3ff",
    borderWidth: 1.5,
    borderColor: "#c4b5fd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 4,
  },
  selectBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7c3aed",
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
    marginTop: 10,
    fontSize: 12,
    color: "#a78bfa",
    fontStyle: "italic",
  },

  // Dropdown modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingTop: 18,
    paddingBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9ca3af",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  // Option rows inside the modal
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  optionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  optionRowActive: { backgroundColor: "#f5f3ff" },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  optionTextActive: { color: "#7c3aed", fontWeight: "700" },

  // Operator-specific option layout
  opOptionLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  opOptionSymbol: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    width: 30,
  },
  opOptionDesc: { fontSize: 13, color: "#6b7280" },
});

// ── Shared step-card styles — used by StepRow, InsertDivider, DragHandle,
//    and IfConditionBody. ────────────────────────────────────────────────────────
export const sharedStyles = StyleSheet.create({
  stepCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: "hidden",
  },

  stepCardHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14,
    gap: 10,
  },

  stepCardIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  stepCardIconSmall: { width: 30, height: 30, borderRadius: 8 },

  stepCardText:   { flex: 1, minWidth: 0, gap: 1 },
  stepCardType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  stepCardName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  stepCardDetail: { fontSize: 12, color: "#6b7280" },
  stepCardStatus: { fontSize: 12, color: "#93c5fd", fontStyle: "italic" },
  cardAction:     { padding: 4 },

  dragHandle: {
    paddingHorizontal: 2,
    justifyContent: "center", alignItems: "center",
  },

  // Drag visual feedback
  draggingItem: { opacity: 0.35 },
  dropTargetItemTop: {
    borderTopWidth: 2.5,
    borderTopColor: "#2563eb",
  },
  dropTargetItemBottom: {
    borderBottomWidth: 2.5,
    borderBottomColor: "#2563eb",
  },

  // Inner card (inside loop) — defined for completeness
  innerCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#f8f9fb",
    borderRadius: 10,
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
  loopEmptyText: {
    fontSize: 12, color: "#c4b5fd", fontStyle: "italic",
    paddingVertical: 6,
  },
  loopAddRow: {
    flexDirection: "row", gap: 8,
    paddingTop: 8, marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
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
  insertDividerInner: { paddingHorizontal: 8, paddingVertical: 1 },
  insertLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  insertBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe",
    justifyContent: "center", alignItems: "center",
  },
  insertPasteBtn: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#f5f3ff", borderWidth: 1, borderColor: "#ddd6fe",
    justifyContent: "center", alignItems: "center",
  },
});
