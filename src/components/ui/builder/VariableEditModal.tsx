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
import { Check, ChevronDown, Plus, X } from "lucide-react-native";
import { ProgramVariable } from "@/src/models/robotModels";
import { ms } from "./builderStyles";
import { newId } from "./stepUtils";

export function VariableEditModal({
  visible,
  variable,
  onSave,
  onClose,
}: {
  visible: boolean;
  variable: ProgramVariable | null;
  onSave: (v: ProgramVariable) => void;
  onClose: () => void;
}) {
  const [name,       setName]       = useState("");
  const [value,      setValue]      = useState("0");
  const [stringVal,  setStringVal]  = useState("");
  const [desc,       setDesc]       = useState("");
  const [varType,    setVarType]    = useState<"number" | "boolean" | "list" | "points" | "stopwatch" | "string">("number");
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [listValues, setListValues] = useState<string[]>(["0"]);
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
      if (variable.points != null) {
        setVarType("points");
        setValue("0"); setStringVal(""); setListValues(["0"]);
      } else if (variable.values != null && variable.values.length > 0) {
        setVarType("list");
        setListValues(variable.values.map(String));
        setValue("0"); setStringVal("");
      } else if (variable.isBoolean) {
        setVarType("boolean");
        setValue(variable.value !== 0 ? "1" : "0");
        setStringVal(""); setListValues(["0"]);
      } else if (variable.isStopwatch) {
        setVarType("stopwatch");
        setValue("0"); setStringVal(""); setListValues(["0"]);
      } else if (variable.isString) {
        setVarType("string");
        setStringVal(variable.stringValue ?? "");
        setValue("0"); setListValues(["0"]);
      } else {
        setVarType("number");
        setValue(String(variable.value));
        setStringVal(""); setListValues(["0"]);
      }
    } else {
      setName(""); setValue("0"); setStringVal(""); setDesc(""); setVarType("number"); setListValues(["0"]); setIsGlobal(false); setDisplayOnMonitor(false); setIsPersistent(false);
    }
  }, [variable, visible]);

  const isNew   = variable === null;
  const canSave = name.trim().length > 0 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim());

  function updateListItem(index: number, raw: string) {
    if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
      setListValues(prev => prev.map((v, i) => i === index ? raw : v));
    }
  }

  function addListItem() {
    setListValues(prev => [...prev, "0"]);
  }

  function removeListItem(index: number) {
    setListValues(prev => prev.filter((_, i) => i !== index));
  }

  const refLabel = varType === "points"
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0891b2", fontWeight: "600" }}>${name.trim() || "name"}[0].x</Text> in expressions. Populated at runtime by RunVision steps.</Text>
    : varType === "list"
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}[0]</Text> in expressions.</Text>
    : varType === "boolean"
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#16a34a", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions. <Text style={{ fontWeight: "600" }}>True = 1, False = 0.</Text></Text>
    : varType === "stopwatch"
    ? <Text style={ms.hintText}>Referenced as <Text style={{ color: "#0891b2", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions. Value is elapsed milliseconds.</Text>
    : varType === "string"
    ? <Text style={ms.hintText}>Use <Text style={{ color: "#ea580c", fontWeight: "600" }}>${name.trim() || "name"}</Text> in StatusUpdate messages or string expressions. Supports <Text style={{ fontWeight: "600" }}>$otherVar</Text> interpolation in values.</Text>
    : <Text style={ms.hintText}>Referenced as <Text style={{ color: "#7c3aed", fontWeight: "600" }}>${name.trim() || "name"}</Text> in expressions.</Text>;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose}>
        <Pressable style={ms.card} onPress={() => {}}>
          <View style={ms.header}>
            <View style={{ width: 18 }} />
            <Text style={ms.title}>{isNew ? "New Variable" : "Edit Variable"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Text style={ms.fieldLabel}>NAME</Text>
          <TextInput
            style={ms.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. speed, pickHeight, counter"
            placeholderTextColor="#9ca3af"
            autoFocus={isNew}
            autoCapitalize="none"
            returnKeyType="next"
          />
          {name.trim().length > 0 && !canSave && (
            <Text style={ms.fieldError}>Use letters, digits, and _ only. Must start with a letter.</Text>
          )}

          {/* Type dropdown */}
          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>TYPE</Text>
          {(() => {
            const TYPE_OPTIONS: { key: typeof varType; label: string; color: string; bg: string; border: string }[] = [
              { key: "number",    label: "Number",    color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
              { key: "boolean",   label: "Boolean",   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
              { key: "string",    label: "String",    color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
              { key: "list",      label: "List",      color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
              { key: "points",    label: "Points",    color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
              { key: "stopwatch", label: "Stopwatch", color: "#0891b2", bg: "#e0f2fe", border: "#7dd3fc" },
            ];
            const selected = TYPE_OPTIONS.find(o => o.key === varType)!;
            return (
              <View style={{ marginBottom: 4 }}>
                <TouchableOpacity
                  onPress={() => setTypePickerOpen(v => !v)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    borderWidth: 1, borderColor: selected.border, borderRadius: 10,
                    backgroundColor: selected.bg, paddingHorizontal: 14, paddingVertical: 11,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: selected.color }}>{selected.label}</Text>
                  <ChevronDown size={16} color={selected.color} style={{ transform: [{ rotate: typePickerOpen ? "180deg" : "0deg" }] }} />
                </TouchableOpacity>

                {typePickerOpen && (
                  <View style={{
                    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
                    backgroundColor: "#fff", marginTop: 4,
                    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
                    overflow: "hidden",
                  }}>
                    {TYPE_OPTIONS.map((opt, i) => (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => {
                          if (opt.key === "boolean" && value !== "0" && value !== "1") setValue("0");
                          setVarType(opt.key as typeof varType);
                          setTypePickerOpen(false);
                        }}
                        activeOpacity={0.7}
                        style={[
                          { flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                            paddingHorizontal: 14, paddingVertical: 12 },
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#f3f4f6" },
                          varType === opt.key && { backgroundColor: opt.bg },
                        ]}
                      >
                        <Text style={{ fontSize: 14, fontWeight: varType === opt.key ? "700" : "500",
                          color: varType === opt.key ? opt.color : "#374151" }}>
                          {opt.label}
                        </Text>
                        {varType === opt.key && <Check size={15} color={opt.color} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })()}
          {refLabel}

          {varType === "number" ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              <TextInput
                style={ms.input}
                value={value}
                onChangeText={v => { if (v === "" || /^-?\d*\.?\d*$/.test(v)) setValue(v); }}
                keyboardType="numbers-and-punctuation"
                selectTextOnFocus
              />
            </>
          ) : varType === "boolean" ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>INITIAL VALUE</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                {([{ label: "False  (0)", v: "0" }, { label: "True  (1)", v: "1" }] as const).map(opt => (
                  <TouchableOpacity
                    key={opt.v}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center",
                      borderWidth: 1.5,
                      borderColor: value === opt.v ? "#16a34a" : "#e5e7eb",
                      backgroundColor: value === opt.v ? "#f0fdf4" : "#f9fafb" }]}
                    onPress={() => setValue(opt.v)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: value === opt.v ? "#16a34a" : "#6b7280" }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : varType === "list" ? (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 12 }]}>VALUES</Text>
              {listValues.map((v, idx) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: "#9ca3af", width: 22, textAlign: "right" }}>{idx}</Text>
                  <TextInput
                    style={[ms.input, { flex: 1, marginBottom: 0 }]}
                    value={v}
                    onChangeText={raw => updateListItem(idx, raw)}
                    keyboardType="numbers-and-punctuation"
                    selectTextOnFocus
                  />
                  <TouchableOpacity onPress={() => removeListItem(idx)} hitSlop={8} activeOpacity={0.7}>
                    <X size={15} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, paddingVertical: 6 }}
                onPress={addListItem}
                activeOpacity={0.7}
              >
                <Plus size={14} color="#7c3aed" />
                <Text style={{ fontSize: 13, color: "#7c3aed", fontWeight: "600" }}>Add item</Text>
              </TouchableOpacity>
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
          ) : (
            <View style={{ backgroundColor: "#ecfeff", borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: "#a5f3fc" }}>
              <Text style={{ fontSize: 13, color: "#0e7490", lineHeight: 18 }}>
                This variable will hold an array of detected blob positions (x, y, z, rx, ry, rz). It starts empty and is populated at runtime by a <Text style={{ fontWeight: "700" }}>RunVision</Text> step.
              </Text>
              <Text style={{ fontSize: 12, color: "#0891b2", marginTop: 6 }}>
                Use <Text style={{ fontWeight: "700" }}>${name.trim() || "name"}[0].x</Text> in expression fields to read blob coordinates.
              </Text>
            </View>
          )}

          <Text style={[ms.fieldLabel, { marginTop: 12 }]}>DESCRIPTION  (optional)</Text>
          <TextInput
            style={ms.input}
            value={desc}
            onChangeText={setDesc}
            placeholder="What this variable controls…"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
          />

          {(varType === "number" || varType === "boolean" || varType === "stopwatch" || varType === "string") && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Show on Monitor</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Display the live value on the program detail page while running.
                  </Text>
                </View>
                <Switch
                  value={displayOnMonitor}
                  onValueChange={setDisplayOnMonitor}
                  trackColor={{ false: "#e5e7eb", true: "#2563eb" }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Global Variable</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Shared across all programs running at the same time. First program to start sets the initial value.
                  </Text>
                </View>
                <Switch
                  value={isGlobal}
                  onValueChange={setIsGlobal}
                  trackColor={{ false: "#e5e7eb", true: "#16a34a" }}
                />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Persistent</Text>
                  <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 15 }}>
                    Value is saved to disk when the program finishes and restored on the next run.
                  </Text>
                </View>
                <Switch
                  value={isPersistent}
                  onValueChange={setIsPersistent}
                  trackColor={{ false: "#e5e7eb", true: "#7c3aed" }}
                />
              </View>
            </>
          )}

          </ScrollView>
          <View style={[ms.actions, { marginTop: 16 }]}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.7}>
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
                  values: varType === "list" ? listValues.map(v => parseFloat(v) || 0) : undefined,
                  points: varType === "points" ? (variable?.points ?? []) : undefined,
                  isBoolean:   varType === "boolean"   ? true : undefined,
                  isStopwatch: varType === "stopwatch" ? true : undefined,
                  isString:    varType === "string"    ? true : undefined,
                  stringValue: varType === "string"    ? stringVal : undefined,
                  isGlobal:        (varType === "number" || varType === "boolean" || varType === "stopwatch" || varType === "string") ? (isGlobal        || undefined) : undefined,
                  displayOnMonitor:(varType === "number" || varType === "boolean" || varType === "stopwatch" || varType === "string") ? (displayOnMonitor || undefined) : undefined,
                  isPersistent:    (varType === "number" || varType === "boolean" || varType === "string") ? (isPersistent || undefined) : undefined,
                  description: desc.trim() || undefined,
                });
                onClose();
              }}
              activeOpacity={0.7}
              disabled={!canSave}
            >
              <Check size={15} color="white" />
              <Text style={ms.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
