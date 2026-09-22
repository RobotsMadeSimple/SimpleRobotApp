import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronDown, Minus, Plus, X } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { colors, accents } from "@/src/components/ui/kit";
import {
  ListElementType,
  ProgramVariable,
  booleanItem,
  hasScalarElements,
  itemScalar,
  numberItem,
  variableList,
} from "@/src/models/robotModels";
import { ms } from "./builderStyles";
import { COMPARISON_OPS, ExpressionInput } from "./NumericInputs";
import { newId } from "./stepUtils";

export type VarType = "number" | "boolean" | "list" | "stopwatch" | "string" | "image";

/**
 * Module scope rather than rebuilt per render — it is a constant, and the trigger button
 * and the picker sheet both read it.
 *
 * Points and object lists used to be separate types here. They are one "List" now, with
 * the element type chosen below it, because the three only ever differed in what their
 * elements were — see ListElementType.
 */
const TYPE_OPTIONS: { key: VarType; label: string; desc: string; color: string; bg: string; border: string }[] = [
  { key: "number",    label: "Number",    desc: "A numeric value",                     color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  { key: "boolean",   label: "Boolean",   desc: "True or false, stored as 1 or 0",     color: colors.success, bg: colors.successSoft, border: "#bbf7d0" },
  { key: "string",    label: "String",    desc: "Text, with $var interpolation",       color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  { key: "image",     label: "Image",     desc: "A camera frame, from CaptureImage",   color: "#0891b2", bg: "#e0f2fe", border: "#7dd3fc" },
  { key: "list",      label: "List",      desc: "Numbers, booleans, points or records", color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  { key: "stopwatch", label: "Stopwatch", desc: "Elapsed milliseconds",                color: "#0891b2", bg: "#e0f2fe", border: "#7dd3fc" },
];

/**
 * The element-type choices, in the order they appear in the picker sheet. The two
 * hand-authored types come first, since those are the ones anyone types values into.
 *
 * Shaped like TYPE_OPTIONS because it is presented the same way — a trigger button that
 * opens a sheet — so the two read as one choice and its sub-choice rather than two
 * unrelated controls.
 */
const ELEMENT_OPTIONS: { key: ListElementType; label: string; desc: string; color: string; bg: string; border: string }[] = [
  { key: "Number",  label: "Numbers",  desc: "Numeric values",                  color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  { key: "Boolean", label: "Booleans", desc: "True/false flags",                color: colors.success, bg: colors.successSoft, border: "#bbf7d0" },
  { key: "Point",   label: "Points",   desc: "Poses — x, y, z, rx, ry, rz",     color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  { key: "Record",  label: "Objects",  desc: "Records of named number fields",  color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4" },
];

/**
 * The two things about an initial-value expression that are not visible from the field:
 * when it runs, and what it can see. Declaration order matters because the controller
 * registers variables in the order they are listed, so an expression can only reach the
 * ones above it.
 */
function InitialValueExprHint({ boolean }: { boolean?: boolean }) {
  return (
    <Text style={[ms.hintText, { marginTop: 6 }]}>
      Evaluated once when the program starts, and again each time a routine is entered. It
      can use variables listed above this one, plus IO.
      {boolean
        ? <Text> Anything non-zero is <Text style={{ fontWeight: "700" }}>True</Text>, so a comparison like <Text style={{ fontWeight: "700", color: "#7c3aed" }}>$count &gt; 5</Text> works directly.</Text>
        : null}
    </Text>
  );
}

export function VariableEditModal({
  visible,
  variable,
  defaultType,
  variables,
  onSave,
  onClose,
}: {
  visible: boolean;
  variable: ProgramVariable | null;
  defaultType?: VarType;
  /**
   * The program's other variables, offered by the $var picker when the initial value is
   * an expression. Optional — without it the field still accepts a typed expression, it
   * just has nothing to insert.
   */
  variables?: ProgramVariable[];
  onSave: (v: ProgramVariable) => void;
  onClose: () => void;
}) {
  const [name,       setName]       = useState("");
  const [value,      setValue]      = useState("0");
  /**
   * The initial value as an expression, or undefined when it is a plain number. Number and
   * Boolean only. Empty string is a distinct state from undefined: it means the expression
   * field is open but nothing has been typed, which is what keeps the Boolean editor from
   * snapping back to its True/False buttons the moment the text is cleared.
   */
  const [valueExpr,  setValueExpr]  = useState<string | undefined>(undefined);
  const [stringVal,  setStringVal]  = useState("");
  const [desc,       setDesc]       = useState("");
  const [varType,    setVarType]    = useState<VarType>("number");
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [elemType,   setElemType]   = useState<ListElementType>("Number");
  const [elemPickerOpen, setElemPickerOpen] = useState(false);
  const [listValues, setListValues] = useState<string[]>([]);
  const [isGlobal,          setIsGlobal]          = useState(false);
  const [displayOnMonitor,  setDisplayOnMonitor]  = useState(false);
  const [isPersistent,      setIsPersistent]      = useState(false);

  useEffect(() => {
    if (variable) {
      setName(variable.name);
      setDesc(variable.description ?? "");
      setIsGlobal(variable.isGlobal ?? false);
      setDisplayOnMonitor(variable.displayOnMonitor ?? false);
      setIsPersistent(variable.isPersistent ?? false);
      // Only the scalar branches below can reach the expression field, but it is restored
      // here for all of them — a variable switched to a list and back keeps what was typed.
      setValueExpr(variable.valueExpression || undefined);
      const list = variableList(variable);
      if (list) {
        setVarType("list");
        setElemType(list.elementType);
        // Only the scalar element types are editable by hand, so only they seed the value
        // rows. Booleans share the rows with numbers because they are stored as 0/1 —
        // switching between the two then carries the values across instead of dropping them.
        // An empty list stays empty: a list that is filled in at runtime is the normal
        // case, so inventing a row would put a 0 into it that nobody asked for.
        setListValues(hasScalarElements(list.elementType)
          ? list.items.map(r => String(itemScalar(r)))
          : []);
        setValue("0"); setStringVal("");
      } else if (variable.isBoolean) {
        setVarType("boolean");
        setValue(variable.value !== 0 ? "1" : "0");
        setStringVal(""); setListValues([]);
      } else if (variable.isStopwatch) {
        setVarType("stopwatch");
        setValue("0"); setStringVal(""); setListValues([]);
      } else if (variable.isString) {
        setVarType("string");
        setStringVal(variable.stringValue ?? "");
        setValue("0"); setListValues([]);
      } else if (variable.isImage) {
        setVarType("image");
        setValue("0"); setStringVal(""); setListValues([]);
      } else {
        setVarType("number");
        setValue(String(variable.value));
        setStringVal(""); setListValues([]);
      }
    } else {
      setName(""); setValue("0"); setValueExpr(undefined); setStringVal(""); setDesc(""); setVarType(defaultType ?? "number"); setElemType("Number"); setListValues([]); setIsGlobal(false); setDisplayOnMonitor(false); setIsPersistent(false);
    }
  }, [variable, visible]);

  const isNew        = variable === null;
  // Point and record elements are filled by RunVision rather than typed here, so a save
  // carries the existing ones through — but only while the element type is unchanged.
  // Switching Points to Objects has to start empty, or number-shaped records would end
  // up attached to a list claiming to hold poses.
  const existingList = variable ? variableList(variable) : null;
  const keptItems    = existingList?.elementType === elemType ? existingList.items : [];
  const canSave      = name.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim());
  const selectedType = TYPE_OPTIONS.find(o => o.key === varType)!;
  const selectedElem = ELEMENT_OPTIONS.find(o => o.key === elemType)!;
  // A variable cannot open with its own value — it does not have one yet when the
  // expression runs. Offering it in the picker would only produce a program that errors
  // at start, since the name is not registered until the expression has been evaluated.
  const exprVars     = (variables ?? []).filter(v => v.id !== variable?.id);
  const usingExpr    = valueExpr !== undefined;

  // The picker sheets are siblings, so they do not go away just because this modal did.
  // Dismissing the modal has to take them with it.
  function closeAll() {
    setTypePickerOpen(false);
    setElemPickerOpen(false);
    onClose();
  }

  function pickType(key: VarType) {
    // Boolean only understands 0 and 1, so a number typed before the switch would
    // otherwise survive into a checkbox that cannot represent it.
    if (key === "boolean" && value !== "0" && value !== "1") setValue("0");
    setVarType(key);
    setTypePickerOpen(false);
  }

  function pickElem(key: ListElementType) {
    setElemType(key);
    setElemPickerOpen(false);
  }

  function updateListItem(index: number, raw: string) {
    if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
      setListValues(prev => prev.map((v, i) => i === index ? raw : v));
    }
  }

  /** Boolean rows write into the same string state, as the "0"/"1" they are stored as. */
  function setListBool(index: number, on: boolean) {
    setListValues(prev => prev.map((v, i) => i === index ? (on ? "1" : "0") : v));
  }

  function addListItem() {
    setListValues(prev => [...prev, "0"]);
  }

  function removeListItem(index: number) {
    setListValues(prev => prev.filter((_, i) => i !== index));
  }

  const refLabel = varType === "list"
    ? elemType === "Point"
      ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0891b2", fontWeight: "600" }}>${name.trim() || "name"}[0].x</Text> in expressions. Elements are added while the program runs.</Text>
      : elemType === "Record"
      ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0d9488", fontWeight: "600" }}>${name.trim() || "name"}[0].field</Text> in expressions. Elements are added while the program runs.</Text>
      : elemType === "Boolean"
      ? <Text style={ms.hintText}>Referenced as <Text style={{ color: colors.success, fontWeight: "600" }}>${name.trim() || "name"}[0]</Text> in expressions. <Text style={{ fontWeight: "600" }}>True = 1, False = 0</Text>, so it drops straight into a condition.</Text>
      : <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}[0]</Text> in expressions.</Text>
    : varType === "boolean"
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: colors.success, fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions. <Text style={{ fontWeight: "600" }}>True = 1, False = 0.</Text></Text>
    : varType === "stopwatch"
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0891b2", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions. Value is elapsed milliseconds.</Text>
    : varType === "string"
    ? <Text style={ms.hintText}>Use <Text style={{ color: "#ea580c", fontWeight: "600" }}>${name.trim() || "name"}</Text> in StatusUpdate messages or string expressions. Supports <Text style={{ fontWeight: "600" }}>$otherVar</Text> interpolation in values.</Text>
    : varType === "image"
    ? <Text style={ms.hintText}>Stores a camera frame as a base64 JPEG. Populated by a <Text style={{ fontWeight: "600" }}>CaptureImage</Text> step at runtime.</Text>
    : <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions.</Text>;

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeAll}>
      <Pressable style={ms.overlay} onPress={closeAll}>
        <Pressable style={ms.card} onPress={() => {}}>
          <View style={ms.header}>
            <View style={{ width: 18 }} />
            <Text style={ms.title}>{isNew ? "New Variable" : "Edit Variable"}</Text>
            <TouchableOpacity onPress={closeAll} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Text style={ms.fieldLabel}>NAME</Text>
          <TextInput
            style={ms.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. speed, pickHeight, counter"
            placeholderTextColor={colors.textFaint}
            autoFocus={isNew}
            autoCapitalize="none"
            returnKeyType="next"
          />
          {name.trim().length > 0 && !canSave && (
            <Text style={ms.fieldError}>Use letters, digits, and _ only. Must start with a letter.</Text>
          )}

          {/* Type — opens the picker sheet below */}
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>TYPE</Text>
          <TouchableOpacity
            onPress={() => setTypePickerOpen(true)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              borderWidth: 1, borderColor: selectedType.border, borderRadius: 10,
              backgroundColor: selectedType.bg, paddingHorizontal: 14, paddingVertical: 11,
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: selectedType.color }}>{selectedType.label}</Text>
            <ChevronDown size={16} color={selectedType.color} />
          </TouchableOpacity>
          {refLabel}

          {varType === "number" ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              {/* The same field the builder's other numeric inputs use, so a plain number
                  is typed exactly as before and an expression is available without a mode
                  switch — ExpressionInput decides which one was written. */}
              <ExpressionInput
                fieldKey="value"
                value={usingExpr ? undefined : (parseFloat(value) || 0)}
                expressions={usingExpr ? { value: valueExpr! } : undefined}
                onChangeValue={n => setValue(n === undefined ? "0" : String(n))}
                onChangeExpr={(_k, e) => setValueExpr(e)}
                style={ms.input}
                variables={exprVars}
              />
              {usingExpr && <InitialValueExprHint />}
            </>
          ) : varType === "boolean" ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              {/* True/False is the right control almost always, and a text box cannot also
                  be one — so the expression form is a third segment rather than an implicit
                  mode the way the number field does it. */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                {([{ label: "False  (0)", v: "0" }, { label: "True  (1)", v: "1" }] as const).map(opt => {
                  const active = !usingExpr && value === opt.v;
                  return (
                    <TouchableOpacity
                      key={opt.v}
                      style={[{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                        borderWidth: 1.5,
                        borderColor: active ? colors.success : colors.border,
                        backgroundColor: active ? colors.successSoft : colors.surfaceMuted }]}
                      onPress={() => { setValueExpr(undefined); setValue(opt.v); }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "700", color: active ? colors.success : colors.textMuted }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: usingExpr ? accents.purple : colors.border,
                    backgroundColor: usingExpr ? accents.purpleSoft : colors.surfaceMuted }}
                  onPress={() => setValueExpr(valueExpr ?? "")}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: usingExpr }}
                  accessibilityLabel="Set the initial value from an expression"
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", fontStyle: "italic",
                    color: usingExpr ? accents.purple : colors.textMuted }}>
                    fx
                  </Text>
                </TouchableOpacity>
              </View>
              {usingExpr && (
                <View style={{ marginTop: 8 }}>
                  <ExpressionInput
                    fieldKey="value"
                    value={undefined}
                    expressions={{ value: valueExpr! }}
                    onChangeValue={() => {}}
                    // Clearing the text stays in expression mode rather than falling back to
                    // the buttons — leaving the field is what the fx segment is for.
                    onChangeExpr={(_k, e) => setValueExpr(e ?? "")}
                    style={ms.input}
                    placeholder="e.g.  $count > 5"
                    variables={exprVars}
                    ops={COMPARISON_OPS}
                  />
                  <InitialValueExprHint boolean />
                </View>
              )}
            </>
          ) : varType === "list" ? (
            <>
              {/* Element type — opens the element picker sheet below. Presented like the
                  TYPE button above it so the sub-choice reads as part of the same decision,
                  and so adding a fifth element type never has to fit on one line. */}
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>LIST OF</Text>
              <TouchableOpacity
                onPress={() => setElemPickerOpen(true)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  borderWidth: 1, borderColor: selectedElem.border, borderRadius: 10,
                  backgroundColor: selectedElem.bg, paddingHorizontal: 14, paddingVertical: 11,
                  marginTop: 4, marginBottom: 4,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: selectedElem.color }}>{selectedElem.label}</Text>
                <ChevronDown size={16} color={selectedElem.color} />
              </TouchableOpacity>

              {elemType === "Point" ? (
                <View style={{ backgroundColor: "#ecfeff", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#a5f3fc" }}>
                  <Text style={{ fontSize: 13, color: "#0e7490", lineHeight: 18 }}>
                    Each element is a pose (x, y, z, rx, ry, rz). The list starts empty and is filled in while the program runs — a <Text style={{ fontWeight: "700" }}>RunVision</Text> step is one source of poses.
                  </Text>
                  <Text style={{ fontSize: 12, color: "#0891b2", marginTop: 6 }}>
                    Read an axis with <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}[0].x</Text> or by position with <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}[0][0]</Text>. A whole element can also be a move target.
                  </Text>
                </View>
              ) : elemType === "Record" ? (
                <View style={{ backgroundColor: "#f0fdfa", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#99f6e4" }}>
                  <Text style={{ fontSize: 13, color: "#0f766e", lineHeight: 18 }}>
                    Each element is a record of named number fields. The list starts empty and is filled in while the program runs, and the field names come from whatever writes it.
                  </Text>
                  <Text style={{ fontSize: 12, color: "#0d9488", marginTop: 6 }}>
                    Read a field with <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}[0].field</Text>, or loop the list with a <Text style={{ fontWeight: "700" }}>For Each</Text> step. Grid inspection results, for example, carry <Text style={{ fontWeight: "700" }}>coverage</Text>, <Text style={{ fontWeight: "700" }}>passed</Text> (1/0), <Text style={{ fontWeight: "700" }}>row</Text>, <Text style={{ fontWeight: "700" }}>col</Text> and <Text style={{ fontWeight: "700" }}>index</Text>.
                  </Text>
                </View>
              ) : (
                <>
              {/* The literal block the HTTP step uses for a JSON body, in its list form —
                  a list literal is what this is, so it is written as one. Numbers and
                  booleans share it; a boolean is stored as the 0/1 a record field can
                  hold, so only the per-row control differs. */}
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUES</Text>
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong,
                borderLeftWidth: 3, borderLeftColor: selectedElem.color,
                backgroundColor: colors.surfaceMuted, marginTop: 4, marginBottom: 4 }}>
                <Text style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
                  fontSize: 15, color: colors.textMuted }}>[</Text>
                {listValues.length === 0 && (
                  <Text style={{ paddingLeft: 28, paddingBottom: 6, fontSize: 13,
                    color: colors.textFaint, fontStyle: "italic" }}>
                    {"// empty — items can also be added while the program runs"}
                  </Text>
                )}
                {listValues.map((v, idx) => (
                  <View key={idx} style={{ flexDirection: "row", alignItems: "center",
                    paddingLeft: 26, paddingRight: 6, paddingVertical: 5 }}>
                    <Text style={{ fontSize: 11, color: colors.textFaint, width: 20 }}>{idx}</Text>
                    {elemType === "Boolean" ? (
                      <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
                        {([{ label: "false", on: false }, { label: "true", on: true }] as const).map(opt => {
                          const active = (v !== "0" && v !== "") === opt.on;
                          return (
                            <TouchableOpacity
                              key={opt.label}
                              style={{ flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: "center",
                                borderWidth: 1,
                                borderColor: active ? colors.success : colors.border,
                                backgroundColor: active ? colors.successSoft : colors.surface }}
                              onPress={() => setListBool(idx, opt.on)}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 13, fontWeight: active ? "700" : "500",
                                color: active ? colors.success : colors.textFaint }}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <TextInput
                        style={{ flex: 1, fontSize: 14, color: "#7c3aed", paddingHorizontal: 1,
                          paddingVertical: 2, minWidth: 30 }}
                        value={v}
                        onChangeText={raw => updateListItem(idx, raw)}
                        placeholder="0"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="numbers-and-punctuation"
                        selectTextOnFocus
                      />
                    )}
                    {idx < listValues.length - 1 && (
                      <Text style={{ fontSize: 14, color: colors.textFaint, marginLeft: 2, marginRight: 2 }}>,</Text>
                    )}
                    <TouchableOpacity onPress={() => removeListItem(idx)}
                      hitSlop={8} style={{ padding: 5 }} activeOpacity={0.7}>
                      <Minus size={13} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 5,
                    paddingLeft: 26, paddingTop: 4, paddingBottom: 8 }}
                  onPress={addListItem}
                  activeOpacity={0.7}
                >
                  <Plus size={12} color={colors.textFaint} />
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>add item</Text>
                </TouchableOpacity>
                <Text style={{ paddingHorizontal: 14, paddingTop: 2, paddingBottom: 10,
                  fontSize: 15, color: colors.textMuted }}>]</Text>
              </View>
                </>
              )}
            </>
          ) : varType === "stopwatch" ? (
            <View style={{ backgroundColor: "#e0f2fe", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#7dd3fc" }}>
              <Text style={{ fontSize: 13, color: "#0369a1", lineHeight: 18 }}>
                This variable holds elapsed milliseconds. Use <Text style={{ fontWeight: "700" }}>StopwatchControl</Text> steps to Start, Stop, and Reset it.
              </Text>
              <Text style={{ fontSize: 12, color: "#0891b2", marginTop: 6 }}>
                Use <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}</Text> in expressions to read the elapsed time in ms.
              </Text>
            </View>
          ) : varType === "image" ? (
            <View style={{ backgroundColor: "#e0f2fe", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#7dd3fc" }}>
              <Text style={{ fontSize: 13, color: "#0369a1", lineHeight: 18 }}>
                This variable stores a camera frame as a base64 JPEG string. It starts empty and is populated at runtime by a <Text style={{ fontWeight: "700" }}>Capture Image</Text> step.
              </Text>
            </View>
          ) : varType === "string" ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              <TextInput
                style={ms.input}
                value={stringVal}
                onChangeText={setStringVal}
                placeholder="e.g.  Part A  or  Hello $partId"
                placeholderTextColor="#fba67a"
                autoCapitalize="none"
              />
              <Text style={[ms.hintText, { marginTop: 2 }]}>
                Use <Text style={{ fontWeight: "700", color: "#ea580c" }}>$varName</Text> inside the value to embed other variable values at runtime.
              </Text>
            </>
          ) : null}

          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DESCRIPTION  (optional)</Text>
          <TextInput
            style={ms.input}
            value={desc}
            onChangeText={setDesc}
            placeholder="What this variable controls…"
            placeholderTextColor={colors.textFaint}
            returnKeyType="done"
          />

          {(varType === "number" || varType === "boolean" || varType === "stopwatch" || varType === "string" || varType === "image") && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Show on Monitor</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
                    Display the live value on the program detail page while running.
                  </Text>
                </View>
                <Switch
                  value={displayOnMonitor}
                  onValueChange={setDisplayOnMonitor}
                  trackColor={{ false: colors.border, true: colors.accent }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Global Variable</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
                    Shared across all programs running at the same time. First program to start sets the initial value.
                  </Text>
                </View>
                <Switch
                  value={isGlobal}
                  onValueChange={setIsGlobal}
                  trackColor={{ false: colors.border, true: colors.success }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Persistent</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
                    Value is saved to disk when the program finishes and restored on the next run.
                  </Text>
                </View>
                <Switch
                  value={isPersistent}
                  onValueChange={setIsPersistent}
                  trackColor={{ false: colors.border, true: "#7c3aed" }}
                />
              </View>
            </>
          )}

          </ScrollView>
          <View style={[ms.actions, { marginTop: 16 }]}>
            <TouchableOpacity style={ms.cancelBtn} onPress={closeAll} activeOpacity={0.7}>
              <Text style={ms.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.saveBtn, !canSave && { opacity: 0.4 }]}
              onPress={() => {
                if (!canSave) return;
                onSave({
                  id: variable?.id ?? newId(),
                  name: name.trim(),
                  value: (varType === "number" || varType === "boolean" || varType === "stopwatch") ? (parseFloat(value) || 0) : 0,
                  // Written alongside value, never instead of it: value stays as the
                  // fallback the controller uses if the expression cannot be evaluated.
                  valueExpression: (varType === "number" || varType === "boolean")
                    ? (valueExpr?.trim() || undefined)
                    : undefined,
                  // One list shape on the wire. Number and boolean lists are rebuilt from
                  // the value rows; points and records are filled by RunVision, so their
                  // existing elements are carried through untouched. Nothing writes the
                  // legacy values/points/objects fields any more, so saving here is also
                  // what migrates an older program off them.
                  //
                  // A row switched from Numbers to Booleans coerces on the usual rule —
                  // anything non-zero is true — rather than being discarded.
                  items: varType !== "list" ? undefined
                    : elemType === "Number"  ? listValues.map(v => numberItem(parseFloat(v) || 0))
                    : elemType === "Boolean" ? listValues.map(v => booleanItem((parseFloat(v) || 0) !== 0))
                    : keptItems,
                  elementType: varType === "list" ? elemType : undefined,
                  isBoolean:   varType === "boolean"   ? true : undefined,
                  isStopwatch: varType === "stopwatch" ? true : undefined,
                  isString:    varType === "string"    ? true : undefined,
                  stringValue: varType === "string"    ? stringVal : undefined,
                  isImage:     varType === "image"     ? true : undefined,
                  isGlobal:        (varType === "number" || varType === "boolean" || varType === "stopwatch" || varType === "string" || varType === "image") ? (isGlobal        || undefined) : undefined,
                  displayOnMonitor:(varType === "number" || varType === "boolean" || varType === "stopwatch" || varType === "string" || varType === "image") ? (displayOnMonitor || undefined) : undefined,
                  isPersistent:    (varType === "number" || varType === "boolean" || varType === "string"    || varType === "image") ? (isPersistent || undefined) : undefined,
                  description: desc.trim() || undefined,
                });
                onClose();
              }}
              activeOpacity={0.7}
              disabled={!canSave}
            >
              <Check size={15} color={colors.onAccent} />
              <Text style={ms.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>

    {/* Sibling of the modal, not a child — a Modal nested inside a Modal is unreliable,
        and every other picker in the builder is hung off the end the same way. */}
    <BottomSheet
      visible={visible && typePickerOpen}
      onClose={() => setTypePickerOpen(false)}
      title="Variable Type"
    >
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
        {TYPE_OPTIONS.map((opt, i) => {
          const active = varType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => pickType(opt.key)}
              activeOpacity={0.7}
              style={[
                { flexDirection: "row", alignItems: "center", gap: 12,
                  paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.background },
                active && { backgroundColor: opt.bg },
              ]}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: active ? "700" : "600",
                  color: active ? opt.color : colors.text }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 2 }}>{opt.desc}</Text>
              </View>
              {active && <Check size={16} color={opt.color} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>

    {/* Only reachable while the type is List, which is the only state that renders its
        trigger — but gated on varType anyway so a stale open flag cannot outlive it. */}
    <BottomSheet
      visible={visible && varType === "list" && elemPickerOpen}
      onClose={() => setElemPickerOpen(false)}
      title="List Of"
    >
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
        {ELEMENT_OPTIONS.map((opt, i) => {
          const active = elemType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => pickElem(opt.key)}
              activeOpacity={0.7}
              style={[
                { flexDirection: "row", alignItems: "center", gap: 12,
                  paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.background },
                active && { backgroundColor: opt.bg },
              ]}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: opt.color }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: active ? "700" : "600",
                  color: active ? opt.color : colors.text }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textFaint, marginTop: 2 }}>{opt.desc}</Text>
              </View>
              {active && <Check size={16} color={opt.color} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
    </>
  );
}
