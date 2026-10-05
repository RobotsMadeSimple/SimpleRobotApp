import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check, ChevronDown, ChevronRight, CircleAlert, Plug, Plus, TriangleAlert } from "lucide-react-native";
import {
  PluginOutputDef,
  PluginParamDef,
  PluginStepOutput,
  ProgramStep,
  ProgramVariable,
  isAssignableVariable,
  isPointListVariable,
} from "@/src/models/robotModels";
import { useGrids, usePoints, useStacks } from "@/src/providers/RobotProvider";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { SegmentedControl, accents, colors, radii, spacing } from "@/src/components/ui/kit";
import { Attention } from "@/src/components/ui/calibration/StepRequirements";
import { ms } from "./builderStyles";
import { TemplateInput } from "./NumericInputs";
import { ExpressionField } from "./expressions/ExpressionEditorModal";
import { VarPickerModal } from "./VarPicker";
import { VarType, VariableEditModal } from "./VariableEditModal";
import { usePluginContributions } from "./usePluginContributions";
import {
  PointRef,
  booleanLiteral,
  formatPointRef,
  outputKindHint,
  outputNewVarType,
  outputVariableFilter,
  paramDefaultText,
  paramIssues,
  paramVariableFilter,
  parsePointRef,
} from "./pluginSteps";

// The `Plugin` step's config form (docs/plugins.md §6, §9), generated from the
// manifest step the contributions cache holds for (pluginId, pluginStepId).
// Every param is stored as text in pluginParams; a blank field removes the key so
// the manifest default applies.

const PLUGIN_TINT = colors.surfaceDark;

type SetFields = (fields: Partial<ProgramStep>) => void;

// ── Header ───────────────────────────────────────────────────────────────────

/** "<plugin> · <step label>", the description, and the plugin's state. Above the step name. */
export function PluginStepHeader({ step }: { step: ProgramStep }) {
  const contributions = usePluginContributions();
  const c = contributions.findStep(step.pluginId, step.pluginStepId);
  const pluginName = c?.pluginName ?? contributions.plugins.get(step.pluginId ?? "")?.name ?? step.pluginId ?? "Plugin";
  return (
    <View style={styles.header}>
      <View style={styles.headerIcon}>
        <Plug size={16} color={PLUGIN_TINT} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {pluginName} · {c?.step.label ?? step.pluginStepId ?? "?"}
        </Text>
        {!!c?.step.description && <Text style={styles.headerDesc}>{c.step.description}</Text>}
        {c && !c.running && (
          <Text style={styles.headerWarn}>
            Not running — the step fails when it executes until the plugin is started (IO → Plugins).
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

export function PluginStepFields({
  draft, set, variables, contextVariables, onSaveVariable,
}: {
  draft: ProgramStep;
  set: SetFields;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
}) {
  const contributions = usePluginContributions();
  const c = contributions.findStep(draft.pluginId, draft.pluginStepId);
  const [advancedOpen, setAdvancedOpen] = useState(draft.pluginTimeoutMs != null);

  const params = draft.pluginParams ?? {};
  const setParam = (key: string, text: string) => {
    const next = { ...params };
    if (text.trim() === "") delete next[key];
    else next[key] = text;
    set({ pluginParams: next });
  };

  const outputs = draft.pluginOutputs ?? [];
  const setOutput = (key: string, variableName: string | undefined) => {
    const rest = outputs.filter(o => o.key !== key);
    const next: PluginStepOutput[] = variableName ? [...rest, { key, variableName }] : rest;
    // Keep the manifest's order so the saved JSON does not churn.
    const order = (c?.step.outputs ?? []).map(o => o.key);
    next.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    set({ pluginOutputs: next });
  };

  const issues = new Map(paramIssues(draft, c).map(i => [i.key, i] as const));

  if (!c) {
    return (
      <MissingPluginStep
        draft={draft}
        status={contributions.status}
        pluginInstalled={!!draft.pluginId && contributions.plugins.has(draft.pluginId)}
        setParam={setParam}
        setOutput={setOutput}
        set={set}
      />
    );
  }

  const paramDefs = c.step.params ?? [];
  const outputDefs = c.step.outputs ?? [];

  return (
    <>
      {paramDefs.length > 0 && <Text style={styles.section}>PARAMETERS</Text>}
      {paramDefs.map(def => {
        const issue = issues.get(def.key);
        return (
          <Attention key={def.key} show={issue?.code === "pluginParamMissing"} style={styles.paramBlock}>
            <ParamLabel def={def} />
            <ParamField
              def={def}
              text={params[def.key] ?? ""}
              onChange={t => setParam(def.key, t)}
              variables={variables}
              contextVariables={contextVariables}
            />
            {issue?.code === "pluginParamEnum" && <Text style={ms.fieldError}>{issue.message}</Text>}
            {!!def.help && <Text style={styles.help}>{def.help}</Text>}
          </Attention>
        );
      })}

      {outputDefs.length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: spacing.lg }]}>OUTPUTS</Text>
          <Text style={styles.help}>Pick a variable for each value you want kept. Blank outputs are not written.</Text>
          {outputDefs.map(def => (
            <OutputRow
              key={def.key}
              def={def}
              variableName={outputs.find(o => o.key === def.key)?.variableName}
              onChange={name => setOutput(def.key, name)}
              variables={variables}
              contextVariables={contextVariables}
              onSaveVariable={onSaveVariable}
            />
          ))}
        </>
      )}

      <TouchableOpacity style={styles.advancedToggle} onPress={() => setAdvancedOpen(o => !o)} activeOpacity={0.7}>
        {advancedOpen ? <ChevronDown size={14} color={colors.textMuted} /> : <ChevronRight size={14} color={colors.textMuted} />}
        <Text style={styles.advancedText}>Advanced</Text>
      </TouchableOpacity>
      {advancedOpen && (
        <TimeoutField value={draft.pluginTimeoutMs} manifestMs={c.step.timeoutMs} onChange={t => set({ pluginTimeoutMs: t })} />
      )}
    </>
  );
}

