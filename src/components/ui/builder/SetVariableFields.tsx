import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown, Plus } from "lucide-react-native";
import { ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { VarPickerModal } from "./VarPicker";
import { ms, svs } from "./builderStyles";

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

export function SetVariableFields({
  draft,
  variables,
  contextVariables,
  set,
  onCreateVariable,
}: {
  draft: ProgramStep;
  variables: ProgramVariable[] | undefined;
  contextVariables?: ProgramVariable[];
  set: (p: Partial<ProgramStep>) => void;
  onCreateVariable?: () => void;
}) {
  const varList = (variables ?? []).map(v => v.name);
  const contextVarList = (contextVariables ?? []).map(v => v.name);
  const initial = useMemo(() => parseVarExpr(draft.variableName, draft.variableExpr), []);
  const [op, setOp]           = useState<SetVarOp>(initial.op);
  const [rawVal, setRawVal]   = useState(initial.val);
  const [varDropOpen, setVarDropOpen] = useState(false);
  const [opDropOpen,  setOpDropOpen]  = useState(false);
  const [strVarPickerOpen, setStrVarPickerOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const prevVarCount = useRef(variables?.length ?? 0);

  useEffect(() => {
    const current = variables?.length ?? 0;
    if (pendingCreate && current > prevVarCount.current) {
      const newest = variables![current - 1];
      selectVar(newest.name);
      setPendingCreate(false);
    }
    prevVarCount.current = current;
  }, [variables]);

  const selectedVar = [...(variables ?? []), ...(contextVariables ?? [])].find(v => v.name === draft.variableName);
  const isStringVar = selectedVar?.isString === true;

  function apply(varName: string | undefined, operator: SetVarOp, value: string) {
    if (!varName) return;
    const effectiveOp: SetVarOp = isStringVar ? "=" : operator;
    set({ variableName: varName, variableExpr: buildVarExpr(varName, effectiveOp, value) });
  }

  function selectVar(name: string) {
    setVarDropOpen(false);
    const isStr = [...(variables ?? []), ...(contextVariables ?? [])].find(v => v.name === name)?.isString === true;
    const effectiveOp: SetVarOp = isStr ? "=" : op;
    set({ variableName: name, variableExpr: buildVarExpr(name, effectiveOp, rawVal) });
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

  if (varList.length === 0 && contextVarList.length === 0) {
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
        <ChevronDown size={14} color="#7c3aed" />
      </TouchableOpacity>

      {/* Row 2 — Operator (hidden for string vars — strings only support assign) */}
      {!isStringVar && (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>OPERATION</Text>
          <TouchableOpacity style={svs.selectBtn} onPress={() => setOpDropOpen(true)} activeOpacity={0.75}>
            <Text style={svs.selectBtnText}>{op}</Text>
            <Text style={svs.selectBtnSub} numberOfLines={1}>{OP_LABELS[op]}</Text>
            <ChevronDown size={14} color="#7c3aed" />
          </TouchableOpacity>
        </>
      )}

      {/* Row 3 — Value */}
      {isStringVar ? (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>STRING VALUE</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TextInput
              style={[ms.input, { flex: 1, color: "#ea580c" }]}
              value={rawVal}
              onChangeText={changeVal}
              placeholder="e.g.  Part A  or  Part $partId"
              placeholderTextColor="#fba67a"
              returnKeyType="done"
              autoCapitalize="none"
              autoFocus={!!draft.variableName}
            />
            {(variables ?? []).filter(v => !v.isString && !v.points && !v.values).length > 0 && (
              <TouchableOpacity
                style={{ backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 9, paddingHorizontal: 10, justifyContent: "center", marginTop: 6 }}
                onPress={() => setStrVarPickerOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#ea580c" }}>$var</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[ms.hintText, { marginTop: 2 }]}>
            Embed variables with <Text style={{ fontWeight: "700", color: "#ea580c" }}>$varName</Text> — replaced at runtime.
          </Text>
        </>
      ) : (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUE  (number or expression)</Text>
          <TextInput
            style={[ms.input, { color: "#7c3aed" }]}
            value={rawVal}
            onChangeText={changeVal}
            placeholder="e.g.  1  or  $speed * 2"
            placeholderTextColor="#c4b5fd"
            returnKeyType="done"
            autoFocus={!!draft.variableName}
          />
        </>
      )}

      {/* Live preview */}
      {preview && <Text style={svs.preview}>{preview}</Text>}

      {/* Variable picker modal */}
      <SvDropdownModal visible={varDropOpen} onClose={() => setVarDropOpen(false)} title="Select Variable">
        {varList.map((name, i) => (
          <TouchableOpacity
            key={name}
            style={[svs.optionRow, i < varList.length - 1 && svs.optionRowBorder, name === draft.variableName && svs.optionRowActive]}
            onPress={() => selectVar(name)}
            activeOpacity={0.7}
          >
            <Text style={[svs.optionText, name === draft.variableName && svs.optionTextActive]}>${name}</Text>
            {name === draft.variableName && <Check size={15} color="#7c3aed" />}
          </TouchableOpacity>
        ))}
        {contextVarList.length > 0 && (
          <>
            <View style={{ paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4,
              borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb",
              marginTop: varList.length > 0 ? 4 : 0 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#9ca3af", letterSpacing: 0.5 }}>CALLER VARIABLES</Text>
            </View>
            {contextVarList.map((name, i) => (
              <TouchableOpacity
                key={`ctx_${name}`}
                style={[svs.optionRow, i < contextVarList.length - 1 && svs.optionRowBorder, name === draft.variableName && svs.optionRowActive]}
                onPress={() => selectVar(name)}
                activeOpacity={0.7}
              >
                <Text style={[svs.optionText, name === draft.variableName && svs.optionTextActive]}>${name}</Text>
                {name === draft.variableName && <Check size={15} color="#7c3aed" />}
              </TouchableOpacity>
            ))}
          </>
        )}
        {onCreateVariable && (
          <TouchableOpacity
            style={[svs.optionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb", marginTop: 4 }]}
            onPress={() => { setVarDropOpen(false); setPendingCreate(true); onCreateVariable(); }}
            activeOpacity={0.7}
          >
            <Plus size={14} color="#7c3aed" />
            <Text style={[svs.optionText, { color: "#7c3aed", marginLeft: 6 }]}>Create Variable…</Text>
          </TouchableOpacity>
        )}
      </SvDropdownModal>

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
              {o === op && <Check size={15} color="#7c3aed" />}
            </TouchableOpacity>
          ))}
        </SvDropdownModal>
      )}

      {/* String var token picker — inserts $varName into string value */}
      <VarPickerModal
        visible={strVarPickerOpen}
        onClose={() => setStrVarPickerOpen(false)}
        variables={(variables ?? []).filter(v => !v.points && !v.values)}
        contextVariables={(contextVariables ?? []).filter(v => !v.points && !v.values)}
        contextLabel="Caller Variables"
        selected={undefined}
        title="Insert Variable"
        onSelect={v => { if (v) insertStrToken(v.name); setStrVarPickerOpen(false); }}
      />
    </>
  );
}
