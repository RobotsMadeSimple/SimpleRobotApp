// Instruction reference entries, preferring the connected controller's live step catalog
// (GetStepCatalog) for the block name, syntax, parameters and defaults so the docs match the
// robot's firmware; the bundled reference (src/docs/content/reference.ts) fills in the prose
// (notes, errors, examples) and is the whole source offline.

import { useMemo } from "react";

import { useStepCatalog } from "@/src/components/ui/builder/useStepCatalog";
import type { FieldSpec, StepCatalog, StepSpec } from "@/src/models/robotModels";
import { useConnected } from "@/src/providers/RobotProvider";
import { findRefEntry, reference, splitSyntax } from "./manual";
import type { RefEntry, RefParam } from "./types";

const lc = (s: string | undefined) => (s ?? "").toLowerCase();

/** Field kinds the editor shows as nested steps, not parameters. */
const BODY_KINDS = new Set(["steps", "branches", "cases", "json"]);

function defaultText(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "boolean") return v ? "on" : "off";
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : JSON.stringify(v);
}

function liveParam(f: FieldSpec, b: RefParam | undefined): RefParam {
  return {
    key: f.key,
    label: f.label || b?.label || f.key,
    inText: b?.inText ?? (f.arg ? `${f.arg}=` : f.position != null ? `position ${f.position + 1}` : ""),
    type: b?.type ?? String(f.kind),
    kind: String(f.kind),
    value: b?.value,
    unit: f.unit || b?.unit,
    default: defaultText(f.default) ?? b?.default,
    min: f.min ?? b?.min,
    max: f.max ?? b?.max,
    required: f.required || undefined,
    expression: f.exprKey != null || b?.expression,
    options: f.options?.length ? f.options.map(o => ({ value: String(o.value), label: o.label })) : b?.options,
    showIf: f.showIf ?? b?.showIf,
    help: f.help || b?.help || "",
    group: f.group || b?.group,
  };
}

/** Merge a catalog step over the bundled entry (either may be missing, not both). */
export function mergeEntry(bundled: RefEntry | undefined, spec: StepSpec | undefined): RefEntry | undefined {
  if (!spec) return bundled;
  const byKey = new Map((bundled?.params ?? []).map(p => [p.key, p]));
  return {
    type: spec.type,
    keyword: spec.keyword || bundled?.keyword || spec.type,
    aliases: spec.aliases?.length ? spec.aliases : bundled?.aliases ?? [],
    name: spec.label || bundled?.name || spec.type,
    category: spec.category || bundled?.category || "other",
    categoryLabel: bundled?.categoryLabel,
    syntax: spec.syntax ? spec.syntax.split("\n").flatMap(splitSyntax) : bundled?.syntax ?? [],
    description: spec.description || bundled?.description || "",
    params: spec.fields.filter(f => !f.hidden && !BODY_KINDS.has(String(f.kind))).map(f => liveParam(f, byKey.get(f.key))),
    notes: bundled?.notes ?? [],
    errors: bundled?.errors ?? [],
    example: bundled?.example ?? "",
    exampleScreen: bundled?.exampleScreen,
    seeAlso: bundled?.seeAlso ?? [],
    background: spec.background,
    chapter: bundled?.chapter,
  };
}

function specFor(catalog: StepCatalog | null, key: string): StepSpec | undefined {
  if (!catalog) return undefined;
  const k = lc(key);
  return catalog.steps.find(s => lc(s.type) === k)
    ?? catalog.steps.find(s => lc(s.keyword) === k)
    ?? catalog.steps.find(s => s.aliases?.some(a => lc(a) === k));
}

export type StepReference = {
  entry: RefEntry | undefined;
  /** Parameters and syntax come from the connected controller. */
  live: boolean;
};

/** One instruction's reference, by step type, keyword or alias. */
export function useStepReference(key: string | undefined): StepReference {
  const connected = useConnected();
  const catalog = useStepCatalog(connected);
  return useMemo(() => {
    if (!key) return { entry: undefined, live: false };
    const bundled = findRefEntry(key);
    const spec = specFor(catalog.catalog, bundled?.type ?? key);
    return { entry: mergeEntry(bundled, spec), live: !!spec };
  }, [key, catalog.catalog]);
}

/**
 * Every instruction: the bundled entries (live-merged when connected) plus catalog-only steps,
 * e.g. steps a newer controller has that this bundle does not.
 */
export function useReferenceList(): { entries: RefEntry[]; live: boolean; categories?: { key: string; label: string }[] } {
  const connected = useConnected();
  const catalog = useStepCatalog(connected);
  return useMemo(() => {
    const cat = catalog.catalog;
    const entries = reference.map(e => mergeEntry(e, specFor(cat, e.type)) ?? e);
    if (cat) {
      const known = new Set(entries.map(e => e.type));
      for (const s of cat.steps) if (!known.has(s.type)) entries.push(mergeEntry(undefined, s)!);
    }
    return { entries, live: !!cat, categories: cat?.categories };
  }, [catalog.catalog]);
}