function ParamLabel({ def }: { def: PluginParamDef }) {
  return (
    <View style={styles.labelRow}>
      <Text style={ms.fieldLabel}>{(def.label || def.key).toUpperCase()}</Text>
      {def.required && <Text style={styles.requiredMark}>REQUIRED</Text>}
    </View>
  );
}

// ── One param, by type ───────────────────────────────────────────────────────

function rangeHint(def: PluginParamDef): string | undefined {
  const parts: string[] = [];
  if (def.min != null) parts.push(`min ${def.min}`);
  if (def.max != null) parts.push(`max ${def.max}`);
  if (def.step != null) parts.push(`step ${def.step}`);
  return parts.length ? parts.join(" · ") : undefined;
}

function defaultPlaceholder(def: PluginParamDef, fallback: string): string {
  const d = paramDefaultText(def);
  return d !== undefined && d !== "" ? `default ${d}` : fallback;
}

function ParamField({ def, text, onChange, variables, contextVariables }: {
  def: PluginParamDef;
  text: string;
  onChange: (text: string) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  switch (def.type) {
    case "number":
      return (
        <ExpressionField
          value={text}
          onChange={onChange}
          title={def.label || def.key}
          hint={[def.help, rangeHint(def)].filter(Boolean).join(" — ") || undefined}
          placeholder={defaultPlaceholder(def, "0")}
          variables={variables}
          contextVariables={contextVariables}
          style={ms.input}
        />
      );
    case "boolean":
      return <BooleanParam def={def} text={text} onChange={onChange} variables={variables} contextVariables={contextVariables} />;
    case "string":
      return (
        <>
          <TemplateInput
            style={ms.input}
            value={text}
            onChange={onChange}
            placeholder={defaultPlaceholder(def, "Text — $var or {expr} insert values")}
            variables={[...(variables ?? []), ...(contextVariables ?? [])]}
          />
          <Text style={styles.help}>$name or {"{expression}"} is replaced with its value when the step runs.</Text>
        </>
      );
    case "enum":
      return <EnumParam def={def} text={text} onChange={onChange} />;
    case "point":
      return <PointParam text={text} onChange={onChange} variables={variables} contextVariables={contextVariables} />;
    case "list":
    case "image":
    case "variable":
      return <VariableParam def={def} kind={def.type} text={text} onChange={onChange} variables={variables} contextVariables={contextVariables} />;
    default:
      // A param type this app does not know: keep it editable as raw text.
      return (
        <TextInput style={ms.input} value={text} onChangeText={onChange} autoCapitalize="none"
          placeholder={defaultPlaceholder(def, "")} placeholderTextColor={colors.textFaint} />
      );
  }
}

/** Switch for true/false, or — behind the fx toggle — an expression (non-zero = true). */
function BooleanParam({ def, text, onChange, variables, contextVariables }: {
  def: PluginParamDef; text: string; onChange: (t: string) => void;
  variables?: ProgramVariable[]; contextVariables?: ProgramVariable[];
}) {
  const effective = text.trim() !== "" ? text : (paramDefaultText(def) ?? "");
  const literal = booleanLiteral(effective);
  const [exprMode, setExprMode] = useState(literal === null);

  return (
    <View>
      <View style={styles.boolRow}>
        {exprMode ? (
          <View style={{ flex: 1 }}>
            <ExpressionField
              value={text}
              onChange={onChange}
              title={def.label || def.key}
              hint="Non-zero is true"
              placeholder={defaultPlaceholder(def, "$ready and $count > 0")}
              variables={variables}
              contextVariables={contextVariables}
              comparisons
              style={ms.input}
            />
          </View>
        ) : (
          <>
            <Text style={styles.boolValue}>{literal ? "On" : "Off"}</Text>
            <Switch
              value={literal === true}
              onValueChange={v => onChange(v ? "true" : "false")}
              trackColor={{ false: colors.borderStrong, true: colors.accent }}
              thumbColor={colors.surface}
            />
          </>
        )}
        <TouchableOpacity
          onPress={() => {
            if (exprMode) {
              // Back to the switch: keep a literal, otherwise fall back to the default.
              const back = booleanLiteral(text);
              onChange(back === null ? (paramDefaultText(def) ?? "false") : (back ? "true" : "false"));
            }
            setExprMode(m => !m);
          }}
          style={[styles.fxToggle, exprMode && styles.fxToggleOn]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={exprMode ? "Use a switch" : "Use an expression"}
        >
          <Text style={[styles.fxText, exprMode && { color: accents.purple }]}>fx</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Segmented control up to four options, a picker beyond. No interpolation (§6). */
function EnumParam({ def, text, onChange }: { def: PluginParamDef; text: string; onChange: (t: string) => void }) {
  const options = def.options ?? [];
  const current = text.trim() !== "" ? text : (paramDefaultText(def) ?? "");
  const [open, setOpen] = useState(false);

  if (options.length > 0 && options.length <= 4) {
    return <SegmentedControl options={options} value={current} onChange={onChange} size="sm" />;
  }
  return (
    <>
      <SelectButton value={current || undefined} placeholder="Select…" onPress={() => setOpen(true)} />
      <PickList
        visible={open}
        title={def.label || def.key}
        items={options.map(o => ({ key: o, label: o }))}
        selected={current}
        onPick={k => onChange(k)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** list / image / variable: a variable picker narrowed to the kind; the bare name is stored. */
function VariableParam({ def, kind, text, onChange, variables, contextVariables }: {
  def: PluginParamDef; kind: "list" | "image" | "variable"; text: string; onChange: (t: string) => void;
  variables?: ProgramVariable[]; contextVariables?: ProgramVariable[];
}) {
  const [open, setOpen] = useState(false);
  const name = text.trim().replace(/^\$/, "");
  const fallback = paramDefaultText(def);
  const filter = useMemo(() => paramVariableFilter(kind), [kind]);
  const placeholder = kind === "list" ? "Select a list variable…" : kind === "image" ? "Select an image variable…" : "Select a variable…";
  return (
    <>
      <VarButton
        value={name || undefined}
        accent={accents.purple}
        placeholder={fallback ? `default $${fallback.replace(/^\$/, "")}` : placeholder}
        onPress={() => setOpen(true)}
      />
      <VarPickerModal
        visible={open}
        onClose={() => setOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        filter={filter}
        selected={name || undefined}
        title={def.label || def.key}
        showNone
        onSelect={v => onChange(v?.name ?? "")}
      />
    </>
  );
}

// ── Point param ──────────────────────────────────────────────────────────────

type PointMode = PointRef["mode"];

/**
 * The move target choices as text: a saved point, a grid cell, a stack slot, or an
 * expression (`$pts[$i]`, `{$prefix}{$i}`). See pluginSteps.ts for the grid/stack syntax.
 */
function PointParam({ text, onChange, variables, contextVariables }: {
  text: string; onChange: (t: string) => void;
  variables?: ProgramVariable[]; contextVariables?: ProgramVariable[];
}) {
  const points = usePoints();
  const grids  = useGrids();
  const stacks = useStacks();
  const ref = parsePointRef(text);
  const [mode, setMode] = useState<PointMode>(ref.mode);
  const [picker, setPicker] = useState<null | "point" | "grid" | "stack">(null);

  const gridRef  = ref.mode === "grid"  ? ref : null;
  const stackRef = ref.mode === "stack" ? ref : null;
  const targetVars = [...(variables ?? []), ...(contextVariables ?? [])].filter(v => !v.isImage);

  const switchMode = (m: PointMode) => {
    setMode(m);
    if (m !== ref.mode) onChange("");
  };

  return (
    <View>
      <SegmentedControl<PointMode>
        options={[
          { label: "Point", value: "point" },
          { label: "Grid", value: "grid" },
          { label: "Stack", value: "stack" },
          { label: "Variable", value: "expr" },
        ]}
        value={mode}
        onChange={switchMode}
        size="sm"
        style={{ marginBottom: spacing.sm }}
      />

      {mode === "point" && (
        <SelectButton
          value={ref.mode === "point" && ref.name ? ref.name : undefined}
          placeholder="Select a saved point…"
          onPress={() => setPicker("point")}
        />
      )}

      {mode === "grid" && (
        <>
          <SelectButton value={gridRef?.grid} placeholder="Select a grid…" onPress={() => setPicker("grid")} />
          {gridRef && (
            <>
              <SegmentedControl<"rc" | "index">
                options={[{ label: "Row & Column", value: "rc" }, { label: "Grid Index", value: "index" }]}
                value={gridRef.index !== undefined ? "index" : "rc"}
                onChange={v => onChange(formatPointRef(v === "index"
                  ? { mode: "grid", grid: gridRef.grid, index: "0" }
                  : { mode: "grid", grid: gridRef.grid, row: "0", col: "0" }))}
                size="sm"
                style={{ marginTop: spacing.sm }}
              />
              {gridRef.index !== undefined ? (
                <IndexField label="GRID INDEX" value={gridRef.index} variables={variables} contextVariables={contextVariables}
                  onChange={v => onChange(formatPointRef({ mode: "grid", grid: gridRef.grid, index: v }))} />
              ) : (
                <View style={ms.twoCol}>
                  <View style={ms.twoColItem}>
                    <IndexField label="ROW" value={gridRef.row} variables={variables} contextVariables={contextVariables}
                      onChange={v => onChange(formatPointRef({ mode: "grid", grid: gridRef.grid, row: v, col: gridRef.col }))} />
                  </View>
                  <View style={ms.twoColItem}>
                    <IndexField label="COLUMN" value={gridRef.col} variables={variables} contextVariables={contextVariables}
                      onChange={v => onChange(formatPointRef({ mode: "grid", grid: gridRef.grid, row: gridRef.row, col: v }))} />
                  </View>
                </View>
              )}
            </>
          )}
        </>
      )}

      {mode === "stack" && (
        <>
          <SelectButton value={stackRef?.stack} placeholder="Select a stack…" onPress={() => setPicker("stack")} />
          {stackRef && (
            <IndexField label="INDEX" value={stackRef.index} variables={variables} contextVariables={contextVariables}
              onChange={v => onChange(formatPointRef({ mode: "stack", stack: stackRef.stack, index: v }))} />
          )}
        </>
      )}

      {mode === "expr" && (
        <>
          <TemplateInput
            style={ms.input}
            value={ref.mode === "grid" || ref.mode === "stack" ? "" : text}
            onChange={onChange}
            placeholder="$pointsList[$index]  ·  $target  ·  {$binPrefix}{$i}"
            variables={targetVars}
            insertToken={v => isPointListVariable(v) ? `$${v.name}[0]` : `{$${v.name}}`}
          />
          <Text style={styles.help}>
            A Points variable indexed on its own gives those coordinates; anything else must resolve to a saved point&apos;s name.
          </Text>
        </>
      )}

      {/* The text actually stored — the grid/stack spelling is not obvious otherwise. */}
      {(mode === "grid" || mode === "stack") && !!text && <Text style={styles.stored}>{text}</Text>}

      <PickList
        visible={picker === "point"}
        title="Select Point"
        items={points.map(p => ({ key: p.name, label: p.name, desc: `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}` }))}
        selected={ref.mode === "point" ? ref.name : undefined}
        empty="No points saved yet."
        onPick={k => onChange(k)}
        onClose={() => setPicker(null)}
      />
      <PickList
        visible={picker === "grid"}
        title="Select Grid"
        items={grids.map(g => ({ key: g.name, label: g.name, desc: `Base: ${g.basePointName}` }))}
        selected={gridRef?.grid}
        empty="No grids defined yet."
        onPick={k => onChange(formatPointRef(gridRef
          ? { ...gridRef, grid: k } as PointRef
          : { mode: "grid", grid: k, row: "0", col: "0" }))}
        onClose={() => setPicker(null)}
      />
      <PickList
        visible={picker === "stack"}
        title="Select Stack"
        items={stacks.map(s => ({ key: s.name, label: s.name, desc: `Base: ${s.basePointName}` }))}
        selected={stackRef?.stack}
        empty="No stacks defined yet."
        onPick={k => onChange(formatPointRef({ mode: "stack", stack: k, index: stackRef?.index ?? "0" }))}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function IndexField({ label, value, onChange, variables, contextVariables }: {
  label: string; value: string; onChange: (v: string) => void;
  variables?: ProgramVariable[]; contextVariables?: ProgramVariable[];
}) {
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={ms.fieldLabel}>{label}</Text>
      <ExpressionField
        value={value}
        onChange={v => onChange(v.trim() || "0")}
        title={label.charAt(0) + label.slice(1).toLowerCase()}
        placeholder="0"
        variables={variables}
        contextVariables={contextVariables}
        style={ms.input}
      />
    </View>
  );
}

// ── Outputs ──────────────────────────────────────────────────────────────────

const OUTPUT_TYPE_LABEL: Record<PluginOutputDef["type"], string> = {
  number: "NUM", boolean: "BOOL", string: "STR", point: "POINT", list: "LIST", image: "IMG",
};

function OutputRow({ def, variableName, onChange, variables, contextVariables, onSaveVariable }: {
  def: PluginOutputDef;
  variableName: string | undefined;
  onChange: (name: string | undefined) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const fits = useMemo(() => outputVariableFilter(def.type), [def.type]);
  const filter = useMemo(() => (v: ProgramVariable) => isAssignableVariable(v) && fits(v), [fits]);

  // A mapped variable the program knows but that cannot hold this output (pluginOutputType).
  const mapped = variableName
    ? [...(variables ?? []), ...(contextVariables ?? [])].find(v => v.name === variableName)
    : undefined;
  const mismatch = mapped && !filter(mapped);

  return (
    <View style={styles.outputBlock}>
      <View style={styles.labelRow}>
        <Text style={ms.fieldLabel}>{(def.label || def.key).toUpperCase()}</Text>
        <Text style={styles.typeChip}>{OUTPUT_TYPE_LABEL[def.type] ?? def.type}</Text>
        <View style={{ flex: 1 }} />
        {onSaveVariable && (
          <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={8} activeOpacity={0.7} style={styles.newBtn}>
            <Plus size={12} color={accents.purple} />
            <Text style={styles.newBtnText}>New</Text>
          </TouchableOpacity>
        )}
      </View>
      <VarButton
        value={variableName}
        accent={mismatch ? colors.danger : accents.purple}
        placeholder="Not written — tap to select"
        onPress={() => setPickerOpen(true)}
      />
      {mismatch
        ? <Text style={ms.fieldError}>${variableName} cannot hold this output — needs a {outputKindHint(def.type).toLowerCase()}.</Text>
        : <Text style={styles.help}>{outputKindHint(def.type)}</Text>}

      <VarPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        variables={variables ?? []}
        contextVariables={contextVariables}
        filter={filter}
        selected={variableName}
        title={def.label || def.key}
        showNone
        onSelect={v => onChange(v?.name)}
      />
      {onSaveVariable && (
        <VariableEditModal
          visible={createOpen}
          variable={null}
          defaultType={outputNewVarType(def.type) as VarType}
          variables={variables}
          onSave={v => {
            onSaveVariable(v);
            onChange(v.name);
            setCreateOpen(false);
          }}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </View>
  );
}

// ── Advanced ─────────────────────────────────────────────────────────────────

function TimeoutField({ value, manifestMs, onChange }: {
  value: number | undefined; manifestMs: number | undefined; onChange: (ms: number | undefined) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : "");
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Text style={ms.fieldLabel}>TIMEOUT  (ms)</Text>
      <TextInput
        style={ms.input}
        value={text}
        onChangeText={raw => {
          const clean = raw.replace(/[^0-9]/g, "");
          setText(clean);
          onChange(clean === "" ? undefined : parseInt(clean, 10));
        }}
        keyboardType="number-pad"
        placeholder={manifestMs ? `${manifestMs} (plugin default)` : "none (plugin default)"}
        placeholderTextColor={colors.textFaint}
      />
      <Text style={styles.help}>Blank uses the plugin&apos;s own timeout. 0 waits indefinitely.</Text>
    </View>
  );
}

// ── Missing plugin / step ────────────────────────────────────────────────────

/**
 * The step names a plugin or step the controller does not list (uninstalled,
 * renamed, or not loaded yet). Nothing is dropped: params and outputs stay
 * editable as raw text so the step survives until the plugin comes back.
 */
function MissingPluginStep({ draft, status, pluginInstalled, setParam, setOutput, set }: {
  draft: ProgramStep;
  status: string;
  pluginInstalled: boolean;
  setParam: (key: string, text: string) => void;
  setOutput: (key: string, name: string | undefined) => void;
  set: SetFields;
}) {
  const [newKey, setNewKey] = useState("");
  const loading = status === "idle" || status === "loading";
  const title = loading
    ? "Loading plugin details…"
    : status === "unsupported"
      ? "This controller does not support plugins"
      : status === "error"
        ? "Couldn't load the installed plugins"
        : pluginInstalled
          ? `Plugin '${draft.pluginId}' has no step '${draft.pluginStepId}'`
          : `Plugin '${draft.pluginId ?? "?"}' is not installed`;
  const body = loading
    ? "The form appears once the controller lists its plugins."
    : "The step is kept as it is. Its parameters are shown as raw text below; install or update the plugin to get the full form back.";
  const params = draft.pluginParams ?? {};
  const outputs = draft.pluginOutputs ?? [];

  return (
    <>
      <View style={[styles.banner, loading && styles.bannerInfo]}>
        {loading ? <CircleAlert size={16} color={colors.textMuted} /> : <TriangleAlert size={16} color={colors.danger} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, loading && { color: colors.textSecondary }]}>{title}</Text>
          <Text style={styles.bannerBody}>{body}</Text>
        </View>
      </View>

      <Text style={styles.section}>PARAMETERS  (raw text)</Text>
      {Object.keys(params).length === 0 && <Text style={ms.emptyHint}>No parameters set.</Text>}
      {Object.keys(params).map(key => (
        <View key={key} style={styles.paramBlock}>
          <Text style={ms.fieldLabel}>{key}</Text>
          <TextInput style={ms.input} value={params[key]} onChangeText={t => setParam(key, t)}
            autoCapitalize="none" autoCorrect={false} />
        </View>
      ))}
      <View style={[styles.labelRow, { marginTop: spacing.sm }]}>
        <TextInput style={[ms.input, { flex: 1 }]} value={newKey} onChangeText={setNewKey}
          placeholder="Add param key…" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} />
        <TouchableOpacity
          onPress={() => { const k = newKey.trim(); if (k && params[k] === undefined) { set({ pluginParams: { ...params, [k]: "0" } }); setNewKey(""); } }}
          style={styles.newBtn} activeOpacity={0.7}>
          <Plus size={12} color={accents.purple} />
          <Text style={styles.newBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {outputs.length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: spacing.lg }]}>OUTPUTS  (raw)</Text>
          {outputs.map(o => (
            <View key={o.key} style={styles.paramBlock}>
              <Text style={ms.fieldLabel}>{o.key}  →  $</Text>
              <TextInput style={ms.input} value={o.variableName}
                onChangeText={t => setOutput(o.key, t.replace(/^\$/, "") || undefined)}
                autoCapitalize="none" autoCorrect={false} />
            </View>
          ))}
        </>
      )}
    </>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function SelectButton({ value, placeholder, onPress }: { value: string | undefined; placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.select, !!value && { borderColor: colors.accent }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[styles.selectText, !value && { color: colors.textFaint, fontWeight: "400" }]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      <ChevronDown size={14} color={value ? colors.accent : colors.textFaint} />
    </TouchableOpacity>
  );
}

/** `$name` in the accent, or the placeholder; opens a variable picker. */
function VarButton({ value, accent, placeholder, onPress }: {
  value: string | undefined; accent: string; placeholder: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.select, !!value && { borderColor: accent }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[styles.selectText, { color: value ? accent : colors.textFaint, fontWeight: value ? "700" : "400" }]} numberOfLines={1}>
        {value ? `$${value}` : placeholder}
      </Text>
      <ChevronDown size={14} color={value ? accent : colors.textFaint} />
    </TouchableOpacity>
  );
}

function PickList({ visible, title, items, selected, empty, onPick, onClose }: {
  visible: boolean;
  title: string;
  items: { key: string; label: string; desc?: string }[];
  selected: string | undefined;
  empty?: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
        {items.length === 0 && <Text style={ms.emptyHint}>{empty ?? "Nothing to choose."}</Text>}
        {items.map((it, i) => {
          const active = it.key === selected;
          return (
            <TouchableOpacity
              key={it.key}
              style={[ms.row, i < items.length - 1 && ms.rowBorder, active && ms.rowActive]}
              onPress={() => { onPick(it.key); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={[ms.radioRing, active && ms.radioRingActive]}>
                {active && <View style={ms.radioDot} />}
              </View>
              <View style={ms.rowText}>
                <Text style={[ms.rowLabel, active && ms.rowLabelActive]}>{it.label}</Text>
                {!!it.desc && <Text style={ms.rowDesc}>{it.desc}</Text>}
              </View>
              {active && <Check size={16} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "flex-start", gap: spacing.md,
    backgroundColor: colors.background, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: radii.sm, backgroundColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  headerDesc:  { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  headerWarn:  { fontSize: 12, color: colors.warning, fontWeight: "600", marginTop: 4, lineHeight: 16 },

  section: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.8, marginBottom: spacing.xs },
  paramBlock: { marginTop: spacing.sm },
  outputBlock: { marginTop: spacing.md },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  requiredMark: { fontSize: 9.5, fontWeight: "800", color: colors.warning, letterSpacing: 0.5 },
  help: { fontSize: 11.5, color: colors.textFaint, marginTop: 4, lineHeight: 15 },
  stored: { fontSize: 11.5, color: colors.textMuted, marginTop: 6, fontFamily: "monospace" },

  boolRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  boolValue: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.text },
  fxToggle: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceMuted,
  },
  fxToggleOn: { borderColor: accents.purpleBorder, backgroundColor: accents.purpleSoft },
  fxText: { fontSize: 13, fontWeight: "800", fontStyle: "italic", color: colors.textFaint },

  typeChip: {
    fontSize: 9, fontWeight: "700", color: accents.purple, letterSpacing: 0.3,
    backgroundColor: accents.purpleSoft, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, overflow: "hidden",
  },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: accents.purpleSoft, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: accents.purpleBorder,
  },
  newBtnText: { fontSize: 12, fontWeight: "600", color: accents.purple },

  advancedToggle: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingVertical: 4 },
  advancedText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },

  select: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },

  banner: {
    flexDirection: "row", gap: spacing.sm, alignItems: "flex-start",
    backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md,
  },
  bannerInfo: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  bannerTitle: { fontSize: 13.5, fontWeight: "700", color: colors.danger },
  bannerBody: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
});
