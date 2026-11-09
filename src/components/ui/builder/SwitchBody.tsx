import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Check, Pencil, Plus, X } from "lucide-react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { useKeyboardStableCard } from "@/src/platform/keyboard";
import { ProgramStep, ProgramVariable, SwitchCase } from "@/src/models/robotModels";
import { accents, colors } from "@/src/components/ui/kit";
import { ms, sharedStyles } from "./builderStyles";
import { BranchFooter, DeleteBranchButton, ifStyles } from "./IfConditionBody";
import { STEP_THEME, ScopeFrame, caseValuesText, newId } from "./stepUtils";
import { ExpressionField } from "./expressions/ExpressionEditorModal";

// A Switch block's body, modelled on IfConditionBody: a snapping strip of CASE cards (the values
// that select it, as a field — tap to edit — and an Enter pill) and an optional DEFAULT card,
// with + CASE / + DEFAULT controls. Values are expressions compared with the switch value.

const CARD_GAP = 8;

/** Opens the values editor for a case from outside (the inline case header in the step list). */
export type CaseEditRequest = { caseId: string; tick: number };

export function SwitchBody({ step, onEnterScope, onUpdate, variables, contextVariables, editRequest, compact }: {
  step: ProgramStep;
  onEnterScope: (frame: ScopeFrame) => void;
  onUpdate: (updated: ProgramStep) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  editRequest?: CaseEditRequest;
  /** The cases are shown inline in the step list: draw only the controls (and the editor). */
  compact?: boolean;
}) {
  const theme = STEP_THEME["Switch"] ?? STEP_THEME["MoveL"];
  const cases = step.switchCases ?? [];
  const hasDefault = step.switchDefault != null;

  const [editing, setEditing] = useState<{ caseId: string; values: string[] } | null>(null);
  const openEditor = (c: SwitchCase) => setEditing({ caseId: c.id, values: c.values?.length ? [...c.values] : [""] });
  useEffect(() => {
    const c = editRequest ? cases.find(x => x.id === editRequest.caseId) : undefined;
    if (c) openEditor(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest?.tick]);

  function saveValues() {
    if (!editing) return;
    const values = editing.values.map(v => v.trim()).filter(Boolean);
    onUpdate({ ...step, switchCases: cases.map(c => (c.id === editing.caseId ? { ...c, values } : c)) });
    setEditing(null);
  }

  const [stripW, setStripW] = useState(0);
  const [page, setPage] = useState(0);
  const stripRef = useRef<ScrollView>(null);
  const cardCount = cases.length + (hasDefault ? 1 : 0);
  const inner = Math.max(0, stripW - 20);
  const cardW = cardCount > 1 ? Math.round(inner * 0.82) : inner;
  const snap = cardW + CARD_GAP;
  const cardStyle = cardW > 0 ? { width: cardW } : undefined;

  // A newly added case lands at the end of the strip — scroll to it.
  const prevCount = useRef(cardCount);
  useEffect(() => {
    if (cardCount > prevCount.current && snap > 0) {
      requestAnimationFrame(() => stripRef.current?.scrollTo({ x: (cardCount - 1) * snap, animated: true }));
    }
    prevCount.current = cardCount;
  }, [cardCount, snap]);

  const kb = useKeyboardStableCard(editing !== null);

  return (
    <View style={[sharedStyles.loopCardBody, { borderTopColor: theme.accent + "40" }]}>
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={ms.overlay}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setEditing(null)} />
          <View onLayout={kb.onCardLayout} style={[ms.card, kb.cardStyle]}>
            <View style={ms.header}>
              <View style={{ width: 18 }} />
              <Text style={ms.title}>Case Values</Text>
              <TouchableOpacity onPress={() => setEditing(null)} hitSlop={12} activeOpacity={0.7}>
                <X size={18} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
            <ScrollView ref={kb.scrollRef} onScroll={kb.onScroll} scrollEventThrottle={16}
              style={{ flexShrink: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: kb.contentPaddingBottom }}>
              <Text style={[ms.hintText, { marginTop: 0, marginBottom: 8 }]}>
                This case runs when the switch value equals any of these. Each value can be a number or an expression.
              </Text>
              {editing?.values.map((v, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <ExpressionField
                      value={v}
                      onChange={t => setEditing(e => e && { ...e, values: e.values.map((x, j) => (j === i ? t : x)) })}
                      title={`Case value ${i + 1}`}
                      placeholder="value"
                      variables={variables}
                      contextVariables={contextVariables}
                      style={ms.input}
                    />
                  </View>
                  {(editing?.values.length ?? 0) > 1 && (
                    <TouchableOpacity onPress={() => setEditing(e => e && { ...e, values: e.values.filter((_, j) => j !== i) })}
                      hitSlop={8} style={{ marginTop: 6 }} accessibilityRole="button" accessibilityLabel={`Remove value ${i + 1}`}>
                      <X size={16} color={colors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={[ms.modRowAdd, { marginTop: 4 }]} activeOpacity={0.7}
                onPress={() => setEditing(e => e && { ...e, values: [...e.values, ""] })}
                accessibilityRole="button" accessibilityLabel="Add value">
                <Plus size={15} color={colors.textFaint} />
                <Text style={ms.modAddText}>Add value</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={ms.actions}>
              <TouchableOpacity style={ms.cancelBtn} onPress={() => setEditing(null)} activeOpacity={0.7}>
                <Text style={ms.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ms.saveBtn} onPress={saveValues} activeOpacity={0.7}>
                <Check size={15} color="white" />
                <Text style={ms.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {!compact && (
        <View onLayout={e => setStripW(e.nativeEvent.layout.width)}>
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={ifStyles.strip}
            snapToInterval={cardCount > 1 ? snap : undefined}
            snapToAlignment="start"
            decelerationRate="fast"
            scrollEventThrottle={32}
            onScroll={e => { if (snap > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / snap)); }}
          >
            {cases.map((c, idx) => (
              <View key={c.id} style={[ifStyles.branchCard, cardStyle, { borderColor: "#bae6fd", backgroundColor: colors.accentSoft }]}>
                <View style={ifStyles.branchHeader}>
                  <View style={[ifStyles.branchBadge, { backgroundColor: accents.cyan }]}>
                    <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>CASE</Text>
                  </View>
                  <TouchableOpacity style={ifStyles.condField} onPress={() => openEditor(c)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel={`Edit values of case ${idx + 1}`}>
                    <Text style={c.values?.length ? ifStyles.condText : [ifStyles.condPlaceholder, { color: accents.cyan }]} numberOfLines={1}>
                      {c.values?.length ? caseValuesText(c.values) : "Set values…"}
                    </Text>
                    <Pencil size={14} color={accents.cyan} />
                  </TouchableOpacity>
                  {cases.length > 1 && (
                    <DeleteBranchButton onPress={() => appAlert("Delete Case", "Remove this case and its steps?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => onUpdate({ ...step, switchCases: cases.filter(x => x.id !== c.id) }) },
                    ])} />
                  )}
                </View>
                <BranchFooter count={(c.steps ?? []).length} tint={accents.cyan}
                  onPress={() => onEnterScope({ kind: "switchCase", stepId: step.id, label: `CASE ${caseValuesText(c.values)}`, branchId: c.id })} />
              </View>
            ))}
            {hasDefault && (
              <View style={[ifStyles.branchCard, cardStyle, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted }]}>
                <View style={ifStyles.branchHeader}>
                  <View style={[ifStyles.branchBadge, { backgroundColor: colors.textMuted }]}>
                    <Text style={[ifStyles.branchLabel, { color: colors.onAccent }]}>DEFAULT</Text>
                  </View>
                  <Text style={ifStyles.elseText} numberOfLines={1}>no case matched</Text>
                  <DeleteBranchButton onPress={() => appAlert("Delete Default", "Remove the Default branch and its steps?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => onUpdate({ ...step, switchDefault: undefined }) },
                  ])} />
                </View>
                <BranchFooter count={(step.switchDefault ?? []).length} tint={colors.textMuted}
                  onPress={() => onEnterScope({ kind: "switchDefault", stepId: step.id, label: "DEFAULT" })} />
              </View>
            )}
          </ScrollView>
          {cardCount > 1 && (
            <View style={ifStyles.dots}>
              {Array.from({ length: cardCount }, (_, i) => (
                <View key={i} style={[ifStyles.dot, i === Math.min(page, cardCount - 1) && ifStyles.dotOn]} />
              ))}
            </View>
          )}
        </View>
      )}

      <View style={[ifStyles.branchControlRow, compact && { marginTop: 0, paddingTop: 0, borderTopWidth: 0 }]}>
        <TouchableOpacity style={ifStyles.branchControlBtn} activeOpacity={0.7}
          onPress={() => onUpdate({ ...step, switchCases: [...cases, { id: newId(), values: [String(cases.length + 1)], steps: [] }] })}
          accessibilityRole="button" accessibilityLabel="Add case">
          <Plus size={11} color={colors.textMuted} />
          <Text style={ifStyles.branchControlText}>CASE</Text>
        </TouchableOpacity>
        {!hasDefault && (
          <TouchableOpacity style={ifStyles.branchControlBtn} activeOpacity={0.7}
            onPress={() => onUpdate({ ...step, switchDefault: [] })}
            accessibilityRole="button" accessibilityLabel="Add default">
            <Plus size={11} color={colors.textMuted} />
            <Text style={ifStyles.branchControlText}>DEFAULT</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
