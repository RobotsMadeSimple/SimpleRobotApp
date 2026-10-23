import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { ArrowRight, Check, Pencil, Plus, Trash2, X } from "lucide-react-native";
import { ConditionGroup, ElseIfBranch, ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { ms, sharedStyles } from "./builderStyles";
import { ConditionGroupEditor, conditionSummary } from "./ConditionEditor";
import { STEP_THEME } from "./stepUtils";
import { newId } from "./stepUtils";
import { ScopeFrame } from "./stepUtils";
import { colors, accents } from "@/src/components/ui/kit";

// Each branch card has exactly two controls, and each looks like what it does: the condition is a
// field (white box + pencil — tap to edit), and the footer is a button (Enter → — tap to open the
// branch's steps). Branch delete is a trash can, like everywhere else in the builder.

const ifStyles = StyleSheet.create({
  branchCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  branchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  branchBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5,
  },
  branchLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  // The condition, as an editable field: tap anywhere on it.
  condField: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    minHeight: 34, paddingLeft: 10, paddingRight: 8,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  condText:        { flex: 1, fontSize: 12, color: colors.text },
  condPlaceholder: { flex: 1, fontSize: 12, fontStyle: "italic" },
  elseText:        { flex: 1, fontSize: 12, color: colors.textMuted, fontStyle: "italic" },
  deleteBtn: { padding: 4 },
  // The footer: whole row taps, but the pill is what reads as the button.
  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingLeft: 12, paddingRight: 8, paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerCount: { fontSize: 12, color: colors.textMuted },
  enterPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999,
    borderWidth: 1, backgroundColor: colors.surface,
  },
  enterText: { fontSize: 12, fontWeight: "700" },
  branchControlRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  branchControlBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 6, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  branchControlText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.3 },
});

/** The branch's condition, drawn as a field: summary text (or a placeholder) + pencil. */
function ConditionField({ group, tint, onPress }: { group: ConditionGroup | undefined; tint: string; onPress: () => void }) {
  const empty = !group?.items?.length;
  return (
    <TouchableOpacity style={ifStyles.condField} onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={empty ? "Set condition" : "Edit condition"}>
      {empty
        ? <Text style={[ifStyles.condPlaceholder, { color: tint }]} numberOfLines={1}>Set condition…</Text>
        : <Text style={ifStyles.condText} numberOfLines={1}>{conditionSummary(group)}</Text>}
      <Pencil size={14} color={tint} />
    </TouchableOpacity>
  );
}

/** "N steps · Enter →" — the row taps, and the pill makes the action obvious. */
function BranchFooter({ count, tint, onPress }: { count: number; tint: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[ifStyles.footer, { borderTopColor: tint + "40" }]} onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={`Enter branch, ${count} steps`}>
      <Text style={ifStyles.footerCount}>{count} step{count !== 1 ? "s" : ""}</Text>
      <View style={[ifStyles.enterPill, { borderColor: tint + "66" }]}>
        <Text style={[ifStyles.enterText, { color: tint }]}>Enter</Text>
        <ArrowRight size={13} color={tint} />
      </View>
    </TouchableOpacity>
  );
}

function DeleteBranchButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} activeOpacity={0.7} style={ifStyles.deleteBtn}
      accessibilityRole="button" accessibilityLabel="Delete branch">
      <Trash2 size={14} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

