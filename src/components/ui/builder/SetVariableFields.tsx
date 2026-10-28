import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { isAssignableVariable, isListVariable, ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { VarPickerModal, type VarCreateSpec } from "./VarPicker";
import type { VarType } from "./VariableEditModal";
import { ms, svs } from "./builderStyles";
import { accents } from "@/src/components/ui/kit";
import { ExpressionField } from "./expressions/ExpressionEditorModal";

// ── SetVariable helpers ───────────────────────────────────────────────────────

const SET_VAR_OPS = ["=", "+=", "-=", "×=", "/="] as const;
type SetVarOp = typeof SET_VAR_OPS[number];

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function buildVarExpr(varName: string, op: SetVarOp, val: string): string | undefined {
  const v = val.trim();
  if (!v) return undefined;
  if (op === "=")  return v;
  if (op === "+=") return `$${varName} + ${v}`;
  if (op === "-=") return `$${varName} - ${v}`;
  if (op === "×=") return `$${varName} * ${v}`;
  if (op === "/=") return `$${varName} / ${v}`;
}

export function parseVarExpr(varName: string | undefined, expr: string | undefined): { op: SetVarOp; val: string } {
  if (!expr || !varName) return { op: "=", val: "" };
  const m = expr.match(new RegExp(`^\\$${escapeRegex(varName)}\\s*([+\\-*/])\\s*(.+)$`));
  if (!m) return { op: "=", val: expr };
  const opMap: Record<string, SetVarOp> = { "+": "+=", "-": "-=", "*": "×=", "/": "/=" };
  return { op: opMap[m[1]] ?? "=", val: m[2].trim() };
}

export function fmtSetVar(varName: string | undefined, expr: string | undefined): string {
  if (!varName) return "Set Variable";
  const { op, val } = parseVarExpr(varName, expr);
  return op === "=" ? `$${varName} = ${val || "?"}` : `$${varName} ${op} ${val || "?"}`;
}

// ── SetVariableFields ─────────────────────────────────────────────────────────

const OP_LABELS: Record<SetVarOp, string> = {
  "=":  "Assign — set to value",
  "+=": "Add — $var + value",
  "-=": "Subtract — $var − value",
  "×=": "Multiply — $var × value",
  "/=": "Divide — $var ÷ value",
};

function SvDropdownModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={svs.modalOverlay} onPress={onClose}>
        <Pressable style={svs.modalCard} onPress={() => {}}>
          <Text style={svs.modalTitle}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A SetVariable target can be any assignable kind; a plain number is the usual one. */
const SET_VAR_CREATE: VarCreateSpec = { type: "number", label: "variable" };

export function SetVariableFields({
  draft,
  variables,
  contextVariables,
  set,
  onSaveVariable,
}: {
  draft: ProgramStep;
  variables: ProgramVariable[] | undefined;
  contextVariables?: ProgramVariable[];
  set: (p: Partial<ProgramStep>) => void;
  /** Appends a variable created from the picker's "+ New variable" row to the program. */
  onSaveVariable?: (v: ProgramVariable) => void;
  /**
   * @deprecated The picker creates variables itself now (see onSaveVariable). Accepted
   * so an older caller still type-checks; it is not used.
   */
  onCreateVariable?: (defaultType?: VarType) => void;
}) {
  const initial = useMemo(() => parseVarExpr(draft.variableName, draft.variableExpr), []);
  const [op, setOp]           = useState<SetVarOp>(initial.op);
  const [rawVal, setRawVal]   = useState(initial.val);
  const [varDropOpen, setVarDropOpen] = useState(false);
  const [opDropOpen,  setOpDropOpen]  = useState(false);
  const [strVarPickerOpen, setStrVarPickerOpen] = useState(false);

  const selectedVar = [...(variables ?? []), ...(contextVariables ?? [])].find(v => v.name === draft.variableName);
  const isStringVar = selectedVar?.isString === true;
  // Only assignable variables are targets: a computed variable is a formula and a
  // write to it is refused (validation code computedVariable).
  const hasTargets = (variables ?? []).some(isAssignableVariable) || (contextVariables ?? []).some(isAssignableVariable);

  function apply(varName: string | undefined, operator: SetVarOp, value: string) {
    if (!varName) return;
    const effectiveOp: SetVarOp = isStringVar ? "=" : operator;
    set({ variableName: varName, variableExpr: buildVarExpr(varName, effectiveOp, value) });
  }

  // Takes the variable itself rather than its name: one just created by the picker is
  // not in `variables` until the builder's commit comes back through props.
  function selectVar(v: ProgramVariable) {
    setVarDropOpen(false);
    const effectiveOp: SetVarOp = v.isString === true ? "=" : op;
    set({ variableName: v.name, variableExpr: buildVarExpr(v.name, effectiveOp, rawVal) });
  }

  function selectOp(next: SetVarOp) {
    setOpDropOpen(false);
    setOp(next);
    apply(draft.variableName, next, rawVal);
  }

  function changeVal(val: string) {
    setRawVal(val);
    apply(draft.variableName, isStringVar ? "=" : op, val);
  }

  function insertStrToken(token: string) {
    const cur = rawVal.trimEnd();
    const next = cur ? `${cur}$${token}` : `$${token}`;
    setRawVal(next);
    apply(draft.variableName, "=", next);
  }

  // With nothing to pick and no way to create one here, the only route is the builder's
  // Variables section. When the picker can create, the form stays so its "+ New" row is reachable.
  if (!hasTargets && !onSaveVariable) {
    return (
      <Text style={ms.emptyHint}>
        No variables defined. Add variables in the Variables section of the builder.
      </Text>
    );
  }

  const preview = draft.variableName && rawVal
    ? `$${draft.variableName} = ${buildVarExpr(draft.variableName, isStringVar ? "=" : op, rawVal) ?? "?"}`
    : null;

  return (
    <>
      {/* Row 1 — Variable */}
      <Text style={ms.fieldLabel}>VARIABLE</Text>
      <TouchableOpacity style={svs.selectBtn} onPress={() => setVarDropOpen(true)} activeOpacity={0.75}>
        <Text style={[svs.selectBtnText, !draft.variableName && svs.selectBtnPlaceholder]}>
          {draft.variableName ? `$${draft.variableName}` : "Select variable…"}
        </Text>
        <ChevronDown size={14} color={accents.purple} />
      </TouchableOpacity>

      {/* Row 2 — Operator (hidden for string vars — strings only support assign) */}
      {!isStringVar && (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OPERATION</Text>
          <TouchableOpacity style={svs.selectBtn} onPress={() => setOpDropOpen(true)} activeOpacity={0.75}>
            <Text style={svs.selectBtnText}>{op}</Text>
            <Text style={svs.selectBtnSub} numberOfLines={1}>{OP_LABELS[op]}</Text>
            <ChevronDown size={14} color={accents.purple} />
          </TouchableOpacity>
        </>
      )}

      {/* Row 3 — Value */}
      {isStringVar ? (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>STRING VALUE</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TextInput
              style={[ms.input, { flex: 1, color: accents.orange }]}
              value={rawVal}
              onChangeText={changeVal}
              placeholder="e.g.  Part A  or  Part $partId"
              placeholderTextColor="#fba67a"
              returnKeyType="done"
              autoCapitalize="none"
              autoFocus={!!draft.variableName}
            />
            {(variables ?? []).filter(v => !v.isString && !isListVariable(v)).length > 0 && (
              <TouchableOpacity
                style={{ backgroundColor: accents.orangeSoft, borderWidth: 1, borderColor: accents.orangeBorder, borderRadius: 9, paddingHorizontal: 10, justifyContent: "center", marginTop: 6 }}
                onPress={() => setStrVarPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: accents.orange }}>$var</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[ms.hintText, { marginTop: 2 }]}>
            Embed variables with <Text style={{ fontWeight: "700", color: accents.orange }}>$varName</Text> — replaced at runtime.
          </Text>
        </>
      ) : (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE  (number or expression)</Text>
          {/* The same editor every other expression field opens — the value is never
              typed under the keyboard, and the adders are the standard ones. */}
          <ExpressionField
            style={ms.input}
            value={rawVal}
            onChange={changeVal}
            title={`Value for $${draft.variableName ?? "variable"}`}
            hint={op === "=" ? undefined : `Applied as ${op} to the variable's current value.`}
            placeholder="e.g.  1  or  $speed * 2"
            variables={variables}
            contextVariables={contextVariables}
            contextLabel="Caller Variables"
            comparisons={selectedVar?.isBoolean === true}
          />
        </>
      )}

      {/* Live preview */}
      {preview && <Text style={svs.preview}>{preview}</Text>}

      {/* Variable picker — the shared one, with search, kind chips and "+ New variable" */}
      <VarPickerModal
        visible={varDropOpen}
        onClose={() => setVarDropOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        contextLabel="Caller variables"
        filter={isAssignableVariable}
        selected={draft.variableName}
        title="Variable"
        create={SET_VAR_CREATE}
        onCreateVariable={onSaveVariable}
        onSelect={v => { if (v) selectVar(v); }}
      />

      {/* Operator picker modal (numeric vars only) */}
      {!isStringVar && (
        <SvDropdownModal visible={opDropOpen} onClose={() => setOpDropOpen(false)} title="Select Operation">
          {SET_VAR_OPS.map((o, i) => (
            <TouchableOpacity
              key={o}
              style={[svs.optionRow, i < SET_VAR_OPS.length - 1 && svs.optionRowBorder, o === op && svs.optionRowActive]}
              onPress={() => selectOp(o)}
              activeOpacity={0.7}
            >
              <View style={svs.opOptionLeft}>
                <Text style={[svs.opOptionSymbol, o === op && svs.optionTextActive]}>{o}</Text>
                <Text style={svs.opOptionDesc}>{OP_LABELS[o]}</Text>
              </View>
              {o === op && <Check size={15} color={accents.purple} />}
            </TouchableOpacity>
          ))}
        </SvDropdownModal>
      )}

      {/* String var token picker — inserts $varName into string value */}
      <VarPickerModal
        visible={strVarPickerOpen}
        onClose={() => setStrVarPickerOpen(false)}
        variables={(variables ?? []).filter(v => !isListVariable(v))}
        contextVariables={(contextVariables ?? []).filter(v => !isListVariable(v))}
        contextLabel="Caller Variables"
        selected={undefined}
        title="Insert Variable"
        onSelect={v => { if (v) insertStrToken(v.name); setStrVarPickerOpen(false); }}
      />
    </>
  );
}
