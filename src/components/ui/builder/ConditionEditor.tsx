import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Plus, X } from "lucide-react-native";
import {
  ConditionGroup,
  ConditionItem,
  ProgramVariable,
} from "@/src/models/robotModels";
import { conditionItemText, newId } from "./stepUtils";
import { colors, spacing, radii, accents } from "@/src/components/ui/kit";
import { ExpressionField } from "./expressions/ExpressionEditorModal";

// ── Condition editor ──────────────────────────────────────────────────────────

export function conditionSummary(group: ConditionGroup | undefined): string {
  if (!group || !group.items || group.items.length === 0) return "(no conditions)";
  const join = group.combinator === "ANY" ? "  OR  " : "  AND  ";
  return group.items.map(it => conditionItemText(it) || "?").join(join);
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
  return (
    <View style={condStyles.row}>
      <View style={{ flex: 1 }}>
        <ExpressionField
          style={condStyles.field}
          value={conditionItemText(item)}
          onChange={v => onChange({ id: item.id, expr: v })}
          title="Condition"
          hint="True when non-zero. e.g. $enabled, or $speed > 5."
          placeholder="$enabled   ·   $speed > 5"
          variables={variables}
          contextVariables={contextVariables}
          contextLabel="Caller Variables"
        />
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7} style={{ paddingLeft: 8, paddingTop: 10 }}>
        <X size={15} color={colors.textFaint} />
      </TouchableOpacity>
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
        onPress={() => onChange({ ...group, items: [...(group.items ?? []), { id: newId(), expr: "" }] })}
        activeOpacity={0.7}>
        <Plus size={14} color={accent} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: accent }}>Add Condition</Text>
      </TouchableOpacity>
    </View>
  );
}

const condStyles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "flex-start", marginBottom: 10,
    borderWidth: 1, borderColor: "#e0f2fe", borderRadius: radii.sm,
    padding: 10, backgroundColor: colors.surface,
  },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9, minHeight: 38,
  },
});
