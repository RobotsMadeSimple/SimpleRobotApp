import React, { useRef } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
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
import { VarPickerModal } from "./VarPicker";
import { exprStyles } from "./NumericInputs";
import { svs } from "./builderStyles";
import { newId } from "./stepUtils";

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
  const [leftPickerOpen, setLeftPickerOpen] = React.useState(false);
  const [rightPickerOpen, setRightPickerOpen] = React.useState(false);
  const rightRef = useRef<any>(null);
  const hasVars = !!(variables && variables.length > 0);

  function insertRightToken(token: string) {
    const cur = (item.right ?? "").trimEnd();
    const next = cur ? `${cur} ${token} ` : `${token} `;
    onChange({ ...item, right: next });
    rightRef.current?.focus();
  }

  const rightIsExpr = /[$+\-*\/()]/.test(item.right ?? "");

  return (
    <View style={{ marginBottom: 10, borderWidth: 1, borderColor: "#e0f2fe", borderRadius: 10, padding: 10, backgroundColor: "#fff" }}>
      {/* Delete button */}
      <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7} style={{ alignSelf: "flex-end", marginBottom: 6 }}>
        <X size={14} color="#9ca3af" />
      </TouchableOpacity>

      {/* Left */}
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.4, marginBottom: 4 }}>LEFT</Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
        <TextInput
          style={{ flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: "#7c3aed" }}
          value={item.left ?? ""}
          onChangeText={v => onChange({ ...item, left: v })}
          placeholder="$var or $stb.in1"
          placeholderTextColor="#c4b5fd"
          autoCapitalize="none"
        />
        {hasVars && (
          <TouchableOpacity
            onPress={() => setLeftPickerOpen(true)}
            activeOpacity={0.7}
            style={{ backgroundColor: "#ede9fe", borderWidth: 1, borderColor: "#c4b5fd", borderRadius: 8, paddingHorizontal: 10, justifyContent: "center" }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#7c3aed" }}>var</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Operator — full-width select button */}
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.4, marginBottom: 4 }}>OPERATOR</Text>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#e0f2fe", borderWidth: 1.5, borderColor: "#bae6fd", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 12 }}
        onPress={() => setOpOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0891b2", flex: 1 }}>{item.operator}</Text>
        <Text style={{ fontSize: 12, color: "#67e8f9", flex: 2 }}>{COND_OP_LABELS[item.operator as ConditionOp] ?? ""}</Text>
        <ChevronDown size={14} color="#0891b2" />
      </TouchableOpacity>

      {/* Right */}
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.4, marginBottom: 4 }}>RIGHT</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <TextInput
          ref={rightRef}
          style={{ flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: rightIsExpr ? "#7c3aed" : "#111827" }}
          value={item.right ?? ""}
          onChangeText={v => onChange({ ...item, right: v })}
          placeholder="value or expression"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
        />
        {hasVars && (
          <TouchableOpacity
            onPress={() => setRightPickerOpen(true)}
            activeOpacity={0.7}
            style={{ backgroundColor: "#ede9fe", borderWidth: 1, borderColor: "#c4b5fd", borderRadius: 8, paddingHorizontal: 10, justifyContent: "center" }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#7c3aed" }}>var</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
        {([["×", "*"], ["+", "+"], ["−", "-"], ["÷", "/"]] as [string, string][]).map(([label, op]) => (
          <TouchableOpacity key={op} onPress={() => insertRightToken(op)} activeOpacity={0.7} style={exprStyles.opChip}>
            <Text style={exprStyles.opChipText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <VarPickerModal
        visible={leftPickerOpen}
        onClose={() => setLeftPickerOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        contextLabel="Caller Variables"
        selected={(item.left ?? "").startsWith("$") ? item.left.slice(1) : undefined}
        title="Left Variable"
        onSelect={v => { if (v) onChange({ ...item, left: `$${v.name}` }); }}
      />
      <VarPickerModal
        visible={rightPickerOpen}
        onClose={() => setRightPickerOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        contextLabel="Caller Variables"
        selected={(item.right ?? "").startsWith("$") ? item.right.slice(1) : undefined}
        title="Right Variable"
        onSelect={v => { if (v) insertRightToken(`$${v.name}`); }}
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
                  <Text style={{ fontSize: op.length > 3 ? 12 : 16, fontWeight: "700", color: op === item.operator ? "#0891b2" : "#374151", minWidth: 28 }}>{op}</Text>
                  <Text style={{ fontSize: 13, color: "#6b7280", flex: 1 }}>{COND_OP_LABELS[op]}</Text>
                </View>
                {op === item.operator && <Check size={15} color="#0891b2" />}
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
  const accent = "#0891b2";
  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#6b7280", marginRight: 4 }}>MATCH</Text>
        {(["ALL", "ANY"] as const).map(opt => (
          <TouchableOpacity key={opt}
            style={[{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
              group.combinator === opt ? { borderColor: accent, backgroundColor: accent } : { borderColor: "#d1d5db", backgroundColor: "#fff" }]}
            onPress={() => onChange({ ...group, combinator: opt })} activeOpacity={0.7}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: group.combinator === opt ? "#fff" : "#6b7280" }}>{opt}</Text>
          </TouchableOpacity>
        ))}
        <Text style={{ fontSize: 11, color: "#6b7280" }}>
          {group.combinator === "ALL" ? "conditions must be true" : "one must be true"}
        </Text>
      </View>
      {(group.items ?? []).length === 0 && (
        <Text style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10, fontStyle: "italic" }}>No conditions — branch always runs.</Text>
      )}
      {(group.items ?? []).map((item, i) => (
        <ConditionItemEditor key={item.id} item={item} variables={variables} contextVariables={contextVariables}
          onChange={updated => onChange({ ...group, items: (group.items ?? []).map((ci, j) => j === i ? updated : ci) })}
          onDelete={() => onChange({ ...group, items: (group.items ?? []).filter((_, j) => j !== i) })} />
      ))}
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: "#bae6fd", borderStyle: "dashed", borderRadius: 10, paddingVertical: 12, backgroundColor: "#f0f9ff" }}
        onPress={() => onChange({ ...group, items: [...(group.items ?? []), { id: newId(), left: "", operator: "==" as ConditionOp, right: "" }] })}
        activeOpacity={0.7}>
        <Plus size={14} color={accent} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: accent }}>Add Condition</Text>
      </TouchableOpacity>
    </View>
  );
}