export function IfConditionBody({
  step,
  onEnterScope,
  onUpdateIfCondition,
  variables,
  contextVariables,
}: {
  step: ProgramStep;
  onEnterScope: (frame: ScopeFrame) => void;
  onUpdateIfCondition: (updated: ProgramStep) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const theme          = STEP_THEME["IfCondition"] ?? STEP_THEME["MoveL"];
  const ifSteps        = step.ifSteps        ?? [];
  const elseIfBranches = step.elseIfBranches ?? [];
  const elseSteps      = step.elseSteps === null ? [] : step.elseSteps;

  const [editingKey, setEditingKey]         = useState<null | "if" | string>(null);
  const [draftCondition, setDraftCondition] = useState<ConditionGroup | null>(null);

  function openConditionEditor(key: "if" | string) {
    const cond = key === "if"
      ? (step.condition ?? { combinator: "ALL" as const, items: [] })
      : (elseIfBranches.find(b => b.id === key)?.condition ?? { combinator: "ALL" as const, items: [] });
    setDraftCondition({ ...cond, items: [...(cond.items ?? [])] });
    setEditingKey(key);
  }

  function closeConditionEditor() {
    setEditingKey(null);
    setDraftCondition(null);
  }

  function saveCondition() {
    if (!editingKey || !draftCondition) return;
    if (editingKey === "if") {
      onUpdateIfCondition({ ...step, condition: draftCondition });
    } else {
      onUpdateIfCondition({
        ...step,
        elseIfBranches: elseIfBranches.map(b =>
          b.id === editingKey ? { ...b, condition: draftCondition } : b
        ),
      });
    }
    closeConditionEditor();
  }

  const editingTitle = editingKey === "if" ? "If" : "Else If";

  return (
    <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>

      {/* Condition editing modal — Cancel discards, Save keeps. */}
      <Modal visible={editingKey !== null} transparent animationType="fade" onRequestClose={closeConditionEditor}>
        <Pressable style={ms.overlay} onPress={closeConditionEditor}>
          <Pressable style={ms.card} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>{editingTitle} Condition</Text>
              <TouchableOpacity onPress={closeConditionEditor} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}>
              {draftCondition && (
                <ConditionGroupEditor group={draftCondition} onChange={setDraftCondition} variables={variables} contextVariables={contextVariables} />
              )}
            </ScrollView>
            <View style={ms.actions}>
              <TouchableOpacity style={ms.cancelBtn} onPress={closeConditionEditor} activeOpacity={0.7}>
                <Text style={ms.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ms.saveBtn} onPress={saveCondition} activeOpacity={0.7}>
                <Check size={15} color="white" />
                <Text style={ms.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ gap: 6, padding: 10 }}>
        {/* IF branch */}
        <View style={[ifStyles.branchCard, { borderColor: "#bae6fd", backgroundColor: colors.accentSoft }]}>
          <View style={ifStyles.branchHeader}>
            <View style={[ifStyles.branchBadge, { backgroundColor: accents.cyan }]}>
              <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>IF</Text>
            </View>
            <ConditionField group={step.condition} tint={accents.cyan} onPress={() => openConditionEditor("if")} />
          </View>
          <BranchFooter count={ifSteps.length} tint={accents.cyan}
            onPress={() => onEnterScope({ kind: "ifTrue", stepId: step.id, label: "IF" })} />
        </View>

        {/* ELSE IF branches */}
        {elseIfBranches.map((branch, idx) => (
          <View key={branch.id} style={[ifStyles.branchCard, { borderColor: accents.purpleBorder, backgroundColor: "#faf5ff" }]}>
            <View style={ifStyles.branchHeader}>
              <View style={[ifStyles.branchBadge, { backgroundColor: accents.purple }]}>
                <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>ELSE IF</Text>
              </View>
              <ConditionField group={branch.condition} tint={accents.purple} onPress={() => openConditionEditor(branch.id)} />
              <DeleteBranchButton onPress={() => appAlert("Delete Branch", "Remove this ELSE IF branch and its steps?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => onUpdateIfCondition({ ...step, elseIfBranches: elseIfBranches.filter(b => b.id !== branch.id) }) },
              ])} />
            </View>
            <BranchFooter count={(branch.steps ?? []).length} tint={accents.purple}
              onPress={() => onEnterScope({ kind: "elseIf", stepId: step.id, label: `ELSE IF ${idx + 1}`, branchId: branch.id })} />
          </View>
        ))}

        {/* ELSE branch */}
        {elseSteps !== undefined && (
          <View style={[ifStyles.branchCard, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted }]}>
            <View style={ifStyles.branchHeader}>
              <View style={[ifStyles.branchBadge, { backgroundColor: colors.textMuted }]}>
                <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>ELSE</Text>
              </View>
              <Text style={ifStyles.elseText} numberOfLines={1}>otherwise</Text>
              <DeleteBranchButton onPress={() => appAlert("Delete Branch", "Remove the ELSE branch and its steps?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => onUpdateIfCondition({ ...step, elseSteps: undefined }) },
              ])} />
            </View>
            <BranchFooter count={(elseSteps ?? []).length} tint={colors.textMuted}
              onPress={() => onEnterScope({ kind: "else", stepId: step.id, label: "ELSE" })} />
          </View>
        )}

        {/* Branch controls */}
        <View style={ifStyles.branchControlRow}>
          <TouchableOpacity
            style={ifStyles.branchControlBtn}
            onPress={() => onUpdateIfCondition({
              ...step,
              elseIfBranches: [...elseIfBranches, { id: newId(), condition: { combinator: "ALL", items: [] }, steps: [] }],
            })}
            activeOpacity={0.7}>
            <Plus size={11} color={colors.textMuted} />
            <Text style={ifStyles.branchControlText}>ELSE IF</Text>
          </TouchableOpacity>
          {elseSteps === undefined && (
            <TouchableOpacity
              style={ifStyles.branchControlBtn}
              onPress={() => onUpdateIfCondition({ ...step, elseSteps: [] })}
              activeOpacity={0.7}>
              <Plus size={11} color={colors.textMuted} />
              <Text style={ifStyles.branchControlText}>ELSE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
