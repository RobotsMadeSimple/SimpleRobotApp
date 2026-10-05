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
import { ArrowRight, Check, Pencil, Plus, X } from "lucide-react-native";
import { ConditionGroup, ElseIfBranch, ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { ms, sharedStyles } from "./builderStyles";
import { ConditionGroupEditor, conditionSummary } from "./ConditionEditor";
import { STEP_THEME } from "./stepUtils";
import { newId } from "./stepUtils";
import { ScopeFrame } from "./stepUtils";
import { colors, accents } from "@/src/components/ui/kit";

const ifStyles = StyleSheet.create({
  branchCard: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  branchCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  branchCardHeaderTap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
  },
  branchBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5,
  },
  branchLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  condSummary: { flex: 1, fontSize: 12, color: colors.textMuted },
  branchControlRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  branchControlBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 6, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  branchControlText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.3 },
});

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
    setEditingKey(null);
    setDraftCondition(null);
  }

  return (
    <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>

      {/* Condition editing modal */}
      <Modal visible={editingKey !== null} transparent animationType="fade" onRequestClose={() => setEditingKey(null)}>
        <Pressable style={ms.overlay} onPress={() => setEditingKey(null)}>
          <Pressable style={ms.card} onPress={() => {}}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>Edit Condition</Text>
              <TouchableOpacity onPress={() => setEditingKey(null)} hitSlop={12} activeOpacity={0.7}>
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
          <TouchableOpacity
            style={[ifStyles.branchCardHeader, { backgroundColor: "#e0f2fe" }]}
            onPress={() => openConditionEditor("if")} activeOpacity={0.7}>
            <View style={[ifStyles.branchBadge, { backgroundColor: accents.cyan }]}>
              <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>IF</Text>
            </View>
            <Text style={ifStyles.condSummary} numberOfLines={1}>{conditionSummary(step.condition)}</Text>
            <Pencil size={13} color="#c4b5fd" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
            onPress={() => onEnterScope({ kind: "ifTrue", stepId: step.id, label: "IF" })}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{ifSteps.length} step{ifSteps.length !== 1 ? "s" : ""}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: accents.cyan }}>Enter</Text>
              <ArrowRight size={13} color={accents.cyan} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ELSE IF branches */}
        {elseIfBranches.map((branch, idx) => (
          <View key={branch.id} style={[ifStyles.branchCard, { borderColor: accents.purpleBorder, backgroundColor: "#faf5ff" }]}>
            <View style={[ifStyles.branchCardHeader, { backgroundColor: "#ede9fe" }]}>
              <TouchableOpacity style={ifStyles.branchCardHeaderTap} onPress={() => openConditionEditor(branch.id)} activeOpacity={0.7}>
                <View style={[ifStyles.branchBadge, { backgroundColor: accents.purple }]}>
                  <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>ELSE IF</Text>
                </View>
                <Text style={ifStyles.condSummary} numberOfLines={1}>{conditionSummary(branch.condition)}</Text>
                <Pencil size={13} color="#c4b5fd" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => appAlert("Delete Branch", "Remove this ELSE IF branch and its steps?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => onUpdateIfCondition({ ...step, elseIfBranches: elseIfBranches.filter(b => b.id !== branch.id) }) },
                ])}
                hitSlop={8} activeOpacity={0.7}>
                <X size={13} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={() => onEnterScope({ kind: "elseIf", stepId: step.id, label: `ELSE IF ${idx + 1}`, branchId: branch.id })}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{(branch.steps ?? []).length} step{(branch.steps ?? []).length !== 1 ? "s" : ""}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: accents.purple }}>Enter</Text>
                <ArrowRight size={13} color={accents.purple} />
              </View>
            </TouchableOpacity>
          </View>
        ))}

        {/* ELSE branch */}
        {elseSteps !== undefined && (
          <View style={[ifStyles.branchCard, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted }]}>
            <View style={[ifStyles.branchCardHeader, { backgroundColor: colors.background }]}>
              <View style={[ifStyles.branchBadge, { backgroundColor: colors.textMuted }]}>
                <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>ELSE</Text>
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => appAlert("Delete Branch", "Remove the ELSE branch and its steps?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => onUpdateIfCondition({ ...step, elseSteps: undefined }) },
                ])}
                hitSlop={8} activeOpacity={0.7}>
                <X size={13} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 }}
              onPress={() => onEnterScope({ kind: "else", stepId: step.id, label: "ELSE" })}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{(elseSteps ?? []).length} step{(elseSteps ?? []).length !== 1 ? "s" : ""}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted }}>Enter</Text>
                <ArrowRight size={13} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
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
