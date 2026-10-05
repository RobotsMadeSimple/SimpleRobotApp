import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown, Plus, X } from "lucide-react-native";
import {
  ConditionGroup,
  ConditionItem,
  ConditionOp,
  ProgramVariable,
} from "@/src/models/robotModels";
import { svs } from "./builderStyles";
import { newId } from "./stepUtils";
import { colors, spacing, radii, accents } from "@/src/components/ui/kit";
import { ExpressionField } from "./expressions/ExpressionEditorModal";

// ── Condition editor ──────────────────────────────────────────────────────────

const COND_OPS: ConditionOp[] = ["==", "!=", ">", ">=", "<", "<=", "contains", "startsWith", "endsWith"];
const COND_OP_LABELS: Record<ConditionOp, string> = {
  "==": "equals",
  "!=": "not equals",
  ">":  "greater than",
  ">=": "greater than or equal",
  "<":  "less than",
  "<=": "less than or equal",
  "contains":   "contains  (string)",
  "startsWith": "starts with  (string)",
  "endsWith":   "ends with  (string)",
};

export function conditionSummary(group: ConditionGroup | undefined): string {
  if (!group || !group.items || group.items.length === 0) return "(no conditions)";
  const join = group.combinator === "ANY" ? "  OR  " : "  AND  ";
  return group.items.map(it => `${it.left || "?"} ${it.operator} ${it.right || "?"}`).join(join);
}

function ConditionItemEditor({
  item,
  variables,
  contextVariables,
  onChange,
  onDelete,
}: {
  item: ConditionItem;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onChange: (updated: ConditionItem) => void;
  onDelete: () => void;
}) {
  const [opOpen, setOpOpen] = React.useState(false);

  return (
    <View style={{ marginBottom: 10, borderWidth: 1, borderColor: "#e0f2fe", borderRadius: radii.sm, padding: 10, backgroundColor: colors.surface }}>
      {/* Delete button */}
      <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7} style={{ alignSelf: "flex-end", marginBottom: 6 }}>
        <X size={14} color={colors.textFaint} />
      </TouchableOpacity>

      {/* Left — both sides are expressions, so both open the one expression editor. */}
      <Text style={condStyles.sideLabel}>LEFT</Text>
      <ExpressionField
        style={condStyles.field}
        value={item.left ?? ""}
        onChange={v => onChange({ ...item, left: v })}
        title="Left side"
        hint="The value this condition tests."
        placeholder="$var or $stb.in1"
        variables={variables}
        contextVariables={contextVariables}
        contextLabel="Caller Variables"
      />
      <View style={{ height: spacing.md }} />

      {/* Operator — full-width select button */}
      <Text style={condStyles.sideLabel}>OPERATOR</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#e0f2fe", borderWidth: 1.5, borderColor: "#bae6fd", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12 }}
        onPress={() => setOpOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: accents.cyan, flex: 1 }}>{item.operator}</Text>
        <Text style={{ fontSize: 12, color: "#67e8f9", flex: 2 }}>{COND_OP_LABELS[item.operator as ConditionOp] ?? ""}</Text>
        <ChevronDown size={14} color={accents.cyan} />
      </TouchableOpacity>

      {/* Right */}
      <Text style={condStyles.sideLabel}>RIGHT</Text>
      <ExpressionField
        style={condStyles.field}
        value={item.right ?? ""}
        onChange={v => onChange({ ...item, right: v })}
        title="Right side"
        hint="What the left side is compared against."
        placeholder="value or expression"
        variables={variables}
        contextVariables={contextVariables}
        contextLabel="Caller Variables"
      />

      <Modal visible={opOpen} transparent animationType="fade" onRequestClose={() => setOpOpen(false)}>
        <Pressable style={svs.modalOverlay} onPress={() => setOpOpen(false)}>
          <Pressable style={svs.modalCard} onPress={() => {}}>
            <Text style={svs.modalTitle}>Operator</Text>
            {COND_OPS.map((op, i) => (
              <TouchableOpacity key={op}
                style={[svs.optionRow, i < COND_OPS.length - 1 && svs.optionRowBorder, op === item.operator && svs.optionRowActive]}
                onPress={() => { onChange({ ...item, operator: op }); setOpOpen(false); }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: op.length > 3 ? 12 : 16, fontWeight: "700", color: op === item.operator ? accents.cyan : colors.textSecondary, minWidth: 28 }}>{op}</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted, flex: 1 }}>{COND_OP_LABELS[op]}</Text>
                </View>
                {op === item.operator && <Check size={15} color={accents.cyan} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function ConditionGroupEditor({
  group,
  onChange,
  variables,
  contextVariables,
}: {
  group: ConditionGroup;
  onChange: (updated: ConditionGroup) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const accent = accents.cyan;
  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textMuted, marginRight: 4 }}>MATCH</Text>
        {(["ALL", "ANY"] as const).map(opt => (
          <TouchableOpacity key={opt}
            style={[{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
              group.combinator === opt ? { borderColor: accent, backgroundColor: accent } : { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}
            onPress={() => onChange({ ...group, combinator: opt })} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: group.combinator === opt ? colors.onAccent : colors.textMuted }}>{opt}</Text>
          </TouchableOpacity>
        ))}
        <Text style={{ fontSize: 11, color: colors.textMuted }}>
          {group.combinator === "ALL" ? "conditions must be true" : "one must be true"}
        </Text>
      </View>
      {(group.items ?? []).length === 0 && (
        <Text style={{ fontSize: 12, color: colors.textFaint, marginBottom: spacing.md, fontStyle: "italic" }}>No conditions — branch always runs.</Text>
      )}
      {(group.items ?? []).map((item, i) => (
        <ConditionItemEditor key={item.id} item={item} variables={variables} contextVariables={contextVariables}
          onChange={updated => onChange({ ...group, items: (group.items ?? []).map((ci, j) => j === i ? updated : ci) })}
          onDelete={() => onChange({ ...group, items: (group.items ?? []).filter((_, j) => j !== i) })} />
      ))}
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: "#bae6fd", borderStyle: "dashed", borderRadius: radii.sm, paddingVertical: spacing.md, backgroundColor: colors.accentSoft }}
        onPress={() => onChange({ ...group, items: [...(group.items ?? []), { id: newId(), left: "", operator: "==" as ConditionOp, right: "" }] })}
        activeOpacity={0.7}>
        <Plus size={14} color={accent} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: accent }}>Add Condition</Text>
      </TouchableOpacity>
    </View>
  );
}

const condStyles = StyleSheet.create({
  sideLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.4, marginBottom: 4 },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9, minHeight: 38,
  },
});
