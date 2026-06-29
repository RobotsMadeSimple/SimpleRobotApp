import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { ProgramVariable } from "@/src/models/robotModels";
import { VarPickerModal } from "./VarPicker";

// ── Numeric inputs ────────────────────────────────────────────────────────────

export function NumericInput({
  value,
  onChange,
  style,
  autoFocus,
  placeholder,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  style?: any;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");
  const lastValid = useRef<number | undefined>(value);

  // Sync when the draft value changes externally (e.g. modal re-opens)
  useEffect(() => {
    if (value !== undefined && value !== lastValid.current) {
      setText(String(value));
      lastValid.current = value;
    }
  }, [value]);

  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        setText(raw);
        const n = parseFloat(raw);
        if (!isNaN(n)) {
          onChange(n);
          lastValid.current = n;
        }
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (isNaN(n) || text.trim() === "") {
          const fallback = lastValid.current ?? 0;
          setText(String(fallback));
          onChange(fallback);
        }
      }}
      keyboardType="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
    />
  );
}

/**
 * Like NumericInput but allows clearing the field back to undefined ("use default").
 * Empty field on blur stays empty and calls onChange(undefined).
 */
export function OptionalNumericInput({
  value,
  onChange,
  style,
  placeholder = "default",
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  style?: any;
  placeholder?: string;
}) {
  const [text, setText] = useState(value !== undefined ? String(value) : "");

  useEffect(() => {
    setText(value !== undefined ? String(value) : "");
  }, [value]);

  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        setText(raw);
        const n = parseFloat(raw);
        if (!isNaN(n)) onChange(n);
        else if (raw.trim() === "") onChange(undefined);
      }}
      onBlur={() => {
        const n = parseFloat(text);
        if (isNaN(n) || text.trim() === "") {
          setText("");
          onChange(undefined);
        }
      }}
      keyboardType="numeric"
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
    />
  );
}

/** Controlled numeric input that accepts negative numbers and decimals only. */
export function SignedNumberInput({
  value,
  onChange,
  style,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  style: any;
}) {
  const [text, setText] = useState(String(value ?? 0));
  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={raw => {
        // Strip anything that's not a digit, decimal point, or minus sign
        // Minus is only valid at the start
        const s = raw.replace(/[^0-9.\-]/g, "").replace(/(?!^)-/g, "");
        setText(s);
        const n = parseFloat(s);
        if (!isNaN(n)) onChange(n);
      }}
      keyboardType="numbers-and-punctuation"
      selectTextOnFocus
    />
  );
}

/**
 * Numeric field that also accepts math expressions referencing program variables.
 *
 * - Type a plain number as usual.
 * - Type or tap a variable chip to build an expression like "$speed * 0.8".
 * - Text turns purple when an expression is detected.
 * - Tap × to clear back to empty.
 * - Variable chips (when defined) are always shown below the field as one-tap shortcuts.
 */
