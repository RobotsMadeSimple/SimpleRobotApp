import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { X } from "lucide-react-native";
import { ProgramVariable, hasScalarElements, variableList } from "@/src/models/robotModels";
import { VarPickerModal } from "./VarPicker";
import { colors, accents } from "@/src/components/ui/kit";
import { useExpressionEnv } from "./expressions/ExpressionEnv";
import { ExpressionAssist, useFieldFocus } from "./expressions/ExpressionAssist";

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
      placeholderTextColor={colors.textFaint}
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
      placeholderTextColor={colors.textFaint}
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

/** Default chips for ExpressionInput — the four arithmetic operators. */
export const ARITHMETIC_OPS: [string, string][] = [["×", "*"], ["+", "+"], ["-", "-"], ["÷", "/"]];

/**
 * Chips for a field whose answer is a true/false. `and` and `or` are spelled as words
 * because that is how they read in the resulting expression, and `!=` is offered rather
 * than `==` alone because "is not" is the comparison people reach for and the hardest to
 * find on a phone keyboard.
 */
export const COMPARISON_OPS: [string, string][] =
  [[">", ">"], ["<", "<"], ["==", "=="], ["!=", "!="], ["and", "and"], ["or", "or"]];

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
  ops = ARITHMETIC_OPS,
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
  /**
   * The one-tap operator chips, as [label, inserted text]. Defaults to arithmetic, which
   * is what a field expecting a distance or a speed wants. A field whose answer is a
   * true/false wants COMPARISON_OPS instead — typing `>` on a phone keyboard is a trip
   * through the symbol layer.
   */
  ops?: [string, string][];
}) {
  const currentExpr = expressions?.[fieldKey];
  const [text, setText] = useState(currentExpr ?? (value != null ? String(value) : ""));
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const inputRef   = useRef<any>(null);
  const isFocused  = useRef(false);
  const field      = useFieldFocus();
  const env        = useExpressionEnv();

  // Sync when draft changes externally (modal re-opens) — not while user is typing
  useEffect(() => {
    if (isFocused.current) return;
    setText(currentExpr ?? (value != null ? String(value) : ""));
  }, [currentExpr, value]);

  // Text contains variable references, braces or operators → treat as expression.
  // Braces are optional here — the evaluator ignores them — but accepting them keeps
  // "{$i + 1}" working in a numeric field for anyone used to the template syntax.
  //
  // Comparison and logic count too. Without them "1 > 0" would fail this test, and
  // parseFloat would quietly accept the leading "1" and drop the rest.
  const isExpr = (t: string) =>
    /[${}+*\/\(\)<>=!&|]/.test(t) ||
    /\b(?:and|or|not)\b/i.test(t) ||
    (t.includes("-") && !/^-?\d*\.?\d*$/.test(t.trim()));

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
    // A list needs an index to reach a number, and what comes after the index depends on
    // the element type — nothing for the scalar types, an axis for a point. For a record
    // there is no fixed field set, so borrow the first field of the first element and
    // leave a placeholder when the list is empty.
    const list  = variableList(v);
    const token = !list                                   ? `$${v.name}`
                : hasScalarElements(list.elementType)     ? `$${v.name}[0]`
                : list.elementType === "Point"            ? `$${v.name}[0].x`
                : `$${v.name}[0].${Object.keys(list.items[0] ?? {})[0] ?? "field"}`;
    insertToken(token);
  }

  function insertToken(token: string) {
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
  // Properties and IO are pickable too when the builder has loaded them.
  const hasSymbols = (env?.symbols?.properties.length ?? 0) + (env?.symbols?.io.length ?? 0) > 0;
  const canPick    = hasVars || hasSymbols;

  return (
    <View>
      <View style={[style, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
        <TextInput
          ref={inputRef}
          style={{ flex: 1, fontSize: 14, color: exprActive ? accents.purple : colors.text }}
          value={text}
          onChangeText={handleChange}
          onFocus={() => { isFocused.current = true; field.onFocus(); }}
          onBlur={() => { isFocused.current = false; field.onBlur(); commit(text); }}
          onSelectionChange={e => setCursor(e.nativeEvent.selection.end)}
          keyboardType="default"
          placeholder={placeholder ?? (allowUndefined ? "default" : "0")}
          placeholderTextColor={colors.textFaint}
          autoFocus={autoFocus}
          returnKeyType="done"
        />
        {text.trim().length > 0 && (
          <TouchableOpacity onPress={clear} hitSlop={8} activeOpacity={0.7} style={{ paddingLeft: 6 }}>
            <X size={13} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>
      <ExpressionAssist
        text={text}
        cursor={cursor}
        focused={field.focused}
        showValue={exprActive}
        onChangeText={next => { handleChange(next); inputRef.current?.focus(); }}
      />
      {canPick && (
        <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
          {ops.map(([label, op]) => (
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
            <Text style={[exprStyles.opChipText, { color: accents.purple, fontSize: 13 }]}>$var</Text>
          </TouchableOpacity>
        </View>
      )}
      {canPick && (
        <VarPickerModal
          visible={varPickerOpen}
          onClose={() => setVarPickerOpen(false)}
          variables={variables ?? []}
          selected={undefined}
          title="Insert Variable"
          onSelect={v => { if (v) insertVar(v); }}
          onPickSymbol={name => insertToken(`$${name}`)}
        />
      )}
    </View>
  );
}

/**
 * Flags a braced group whose contents reference a name without its `$`.
 *
 * The controller leaves such a group in the text verbatim rather than
 * substituting it, because to the expression evaluator a bare word is not a
 * lookup — it is the value 0, which would quietly produce a wrong answer. This
 * surfaces the mistake at edit time. Words after a dot are components (`.z`,
 * `.length`), and the evaluator's own keywords — the true/false literals and the
 * word-spelled operators — stand alone, so all of those are left alone.
 *
 * Returns the offending group (e.g. `"{index}"`) or null.
 */
const EXPR_KEYWORD = /^(?:true|false|and|or|not)$/i;

export function braceMissingSigil(text: string): string | null {
  for (const m of text.match(/\{[^{}]*\}/g) ?? []) {
    const body = m.slice(1, -1).trim();
    if (!body) continue;
    const leftover = body.replace(/\$\w+/g, " ").replace(/\.\w+/g, " ").match(/[A-Za-z_]\w*/g) ?? [];
    if (leftover.some(w => !EXPR_KEYWORD.test(w))) return m;
  }
  return null;
}

/**
 * Text field whose contents are interpolated at runtime — status messages, save
 * paths, point names. Shares the variable picker, purple highlighting and clear
 * button with ExpressionInput so every field that takes variables behaves alike.
 *
 * Braces are optional. `$name` on its own is enough; `{$name}` is only needed
 * where a reference butts against neighbouring text (`{$prefix}{$i}`) or wraps a
 * whole expression (`bin{$i + 1}`). Picker insertions always use the braced form
 * since it is the one that is correct in every position.
 */
export function TemplateInput({
  value,
  onChange,
  variables,
  style,
  placeholder,
  accent = accents.purple,
  quickTokens,
  autoFocus,
  autoCapitalize = "none",
  insertToken = v => `{$${v.name}}`,
}: {
  value: string;
  onChange: (next: string) => void;
  variables?: ProgramVariable[];
  style?: any;
  placeholder?: string;
  /** Tint for the text and insert chip — lets a screen keep its own accent. */
  accent?: string;
  /** Extra one-tap tokens appended as-is, e.g. `$time_ms`. */
  quickTokens?: string[];
  autoFocus?: boolean;
  /** Defaults to "none", which suits paths and identifiers. Prose wants "sentences". */
  autoCapitalize?: "none" | "sentences";
  /**
   * Text a picked variable contributes. The braced default is correct in any
   * position; override where a kind needs indexing, e.g. points as `$name[0]`.
   */
  insertToken?: (v: ProgramVariable) => string;
}) {
  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const inputRef = useRef<any>(null);

  const hasVars  = (variables?.length ?? 0) > 0;
  const hasRef   = /[${]/.test(value);
  const warning  = useMemo(() => braceMissingSigil(value), [value]);

  function append(token: string) {
    onChange(value + token);
    inputRef.current?.focus();
  }

  return (
    <View>
      <View style={[style, { flexDirection: "row", alignItems: "center", paddingRight: 4 }]}>
        <TextInput
          ref={inputRef}
          style={{ flex: 1, fontSize: 14, color: hasRef ? accent : colors.text }}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCapitalize === "sentences"}
          autoFocus={autoFocus}
          returnKeyType="done"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={8} activeOpacity={0.7} style={{ paddingLeft: 6 }}>
            <X size={13} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {(hasVars || quickTokens?.length) && (
        <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
          {hasVars && (
            <TouchableOpacity
              onPress={() => setVarPickerOpen(true)}
              activeOpacity={0.7}
              style={[exprStyles.opChip, { backgroundColor: "#ede9fe", borderColor: "#c4b5fd" }]}
            >
              <Text style={[exprStyles.opChipText, { color: accents.purple, fontSize: 13 }]}>$var</Text>
            </TouchableOpacity>
          )}
          {(quickTokens ?? []).map(t => (
            <TouchableOpacity key={t} onPress={() => append(t)} activeOpacity={0.7} style={exprStyles.opChip}>
              <Text style={[exprStyles.opChipText, { fontSize: 13 }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {warning && (
        <Text style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>
          {warning} is missing its $ — it will be left as written, not substituted.
        </Text>
      )}

      {hasVars && (
        <VarPickerModal
          visible={varPickerOpen}
          onClose={() => setVarPickerOpen(false)}
          variables={variables!}
          selected={undefined}
          title="Insert Variable"
          onSelect={v => { if (v) append(insertToken(v)); }}
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
  chipText: { fontSize: 13, fontWeight: "700", color: accents.purple },
  chipHint: { fontSize: 10, color: "#a78bfa", marginTop: 1 },
  opChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: "center",
  },
  opChipText: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
});
