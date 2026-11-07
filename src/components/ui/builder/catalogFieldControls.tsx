import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check, ChevronDown, Plus, X } from "lucide-react-native";
import {
  FieldSpec,
  Point,
  ProgramStep,
  ProgramVariable,
  ValidationProblem,
  isAssignableVariable,
  isListVariable,
  isPointListVariable,
  isRecordListVariable,
  variableList,
} from "@/src/models/robotModels";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { accents, colors, radii, spacing } from "@/src/components/ui/kit";
import { ms } from "./builderStyles";
import { ExpressionInput, TemplateInput } from "./NumericInputs";
import { ExpressionField } from "./expressions/ExpressionEditorModal";
import { VarPickerModal, VarSelectorButton, type VarCreateSpec } from "./VarPicker";

// The building blocks CatalogStepFields renders a step's catalog fields with (the vision
// editor's ParamFields pattern, for program steps): one control per FieldSpec kind, each with
// its label, unit, help line and any validation problems the controller reported for it.

// ── Caption, help and problems ───────────────────────────────────────────────

/** "SPEED  (mm/s)" — the field's label, its unit, and a dot when it must be filled. */
export function FieldCaption({ field, first }: { field: Pick<FieldSpec, "label" | "unit" | "required">; first?: boolean }) {
  return (
    <Text style={[ms.fieldLabel, !first && { marginTop: 12 }]}>
      {field.label.toUpperCase()}
      {field.unit ? `  (${field.unit})` : ""}
      {field.required ? <Text style={{ color: colors.danger }}>  •</Text> : null}
    </Text>
  );
}

export function FieldHelp({ text }: { text?: string }) {
  return text ? <Text style={ms.hintText}>{text}</Text> : null;
}

/** The controller's problems for one field, under it. */
export function FieldProblems({ problems }: { problems?: ValidationProblem[] }) {
  if (!problems?.length) return null;
  return (
    <>
      {problems.map((p, i) => (
        <Text key={i} style={[ms.fieldError, p.severity !== "error" && { color: colors.warning }]}>
          {p.message}
        </Text>
      ))}
    </>
  );
}

// ── Numbers ──────────────────────────────────────────────────────────────────

const clampTo = (n: number, f: Pick<FieldSpec, "min" | "max" | "kind">) => {
  let v = f.kind === "integer" ? Math.round(n) : n;
  if (f.min != null && v < f.min) v = f.min;
  if (f.max != null && v > f.max) v = f.max;
  return v;
};

const placeholderFor = (f: FieldSpec) =>
  f.default != null && typeof f.default !== "object" ? String(f.default) : "default";

/**
 * A number or integer field. With an expression key it is an ExpressionInput (literal or fx);
 * otherwise a plain numeric box. Out-of-range values are pulled into [min, max] when committed,
 * and the field's default shows as the placeholder (empty = use the default).
 */
