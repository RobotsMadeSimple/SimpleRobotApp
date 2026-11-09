import React, { ReactNode, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import {
  ConditionGroup,
  FieldSpec,
  ProgramStep,
  ProgramVariable,
  StepSpec,
  ValidationProblem,
} from "@/src/models/robotModels";
import { useBuiltPrograms, useLocals, usePoints, useTools } from "@/src/providers/RobotProvider";
import { accents, colors } from "@/src/components/ui/kit";
import { ms } from "./builderStyles";
import { TemplateInput } from "./NumericInputs";
import { ExpressionField } from "./expressions/ExpressionEditorModal";
import { ConditionGroupEditor } from "./ConditionEditor";
import { useStepCatalog } from "./useStepCatalog";
import {
  CatalogBoolField,
  CatalogEnumField,
  CatalogNumberField,
  CatalogTextListField,
  CatalogVarField,
  ChoiceList,
  ExprMapField,
  FieldCaption,
  FieldHelp,
  FieldProblems,
  PointRefField,
  TargetRefField,
} from "./catalogFieldControls";

// Catalog-driven step fields (docs/program-language.md §4.5 #1): the controller's step catalog
// describes every field of a step — kind, unit, default, range, whether an expression may replace
// the literal, and when it shows — and this renders them, grouped by the catalog's sections. New
// step types need no hand-written JSX; a type with a genuinely special section (a move target, a
// vision output table) passes that one key in `special` and keeps the rest generic.

/** Body kinds are edited in the step list, not in the field editor. */
const BODY_KINDS = new Set(["steps", "branches", "cases"]);

/** The field's value as `showIf` compares it: text, an absent field reading as its default. */
function showIfValue(step: ProgramStep, spec: StepSpec | undefined, key: string): string {
  const raw = (step as unknown as Record<string, unknown>)[key];
  const v = raw ?? spec?.fields.find(f => f.key === key)?.default;
  if (v == null) return "";
  return typeof v === "boolean" ? (v ? "true" : "false") : String(v);
}

/** Whether a field shows for the step's current values. */
export function isFieldShown(field: FieldSpec, step: ProgramStep, spec: StepSpec | undefined): boolean {
  if (!field.showIf) return true;
  return field.showIf.in.includes(showIfValue(step, spec, field.showIf.field));
}

/** The keys (and stored props) a problem's `field` may name for this catalog field. */
export function fieldClaims(f: FieldSpec): string[] {
  return [f.key, ...(f.props ?? []), ...(f.exprKey ? [f.exprKey] : []), ...(f.exprKeys ?? [])];
}

export type CatalogStepFieldsProps = {
  step: ProgramStep;
  set: (patch: Partial<ProgramStep>) => void;
  setExpr: (key: string, expr: string | undefined) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  onSaveVariable?: (v: ProgramVariable) => void;
  /** This step's own validation problems; each shows under the field it names. */
  problems?: ValidationProblem[];
  /** Render only these keys (in catalog order). */
  only?: string[];
  /** Keys rendered elsewhere. */
  skip?: string[];
  /** Custom renderers for keys the generic controls cannot express. */
  special?: Record<string, () => ReactNode>;
  /** Group captions (default on when the shown fields span several groups). */
  grouped?: boolean;
};

/**
 * Renders a step's catalog fields. Without a catalog (an older controller) it renders nothing
 * and returns false from `hasCatalogFields`, so callers keep their built-in editor.
 */
export function CatalogStepFields(props: CatalogStepFieldsProps) {
  const { step, only, skip, grouped } = props;
  const catalog = useStepCatalog();
  const spec = catalog.spec(step.type);
  if (!spec) return null;
  const fields = spec.fields.filter(f =>
    !f.hidden && !BODY_KINDS.has(f.kind)
    && (!only || only.includes(f.key)) && !skip?.includes(f.key)
    && isFieldShown(f, step, spec));
  if (fields.length === 0) return null;

  const groups: { name: string; fields: FieldSpec[] }[] = [];
  for (const f of fields) {
    const g = groups.find(x => x.name === f.group);
    if (g) g.fields.push(f); else groups.push({ name: f.group, fields: [f] });
  }
  const showCaptions = grouped ?? groups.length > 1;
  return (
    <View>
      {groups.map((g, gi) => (
        <View key={g.name} style={gi > 0 ? { marginTop: 18 } : undefined}>
          {showCaptions && (
            <Text style={[ms.fieldLabel, { color: accents.purple, marginBottom: 2 }]}>{g.name.toUpperCase()}</Text>
          )}
          {g.fields.map((f, fi) => (
            <CatalogField key={f.key} field={f} first={fi === 0 && !showCaptions}
              // A field named like its group (Input in Input) needs no second caption.
              noCaption={showCaptions && f.label.toLowerCase() === g.name.toLowerCase()} {...props} />
          ))}
        </View>
      ))}
    </View>
  );
}

function CatalogField({ field: f, first, noCaption, step, set, setExpr, variables, contextVariables, onSaveVariable, problems, special }:
  CatalogStepFieldsProps & { field: FieldSpec; first: boolean; noCaption?: boolean }) {
  const raw = step as unknown as Record<string, unknown>;
  const claims = fieldClaims(f);
  const mine = problems?.filter(p => p.field && claims.includes(p.field));
  const setKey = (v: unknown) => set({ [f.key]: v } as Partial<ProgramStep>);

  const custom = special?.[f.key];
  if (custom) return <>{custom()}<FieldProblems problems={mine} /></>;

  if (f.kind === "bool") {
    return (
      <>
        <CatalogBoolField field={f} value={raw[f.key]} onChange={setKey} />
        <FieldHelp text={f.help} />
        <FieldProblems problems={mine} />
      </>
    );
  }

  const control = renderControl();
  if (control === null) return null;
  return (
    <View>
      {noCaption ? <View style={{ height: 4 }} /> : <FieldCaption field={f} first={first} />}
      {control}
      <FieldHelp text={f.help} />
      <FieldProblems problems={mine} />
    </View>
  );

  function renderControl(): ReactNode | null {
    switch (f.kind) {
      case "number":
      case "integer":
        if (f.options?.length) return <CatalogEnumField field={f} value={raw[f.key]} onChange={v => setKey(Number(v))} />;
        return <CatalogNumberField field={f} step={step} set={set} setExpr={setExpr} variables={variables} contextVariables={contextVariables} />;
      case "enum":
        return <CatalogEnumField field={f} value={raw[f.key]} onChange={setKey} />;
      case "text":
        return (
          <TextInput
            style={[ms.input, f.key === "comment" && { minHeight: 64, textAlignVertical: "top" }]}
            value={typeof raw[f.key] === "string" ? (raw[f.key] as string) : ""}
            onChangeText={t => setKey(t === "" && f.key !== "comment" ? undefined : t)}
            placeholder={f.default != null ? String(f.default) : f.label}
            placeholderTextColor={colors.textFaint}
            autoCapitalize={f.key === "comment" ? "sentences" : "none"}
            multiline={f.key === "comment"}
            aria-label={f.label}
          />
        );
      case "template":
        return (
          <TemplateInput
            style={ms.input}
            value={typeof raw[f.key] === "string" ? (raw[f.key] as string) : ""}
            onChange={t => setKey(t || undefined)}
            placeholder={f.label}
            variables={variables}
            autoCapitalize="sentences"
            create={{ type: "string" }}
            onCreateVariable={onSaveVariable}
            allVariables={variables}
          />
        );
      case "expr":
        return (
          <ExpressionField
            value={typeof raw[f.key] === "string" ? (raw[f.key] as string) : ""}
            onChange={t => setKey(t.trim() ? t : (f.required ? "" : undefined))}
            title={f.label}
            placeholder="expression"
            variables={variables}
            contextVariables={contextVariables}
            style={ms.input}
          />
        );
      case "condition":
        return (
          <ConditionGroupEditor
            group={(raw[f.key] as ConditionGroup | undefined) ?? { combinator: "ALL", items: [] }}
            onChange={g => setKey(g)}
            variables={variables}
            contextVariables={contextVariables}
          />
        );
      case "varWrite":
      case "varRead":
      case "listVar":
        return (
          <CatalogVarField field={f} value={raw[f.key] as string | undefined} onChange={setKey}
            variables={variables} onSaveVariable={onSaveVariable} write={f.kind !== "varRead"} />
        );
      case "textList":
        return <ErrorAwareTextList field={f} value={raw[f.key] as string[] | undefined} onChange={setKey} />;
      case "exprMap":
        return (
          <ExprMapField label={f.label} value={raw[f.key] as Record<string, string> | undefined} onChange={setKey}
            variables={variables} contextVariables={contextVariables} />
        );
      case "pointRef":
        return <PointRefFieldFor field={f} step={step} set={set} />;
      case "target":
        return <TargetFieldFor field={f} step={step} set={set} variables={variables} onSaveVariable={onSaveVariable} />;
      case "toolRef":
      case "localRef":
      case "routineRef":
      case "programRef":
        return <RepoRefField field={f} step={step} set={set} />;
      default:
        // json, rows, mappingOut, axes6, vision/device/camera/label/plugin references: the step's
        // own editor section covers these.
        return null;
    }
  }
}

/** A textList; the catch-codes list labels its chips from the catalog's error codes. */
function ErrorAwareTextList({ field, value, onChange }: { field: FieldSpec; value: string[] | undefined; onChange: (v: string[] | undefined) => void }) {
  const catalog = useStepCatalog();
  const labels = Object.fromEntries((catalog.catalog?.errorCodes ?? []).map(c => [c.code, c.label]));
  return <CatalogTextListField field={field} value={value} onChange={onChange} optionLabels={labels} />;
}

function PointRefFieldFor({ field, step, set }: { field: FieldSpec; step: ProgramStep; set: (p: Partial<ProgramStep>) => void }) {
  const points = usePoints();
  const [idKey, nameKey] = field.props ?? ["pointId", "pointName"];
  const raw = step as unknown as Record<string, string | undefined>;
  return (
    <PointRefField label={field.label} pointId={raw[idKey]} pointName={raw[nameKey]} points={points}
      onChange={p => set({ [idKey]: p?.id || undefined, [nameKey]: p?.name } as Partial<ProgramStep>)} />
  );
}

function TargetFieldFor({ field, step, set, variables, onSaveVariable }: {
  field: FieldSpec; step: ProgramStep; set: (p: Partial<ProgramStep>) => void;
  variables?: ProgramVariable[]; onSaveVariable?: (v: ProgramVariable) => void;
}) {
  const points = usePoints();
  // target → pointId pointName pointNameExpr (…grid/stack); via → viaPointId viaPointName viaPointNameExpr.
  const [idKey, nameKey, exprKey] = field.props ?? ["pointId", "pointName", "pointNameExpr"];
  const raw = step as unknown as Record<string, string | undefined>;
  return (
    <TargetRefField label={field.label} pointId={raw[idKey]} pointName={raw[nameKey]} expr={raw[exprKey]}
      points={points} variables={variables} onSaveVariable={onSaveVariable}
      onPoint={p => set({ [idKey]: p?.id || undefined, [nameKey]: p?.name, [exprKey]: undefined } as Partial<ProgramStep>)}
      onExpr={e => set({ [exprKey]: e, ...(e ? { [idKey]: undefined, [nameKey]: undefined } : {}) } as Partial<ProgramStep>)} />
  );
}

/** Tool / local / routine / program pickers — linked by id, the name kept as a fallback. */
function RepoRefField({ field, step, set }: { field: FieldSpec; step: ProgramStep; set: (p: Partial<ProgramStep>) => void }) {
  const tools = useTools();
  const locals = useLocals();
  const programs = useBuiltPrograms();
  const [open, setOpen] = useState(false);
  const [idKey, nameKey] = field.props ?? [field.key, field.key.replace(/Id$/, "Name")];
  const raw = step as unknown as Record<string, string | undefined>;
  const rows = (field.kind === "toolRef" ? tools
    : field.kind === "localRef" ? locals
    : field.kind === "routineRef" ? programs.filter(p => p.isRoutine)
    : programs.filter(p => p.isBackground))
    .map(x => ({ id: x.id || x.name, title: x.name, subtitle: x.description || undefined }));
  const current = raw[idKey] ?? (raw[nameKey] ? rows.find(r => r.title === raw[nameKey])?.id : undefined);
  const shown = rows.find(r => r.id === current)?.title ?? raw[nameKey];
  return (
    <>
      <TouchableOpacity style={[ms.input, { flexDirection: "row", alignItems: "center", gap: 8 }]} onPress={() => setOpen(true)}
        activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={field.label}>
        <Text style={{ flex: 1, fontSize: 14, color: shown ? colors.text : colors.textFaint }} numberOfLines={1}>{shown ?? "None"}</Text>
        <ChevronDown size={14} color={colors.textFaint} />
      </TouchableOpacity>
      <ChoiceList visible={open} title={field.label} onClose={() => setOpen(false)} noneLabel="None"
        rows={rows} selected={current ?? null}
        onSelect={id => {
          const r = rows.find(x => x.id === id);
          set({ [idKey]: r ? (r.id === r.title ? undefined : r.id) : undefined, [nameKey]: r?.title } as Partial<ProgramStep>);
        }} />
    </>
  );
}
