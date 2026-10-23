import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, Plus, X } from "lucide-react-native";
import {
  ConditionGroup,
  ConditionItem,
  ProgramVariable,
} from "@/src/models/robotModels";
import { conditionItemText, newId } from "./stepUtils";
import { colors, spacing, accents } from "@/src/components/ui/kit";
import { ExpressionField } from "./expressions/ExpressionEditorModal";

// ── Condition editor ──────────────────────────────────────────────────────────
//
// Laid out like a filter builder (Notion / Airtable / Linear): each condition is one plain
// row, and the and/or that joins them sits BETWEEN the rows as a tappable pill — so the
// "match all / any" choice only appears once there is something to combine, right where it
// reads naturally. Adding a condition is a quiet link, not a button.

export function conditionSummary(group: ConditionGroup | undefined): string {
  if (!group || !group.items || group.items.length === 0) return "(no conditions)";
  const join = group.combinator === "ANY" ? "  OR  " : "  AND  ";
  return group.items.map(it => conditionItemText(it) || "?").join(join);
}

const accent = accents.cyan;

function ConditionRow({
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
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <ExpressionField
          style={s.field}
          value={conditionItemText(item)}
          onChange={v => onChange({ id: item.id, expr: v })}
          title="Condition"
          hint="True when non-zero. e.g. $enabled, or $speed > 5."
          placeholder="$enabled   ·   $speed > 5"
          variables={variables}
          contextVariables={contextVariables}
          contextLabel="Caller Variables"
          clearable={false}
        />
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={10} activeOpacity={0.7} style={s.remove}
        accessibilityRole="button" accessibilityLabel="Remove condition">
        <X size={15} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
}

/** The "— and —" / "— or —" joiner between two conditions; tap to switch the whole group. */
function Connector({ combinator, onToggle }: { combinator: ConditionGroup["combinator"]; onToggle: () => void }) {
  const label = combinator === "ANY" ? "or" : "and";
  return (
    <View style={s.connectorRow}>
      <View style={s.connectorLine} />
      <TouchableOpacity style={s.connectorPill} onPress={onToggle} activeOpacity={0.7} hitSlop={6}
        accessibilityRole="button" accessibilityLabel={`Joined with ${label} — tap to switch`}>
        <Text style={s.connectorText}>{label}</Text>
        <ChevronDown size={12} color={accent} />
      </TouchableOpacity>
      <View style={s.connectorLine} />
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
  const items = group.items ?? [];
  const toggle = () => onChange({ ...group, combinator: group.combinator === "ANY" ? "ALL" : "ANY" });
  return (
    <View style={s.wrap}>
      {items.length === 0 && (
        <Text style={s.empty}>No conditions — runs right away.</Text>
      )}
      {items.map((item, i) => (
        <React.Fragment key={item.id}>
          {i > 0 && <Connector combinator={group.combinator} onToggle={toggle} />}
          <ConditionRow item={item} variables={variables} contextVariables={contextVariables}
            onChange={updated => onChange({ ...group, items: items.map((ci, j) => j === i ? updated : ci) })}
            onDelete={() => onChange({ ...group, items: items.filter((_, j) => j !== i) })} />
        </React.Fragment>
      ))}
      <TouchableOpacity
        style={s.add}
        onPress={() => onChange({ ...group, items: [...items, { id: newId(), expr: "" }] })}
        activeOpacity={0.7} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Add condition">
        <Plus size={14} color={accent} />
        <Text style={s.addText}>Add condition</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  // One soft container around the whole group, so rows + joiners + add-link read as a unit.
  wrap: {
    marginHorizontal: spacing.md, marginTop: spacing.xs,
    padding: spacing.sm + 2, paddingBottom: spacing.xs,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  empty: { fontSize: 12, color: colors.textFaint, fontStyle: "italic", marginBottom: spacing.sm },

  row: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9, minHeight: 38,
    backgroundColor: colors.surface,
  },
  remove: { paddingTop: 12, paddingHorizontal: 2 },

  connectorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 6 },
  connectorLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  connectorPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: "#bae6fd",
  },
  connectorText: { fontSize: 12, fontWeight: "700", color: accent },

  add: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 8, marginTop: 2 },
  addText: { fontSize: 13, fontWeight: "600", color: accent },
});