export function ExpressionInput({
  fieldKey,
  value,
  expressions,
  onChangeValue,
  onChangeExpr,
  style,
  placeholder,
  allowUndefined,
  autoFocus,
  variables,
}: {
  fieldKey: string;
  value: number | undefined;
  expressions: Record<string, string> | undefined;
  onChangeValue: (n: number | undefined) => void;
  onChangeExpr: (key: string, expr: string | undefined) => void;
  style?: any;
  placeholder?: string;
  allowUndefined?: boolean;
  autoFocus?: boolean;
  variables?: ProgramVariable[];
}) {
  const currentExpr = expressions?.[fieldKey];
  const [text, setText] = useState(currentExpr ?? (value != null ? String(value) : ""));
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const inputRef   = useRef<any>(null);
  const isFocused  = useRef(false);

  // Sync when draft changes externally (modal re-opens) — not while user is typing
  useEffect(() => {
    if (isFocused.current) return;
    setText(currentExpr ?? (value != null ? String(value) : ""));
  }, [currentExpr, value]);

  // Text contains variable references or operators → treat as expression
  const isExpr = (t: string) =>
    /[$+*\/\(\)]/.test(t) || (t.includes("-") && !/^-?\d*\.?\d*$/.test(t.trim()));

  function commit(raw: string) {
    const t = raw.trim();
    if (!t) {
      onChangeValue(undefined);
      onChangeExpr(fieldKey, undefined);
      return;
    }
    const n = parseFloat(t);
    if (!isNaN(n) && !isExpr(t)) {
      onChangeValue(n);
      onChangeExpr(fieldKey, undefined);
    } else {
      onChangeExpr(fieldKey, t);
    }
  }

  function handleChange(raw: string) {
    setText(raw);
    const t = raw.trim();
    if (!t) {
      onChangeValue(undefined);
      onChangeExpr(fieldKey, undefined);
    } else if (!isExpr(raw)) {
      const n = parseFloat(t);
      if (!isNaN(n)) { onChangeValue(n); onChangeExpr(fieldKey, undefined); }
    } else {
      onChangeValue(undefined); // clear stale numeric so expression is the only active value
      onChangeExpr(fieldKey, t);
    }
  }

  function insertVar(v: ProgramVariable) {
    const token = v.points != null ? `$${v.name}[0].x`
                : v.values && v.values.length > 0 ? `$${v.name}[0]`
                : `$${v.name}`;
    const ref = text.trim();
    const next = ref ? `${ref} ${token}` : token;
    setText(next);
    onChangeValue(undefined);
    onChangeExpr(fieldKey, next);
    inputRef.current?.focus();
  }

  function insertOp(op: string) {
    const ref = text.trim();
    const next = ref ? `${ref} ${op} ` : `${op} `;
    setText(next);
    onChangeValue(undefined);
    onChangeExpr(fieldKey, next.trim());
    inputRef.current?.focus();
  }

  function clear() {
    setText("");
    onChangeValue(undefined);
    onChangeExpr(fieldKey, undefined);
  }

  const exprActive = isExpr(text);
  const hasVars    = variables && variables.length > 0;

  return (
    <View>
      <View style={[style, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
        <TextInput
          ref={inputRef}
          style={{ flex: 1, fontSize: 14, color: exprActive ? "#7c3aed" : "#111827" }}
          value={text}
          onChangeText={handleChange}
          onFocus={() => { isFocused.current = true; }}
          onBlur={() => { isFocused.current = false; commit(text); }}
          keyboardType="default"
          placeholder={placeholder ?? (allowUndefined ? "default" : "0")}
          placeholderTextColor="#9ca3af"
          autoFocus={autoFocus}
          returnKeyType="done"
        />
        {text.trim().length > 0 && (
          <TouchableOpacity onPress={clear} hitSlop={8} activeOpacity={0.7} style={{ paddingLeft: 6 }}>
            <X size={13} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>
      {hasVars && (
        <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
          {([["×","*"],["+","+"],["-","-"],["÷","/"]] as [string,string][]).map(([label, op]) => (
            <TouchableOpacity
              key={op}
              onPress={() => insertOp(op)}
              activeOpacity={0.7}
              style={exprStyles.opChip}
            >
              <Text style={exprStyles.opChipText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => setVarPickerOpen(true)}
            activeOpacity={0.7}
            style={[exprStyles.opChip, { backgroundColor: "#ede9fe", borderColor: "#c4b5fd" }]}
          >
            <Text style={[exprStyles.opChipText, { color: "#7c3aed", fontSize: 13 }]}>$var</Text>
          </TouchableOpacity>
        </View>
      )}
      {hasVars && (
        <VarPickerModal
          visible={varPickerOpen}
          onClose={() => setVarPickerOpen(false)}
          variables={variables!}
          selected={undefined}
          title="Insert Variable"
          onSelect={v => { if (v) insertVar(v); }}
        />
      )}
    </View>
  );
}

export const exprStyles = StyleSheet.create({
  chip: {
    backgroundColor: "#ede9fe",
    borderWidth: 1,
    borderColor: "#c4b5fd",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: "center",
  },
  chipText: { fontSize: 13, fontWeight: "700", color: "#7c3aed" },
  chipHint: { fontSize: 10, color: "#a78bfa", marginTop: 1 },
  opChip: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: "center",
  },
  opChipText: { fontSize: 15, fontWeight: "600", color: "#374151" },
});