export function CatalogNumberField({ field, step, set, setExpr, variables, contextVariables }: {
  field: FieldSpec;
  step: ProgramStep;
  set: (patch: Partial<ProgramStep>) => void;
  setExpr: (key: string, expr: string | undefined) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const raw = (step as unknown as Record<string, unknown>)[field.key];
  const value = typeof raw === "number" ? raw : undefined;
  const commit = (n: number | undefined) => set({ [field.key]: n == null ? undefined : clampTo(n, field) } as Partial<ProgramStep>);
  const range = field.min != null && field.max != null ? `${field.min}–${field.max}`
    : field.min != null ? `≥ ${field.min}` : field.max != null ? `≤ ${field.max}` : null;
  if (field.exprKey) {
    return (
      <ExpressionInput
        key={step.id + field.key}
        style={ms.input}
        fieldKey={field.exprKey}
        label={field.unit ? `${field.label} (${field.unit})` : field.label}
        hint={field.help}
        value={value}
        expressions={step.expressions}
        onChangeValue={commit}
        onChangeExpr={setExpr}
        variables={variables}
        contextVariables={contextVariables}
        allowUndefined
        placeholder={placeholderFor(field)}
      />
    );
  }
  return <PlainNumberInput value={value} onCommit={commit} placeholder={placeholderFor(field)} range={range} label={field.label} />;
}

/** A numeric box that keeps the typed text while focused and commits a parsed number (or none). */
export function PlainNumberInput({ value, onCommit, placeholder, range, label }: {
  value: number | undefined;
  onCommit: (n: number | undefined) => void;
  placeholder?: string;
  range?: string | null;
  label?: string;
}) {
  // The typed text is held only while the field is focused; otherwise it shows the value.
  const [editing, setEditing] = useState<string | null>(null);
  const text = editing ?? (value != null ? String(value) : "");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <TextInput
        style={[ms.input, { flex: 1 }]}
        value={text}
        keyboardType="numbers-and-punctuation"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        aria-label={label}
        onFocus={() => setEditing(text)}
        onChangeText={t => {
          setEditing(t);
          const n = parseFloat(t);
          if (!isNaN(n)) onCommit(n);
          else if (t.trim() === "") onCommit(undefined);
        }}
        onBlur={() => setEditing(null)}
      />
      {range ? <Text style={st.range}>{range}</Text> : null}
    </View>
  );
}

// ── Choices ──────────────────────────────────────────────────────────────────

/**
 * An enum (or an integer with options): a segmented control for up to four short options,
 * otherwise a row that opens a choice sheet. An unset value reads as the field's default.
 */
