import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, Plus, Trash2 } from "lucide-react-native";
import {
  ConditionGroup,
  ConditionItem,
  ProgramVariable,
} from "@/src/models/robotModels";
import { conditionGroupText, conditionHasMixedJoins, conditionItemText, effectiveJoin, newId } from "./stepUtils";
import { colors, spacing, radii, accents } from "@/src/components/ui/kit";
import { ExpressionField } from "./expressions/ExpressionEditorModal";

// ── Condition editor ──────────────────────────────────────────────────────────
//
// Laid out like a filter builder (Notion / Airtable / Linear): each condition is one plain
// row, and the and/or that joins each PAIR sits between the rows as a tappable pill, so the
// joiner only appears once there is something to combine, right where it reads naturally.
// Joiners can differ per pair (`A and B or C`); AND binds tighter than OR, and when they're
// mixed the editor spells out how the group reads.

export function conditionSummary(group: ConditionGroup | undefined): string {
  return conditionGroupText(group);
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
        <Trash2 size={15} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
}

/** The "— and —" / "— or —" joiner between two conditions; tap to switch just this pair. */
function Connector({ join, onToggle }: { join: "AND" | "OR"; onToggle: () => void }) {
  const label = join === "OR" ? "or" : "and";
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
  // Flip the joiner on one pair only; it's stored on the later item of the pair.
  const toggleJoin = (i: number) => {
    const next: "AND" | "OR" = effectiveJoin(group, i) === "OR" ? "AND" : "OR";
    onChange({ ...group, items: items.map((ci, j) => j === i ? { ...ci, join: next } : ci) });
  };
  return (
    <View style={s.wrap}>
      {items.length === 0 && (
        <Text style={s.empty}>No conditions — runs right away.</Text>
      )}
      {items.map((item, i) => (
        <React.Fragment key={item.id}>
          {i > 0 && <Connector join={effectiveJoin(group, i)} onToggle={() => toggleJoin(i)} />}
          <ConditionRow item={item} variables={variables} contextVariables={contextVariables}
            onChange={updated => onChange({ ...group, items: items.map((ci, j) => j === i ? { ...updated, join: ci.join } : ci) })}
            onDelete={() => onChange({ ...group, items: items.filter((_, j) => j !== i) })} />
        </React.Fragment>
      ))}
      {/* Mixed and/or — show how it groups, since "and" binds before "or". */}
      {conditionHasMixedJoins(group) && (
        <Text style={s.reads} numberOfLines={3}>Reads as  {conditionGroupText(group)}</Text>
      )}
      <TouchableOpacity
        style={s.add}
        onPress={() => onChange({ ...group, items: [...items, { id: newId(), expr: "" }] })}
        activeOpacity={0.7} hitSlop={6}
        accessibilityRole="button" accessibilityLabel="Add condition">
        <Plus size={14} color={accent} />
        <Text style={s.addText}>Add Condition</Text>
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
  reads: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 15 },

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

  // Full-width dashed add button, as it was — it also closes the group off visually.
  add: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: spacing.sm, marginBottom: spacing.xs, paddingVertical: spacing.md,
    borderWidth: 1.5, borderColor: "#bae6fd", borderStyle: "dashed", borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
  },
  addText: { fontSize: 13, fontWeight: "600", color: accent },
});