export function CatalogEnumField({ field, value, onChange }: {
  field: FieldSpec;
  value: unknown;
  onChange: (v: string | number) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const current = value ?? field.default;
  const isActive = (v: string | number) => String(v) === String(current);
  const compact = options.length <= 4 && options.every(o => o.label.length <= 14);
  if (compact) {
    return (
      <View style={ms.segRow}>
        {options.map(o => (
          <TouchableOpacity key={String(o.value)} style={[ms.seg, isActive(o.value) && ms.segActive, { flex: 1 }]}
            onPress={() => onChange(o.value)} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`${field.label}: ${o.label}`}>
            <Text style={[ms.segText, isActive(o.value) && ms.segTextActive]} numberOfLines={1}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }
  const label = options.find(o => isActive(o.value))?.label ?? "Choose…";
  return (
    <>
      <TouchableOpacity style={[ms.input, st.pickRow]} onPress={() => setOpen(true)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={field.label}>
        <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{label}</Text>
        <ChevronDown size={14} color={colors.textFaint} />
      </TouchableOpacity>
      <ChoiceList visible={open} title={field.label} onClose={() => setOpen(false)}
        rows={options.map(o => ({ id: String(o.value), title: o.label }))}
        selected={current == null ? null : String(current)}
        onSelect={id => { const o = options.find(x => String(x.value) === id); if (o) onChange(o.value); }} />
    </>
  );
}

/** A bottom-sheet list of choices with a check on the selected one. */
export function ChoiceList({ visible, title, rows, selected, onSelect, onClose, noneLabel, hint }: {
  visible: boolean;
  title: string;
  rows: { id: string; title: string; subtitle?: string }[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  noneLabel?: string;
  hint?: string;
}) {
  const all = noneLabel ? [{ id: "", title: noneLabel }, ...rows] : rows;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {!!hint && <Text style={[ms.hintText, { marginTop: 0, marginBottom: spacing.sm }]}>{hint}</Text>}
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
        {all.length === 0 && <Text style={ms.emptyHint}>Nothing to choose yet</Text>}
        {all.map((r, i) => {
          const active = (selected ?? "") === r.id;
          return (
            <TouchableOpacity key={r.id || "none"} style={[ms.row, i < all.length - 1 && ms.rowBorder, active && ms.rowActive, { paddingHorizontal: 8 }]}
              onPress={() => { onSelect(r.id || null); onClose(); }} activeOpacity={0.7}>
              <View style={ms.rowText}>
                <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{r.title}</Text>
                {!!r.subtitle && <Text style={ms.rowDesc}>{r.subtitle}</Text>}
              </View>
              {active && <Check size={16} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** A labelled switch. */
export function CatalogBoolField({ field, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: boolean) => void }) {
  const on = value == null ? field.default === true : value === true;
  return (
    <View style={[ms.switchRow, { marginTop: 12 }]}>
      <Text style={[ms.switchLabel, { flex: 1 }]}>{field.label}</Text>
      <Switch value={on} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accent }}
        accessibilityLabel={field.label} />
    </View>
  );
}

// ── Lists ────────────────────────────────────────────────────────────────────

/**
 * A list of short texts. With options (e.g. the catchable error codes) it is a multi-select of
 * chips plus free entries; otherwise one text box per entry, between the field's min and max.
 */
export function CatalogTextListField({ field, value, onChange, optionLabels }: {
  field: FieldSpec;
  value: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  /** Chip labels for option values (falls back to the option's own label). */
  optionLabels?: Record<string, string>;
}) {
  const list = value ?? (Array.isArray(field.default) ? (field.default as string[]) : []);
  const max = field.max ?? 20;
  const min = field.min ?? 0;
  if (field.options?.length) {
    const picked = new Set(list);
    const toggle = (v: string) => {
      const next = picked.has(v) ? list.filter(x => x !== v) : [...list, v];
      onChange(next.length ? next : undefined);
    };
    const custom = list.filter(v => !field.options!.some(o => String(o.value) === v));
    return (
      <View style={st.chipWrap}>
        {field.options.map(o => {
          const v = String(o.value);
          const on = picked.has(v);
          return (
            <TouchableOpacity key={v} style={[st.chip, on && st.chipOn]} onPress={() => toggle(v)} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={`${optionLabels?.[v] ?? o.label}${on ? ", selected" : ""}`}>
              {on && <Check size={11} color={colors.accent} />}
              <Text style={[st.chipText, on && st.chipTextOn]}>{optionLabels?.[v] ?? o.label}</Text>
            </TouchableOpacity>
          );
        })}
        {custom.map(v => (
          <TouchableOpacity key={v} style={[st.chip, st.chipOn]} onPress={() => toggle(v)} activeOpacity={0.75}>
            <Text style={[st.chipText, st.chipTextOn]}>{v}</Text>
            <X size={11} color={colors.accent} />
          </TouchableOpacity>
        ))}
        <AddCustomChip onAdd={v => { if (v && !picked.has(v)) onChange([...list, v]); }} placeholder="own code" />
      </View>
    );
  }
  return (
    <View style={{ gap: 6, marginTop: 2 }}>
      {list.map((v, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            style={[ms.input, { flex: 1 }]}
            value={v}
            placeholder={`${field.label} ${i + 1}`}
            placeholderTextColor={colors.textFaint}
            aria-label={`${field.label} ${i + 1}`}
            onChangeText={t => onChange(list.map((x, j) => (j === i ? t : x)))}
          />
          {list.length > min && (
            <TouchableOpacity onPress={() => onChange(list.filter((_, j) => j !== i))} hitSlop={8} style={{ marginTop: 6 }}
              accessibilityRole="button" accessibilityLabel={`Remove ${field.label} ${i + 1}`}>
              <X size={16} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {list.length < max && (
        <TouchableOpacity style={[ms.modRowAdd, { marginTop: 4 }]} onPress={() => onChange([...list, ""])} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel={`Add ${field.label}`}>
          <Plus size={15} color={colors.textFaint} />
          <Text style={ms.modAddText}>Add {field.label.replace(/s$/, "").toLowerCase()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function AddCustomChip({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <TouchableOpacity style={st.chip} onPress={() => setEditing(true)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel="Add your own code">
        <Plus size={11} color={colors.textMuted} />
        <Text style={st.chipText}>{placeholder}</Text>
      </TouchableOpacity>
    );
  }
  // Typing a code and leaving the field adds it; an empty field stays open for typing.
  const done = () => { if (!text.trim()) return; onAdd(text.trim()); setText(""); setEditing(false); };
  return (
    <TextInput
      style={[st.chip, { minWidth: 110, paddingVertical: 4, color: colors.text }]}
      value={text}
      autoFocus
      autoCapitalize="none"
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      aria-label="Own error code"
      onChangeText={setText}
      onSubmitEditing={done}
      onBlur={done}
      returnKeyType="done"
    />
  );
}

/**
 * `{name: expression}` rows (ListOp fields, routine arguments). `suggest` offers one-tap names
 * (x, y, z, rz for a point) and `fixedKeys` locks the names to a known list.
 */
export function ExprMapField({ label, value, onChange, variables, contextVariables, suggest, fixedKeys, keyPlaceholder = "name" }: {
  label: string;
  value: Record<string, string> | undefined;
  onChange: (next: Record<string, string> | undefined) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  suggest?: string[];
  fixedKeys?: string[];
  keyPlaceholder?: string;
}) {
  const entries = Object.entries(value ?? {});
  const write = (next: [string, string][]) => {
    const obj = Object.fromEntries(next.filter(([k]) => k !== ""));
    onChange(Object.keys(obj).length || next.length ? Object.fromEntries(next) : undefined);
  };
  const missing = (suggest ?? []).filter(k => !entries.some(([e]) => e === k));
  return (
    <View style={{ gap: 6, marginTop: 4 }}>
      {entries.map(([k, v], i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          {fixedKeys ? (
            <Text style={[st.mapKey, { marginTop: 16 }]} numberOfLines={1}>{k}</Text>
          ) : (
            <TextInput
              style={[ms.input, { width: 92 }]}
              value={k}
              autoCapitalize="none"
              placeholder={keyPlaceholder}
              placeholderTextColor={colors.textFaint}
              aria-label={`${label} name ${i + 1}`}
              onChangeText={t => write(entries.map((e, j) => (j === i ? [t.trim(), e[1]] : e)))}
            />
          )}
          <View style={{ flex: 1 }}>
            <ExpressionField
              value={v}
              onChange={t => write(entries.map((e, j) => (j === i ? [e[0], t] : e)))}
              title={`${label}: ${k || "value"}`}
              placeholder="expression"
              variables={variables}
              contextVariables={contextVariables}
              style={ms.input}
            />
          </View>
          {!fixedKeys && (
            <TouchableOpacity onPress={() => write(entries.filter((_, j) => j !== i))} hitSlop={8} style={{ marginTop: 16 }}
              accessibilityRole="button" accessibilityLabel={`Remove ${k || "row"}`}>
              <X size={16} color={colors.textFaint} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {!fixedKeys && (
        <View style={st.chipWrap}>
          {missing.map(k => (
            <TouchableOpacity key={k} style={st.chip} onPress={() => write([...entries, [k, ""]])} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={`Add ${k}`}>
              <Plus size={11} color={colors.textMuted} />
              <Text style={st.chipText}>{k}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={st.chip} onPress={() => write([...entries, ["", ""]])} activeOpacity={0.75}
            accessibilityRole="button" accessibilityLabel={`Add ${label.toLowerCase()} row`}>
            <Plus size={11} color={colors.textMuted} />
            <Text style={st.chipText}>{suggest?.length ? "other" : "Add"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Variables ────────────────────────────────────────────────────────────────

/** Whether a variable fits one of the catalog's varKinds (number, boolean, list:Point, …). */
export function matchesVarKinds(v: ProgramVariable, kinds: string[] | undefined): boolean {
  if (!kinds?.length) return true;
  return kinds.some(k => {
    switch (k) {
      case "number":    return !isListVariable(v) && !v.isBoolean && !v.isString && !v.isImage && !v.isStopwatch;
      case "boolean":   return !isListVariable(v) && !!v.isBoolean;
      case "string":    return !!v.isString;
      case "image":     return !!v.isImage;
      case "stopwatch": return !!v.isStopwatch;
      case "list":      return isListVariable(v);
      case "list:Point":  return isPointListVariable(v);
      case "list:Record": return isRecordListVariable(v);
      case "list:Number":  return variableList(v)?.elementType === "Number";
      case "list:Boolean": return variableList(v)?.elementType === "Boolean";
      default: return false;
    }
  });
}

/** The "+ New … variable" preset for a field: its first variable kind. */
export function createSpecFor(kinds: string[] | undefined): VarCreateSpec {
  const k = kinds?.[0] ?? "number";
  if (k.startsWith("list")) {
    const el = k.split(":")[1] as "Point" | "Record" | "Number" | "Boolean" | undefined;
    return { type: "list", elementType: el ?? "Number" };
  }
  if (k === "boolean" || k === "string" || k === "image" || k === "stopwatch") return { type: k };
  return { type: "number" };
}

/** A variable field: the current `$name` as a button opening the shared, filtered picker. */
export function CatalogVarField({ field, value, onChange, variables, onSaveVariable, write }: {
  field: Pick<FieldSpec, "label" | "varKinds">;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  variables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
  /** A write target: computed variables are not offered. */
  write?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fits = (variables ?? []).filter(v => matchesVarKinds(v, field.varKinds));
  return (
    <>
      <VarSelectorButton label="" marginTop={false} value={value} accent={accents.purple} onPress={() => setOpen(true)} />
      <VarPickerModal
        visible={open}
        onClose={() => setOpen(false)}
        variables={fits}
        selected={value}
        title={field.label}
        showNone
        filter={write ? isAssignableVariable : undefined}
        create={createSpecFor(field.varKinds)}
        onCreateVariable={onSaveVariable}
        allVariables={variables}
        onSelect={v => { onChange(v?.name); setOpen(false); }}
      />
    </>
  );
}

// ── Saved points ─────────────────────────────────────────────────────────────

/** Name a step's point reference shows: the live point by id, else the cached name. */
export function pointNameFor(id: string | undefined, name: string | undefined, points: Point[]): string | undefined {
  if (id) return points.find(p => p.id === id)?.name ?? name;
  return name;
}

/** A saved-point picker writing an id + name pair (linked by id; the name is a fallback). */
export function PointRefField({ label, pointId, pointName, points, onChange, noneLabel }: {
  label: string;
  pointId: string | undefined;
  pointName: string | undefined;
  points: Point[];
  onChange: (p: Point | null) => void;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = pointNameFor(pointId, pointName, points);
  const missing = !!pointId && !points.some(p => p.id === pointId);
  return (
    <>
      <TouchableOpacity style={[ms.input, st.pickRow]} onPress={() => setOpen(true)} activeOpacity={0.75}
        accessibilityRole="button" accessibilityLabel={label}>
        <Text style={{ flex: 1, fontSize: 14, color: shown ? colors.text : colors.textFaint }} numberOfLines={1}>
          {shown ? `${missing ? "⚠ " : ""}${shown}` : (noneLabel ?? "Choose a point…")}
        </Text>
        <ChevronDown size={14} color={colors.textFaint} />
      </TouchableOpacity>
      <ChoiceList visible={open} title={label} onClose={() => setOpen(false)} noneLabel={noneLabel}
        rows={points.map(p => ({ id: p.id || p.name, title: p.name, subtitle: `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}` }))}
        selected={pointId ?? (pointName ? points.find(p => p.name === pointName)?.id ?? null : null)}
        onSelect={id => onChange(id ? points.find(p => (p.id || p.name) === id) ?? null : null)} />
    </>
  );
}

/**
 * A secondary move target (MoveC's via point): a saved point, or an expression / name template
 * resolved when the step runs — the same two forms a move's main target takes.
 */
export function TargetRefField({ label, pointId, pointName, expr, points, variables, onSaveVariable, onPoint, onExpr }: {
  label: string;
  pointId: string | undefined;
  pointName: string | undefined;
  expr: string | undefined;
  points: Point[];
  variables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
  onPoint: (p: Point | null) => void;
  onExpr: (expr: string | undefined) => void;
}) {
  const [mode, setMode] = useState<"point" | "expr">(expr ? "expr" : "point");
  return (
    <>
      <View style={ms.segRow}>
        {(["point", "expr"] as const).map(m => (
          <TouchableOpacity key={m} style={[ms.seg, mode === m && ms.segActive, { flex: 1 }]} activeOpacity={0.8}
            onPress={() => { setMode(m); if (m === "point") onExpr(undefined); else onPoint(null); }}
            accessibilityRole="button" accessibilityLabel={`${label}: ${m === "point" ? "saved point" : "variable"}`}>
            <Text style={[ms.segText, mode === m && ms.segTextActive]}>{m === "point" ? "Saved point" : "Variable"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === "point" ? (
        <PointRefField label={label} pointId={pointId} pointName={pointName} points={points} onChange={onPoint} />
      ) : (
        <TemplateInput
          style={ms.input}
          value={expr ?? ""}
          onChange={v => onExpr(v || undefined)}
          placeholder="$pointsList[$index]  ·  {$name}"
          variables={(variables ?? []).filter(v => !v.isImage)}
          insertToken={v => isPointListVariable(v) ? `$${v.name}[0]` : `{$${v.name}}`}
          create={{ type: "list", elementType: "Point" }}
          onCreateVariable={onSaveVariable}
          allVariables={variables}
        />
      )}
    </>
  );
}

// ── 6-axis blocks (offset / override / tool offset) ──────────────────────────

const AXES = ["X", "Y", "Z", "RX", "RY", "RZ"] as const;

/**
 * The six `<prefix>X…RZ` fields of a move modifier — one block for position offset, override and
 * tool offset (RX/RY are hidden on Z-rotation-only robots). Each takes a number or an expression.
 */
export function Axes6Fields({ prefix, step, set, setExpr, variables, rzOnly, allowUndefined, placeholder, clearLabel }: {
  prefix: "offset" | "override" | "toolOffset";
  step: ProgramStep;
  set: (patch: Partial<ProgramStep>) => void;
  setExpr: (key: string, expr: string | undefined) => void;
  variables?: ProgramVariable[];
  rzOnly?: boolean;
  allowUndefined?: boolean;
  placeholder?: string;
  clearLabel: string;
}) {
  const raw = step as unknown as Record<string, number | undefined>;
  const axes = AXES.filter(a => !rzOnly || (a !== "RX" && a !== "RY"));
  const clear = () => {
    const patch: Record<string, undefined> = {};
    for (const a of AXES) { patch[`${prefix}${a}`] = undefined; setExpr(`${prefix}${a}`, undefined); }
    set(patch as Partial<ProgramStep>);
  };
  return (
    <>
      {axes.map(a => {
        const k = `${prefix}${a}`;
        return (
          <View key={k} style={{ marginBottom: 10 }}>
            <Text style={ms.fieldLabel}>{a}  ({a.startsWith("R") ? "°" : "mm"})</Text>
            <ExpressionInput key={step.id + k} style={ms.input} fieldKey={k}
              value={raw[k]} expressions={step.expressions}
              onChangeValue={n => set({ [k]: n } as Partial<ProgramStep>)} onChangeExpr={setExpr}
              variables={variables} allowUndefined={allowUndefined} placeholder={placeholder} />
          </View>
        );
      })}
      <TouchableOpacity onPress={clear} style={{ marginTop: 4 }} activeOpacity={0.7}>
        <Text style={{ fontSize: 12, color: colors.textFaint }}>{clearLabel}</Text>
      </TouchableOpacity>
    </>
  );
}

const st = StyleSheet.create({
  range: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  chipTextOn: { color: colors.accent },
  mapKey: { width: 92, fontSize: 13, fontWeight: "700", color: accents.purple },
});
