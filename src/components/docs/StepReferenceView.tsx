// One instruction's reference page: syntax, parameters, description, notes, errors, an example
// (as text and as blocks) and related steps. Used by the manual-step route and the step
// editor's help panel.

import { BookOpen, ChevronRight, Radio } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Chip, Divider, SectionHeader, StatusPill, accents, colors, radii, spacing, type } from "@/src/components/ui/kit";
import { DocTarget, categoryLabel, chapterLabel, chapterMeta, findRefEntry, resolveHref, screenFor } from "@/src/docs/manual";
import { parseMarkdown } from "@/src/docs/markdown";
import type { RefEntry, RefParam } from "@/src/docs/types";
import { DocFigure } from "./DocFigure";
import { MarkdownView } from "./MarkdownView";
import { SrsCode } from "./SrsCode";

function Md({ text, onLink }: { text: string; onLink: (h: string) => void }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <MarkdownView blocks={blocks} onLink={onLink} compact />;
}

function shownWhen(p: RefParam, all: RefParam[]): string | null {
  if (!p.showIf) return null;
  const other = all.find(x => x.key === p.showIf!.field);
  const labels = p.showIf.in.map(v => other?.options?.find(o => o.value === v)?.label ?? v);
  return `Only when ${other?.label ?? p.showIf.field} is set to ${labels.map(l => `“${l}”`).join(" or ")}.`;
}

function typeText(p: RefParam): string {
  return [p.type, p.unit].filter(Boolean).join(" · ") || "—";
}

function ParamExtras({ p, all }: { p: RefParam; all: RefParam[] }) {
  const when = shownWhen(p, all);
  const u = p.unit ? ` ${p.unit}` : "";
  const range = p.min != null && p.max != null ? `From ${p.min} to ${p.max}${u}.`
    : p.min != null ? `At least ${p.min}${u}.`
    : p.max != null ? `At most ${p.max}${u}.` : null;
  return (
    <>
      {!!p.value && <Text style={styles.extra}>Text: <Text style={styles.extraMono}>{p.value}</Text>{p.expression ? " — or an expression" : ""}</Text>}
      {!!p.options?.length && (
        <Text style={styles.extra}>
          Options: {p.options.map((o, i) => (
            <Text key={o.value}>{i > 0 ? ", " : ""}<Text style={styles.extraMono}>{o.value}</Text>{o.label && o.label !== o.value ? ` (${o.label})` : ""}</Text>
          ))}
        </Text>
      )}
      {!!range && <Text style={styles.extra}>{range}</Text>}
      {!!when && <Text style={styles.extra}>{when}</Text>}
    </>
  );
}

function ParamsTable({ params, onLink }: { params: RefParam[]; onLink: (h: string) => void }) {
  const [w, setW] = useState(0);
  const grid = w >= 640;
  return (
    <Card padded={false} style={styles.tableCard}>
      <View onLayout={e => setW(e.nativeEvent.layout.width)}>
        {grid && (
          <View style={[styles.pRow, styles.pHead]}>
            <Text style={[styles.pHeadText, styles.cName]}>Parameter</Text>
            <Text style={[styles.pHeadText, styles.cType]}>Type</Text>
            <Text style={[styles.pHeadText, styles.cDefault]}>Default</Text>
            <Text style={[styles.pHeadText, styles.cDesc]}>Description</Text>
          </View>
        )}
        {params.map((p, i) => (
          <View key={p.key}>
            {i > 0 && <Divider />}
            {grid ? (
              <View style={styles.pRow}>
                <View style={styles.cName}>
                  <Text style={styles.pLabel}>{p.label}</Text>
                  {!!p.inText && <Text style={styles.pInText}>{p.inText}</Text>}
                </View>
                <Text style={[styles.cell, styles.cType]}>{typeText(p)}</Text>
                <View style={styles.cDefault}>
                  {p.required ? <Text style={styles.required}>required</Text>
                    : <Text style={[styles.cell, styles.extraMono]}>{p.default ?? "—"}</Text>}
                </View>
                <View style={styles.cDesc}>
                  {p.help ? <Md text={p.help} onLink={onLink} /> : null}
                  <ParamExtras p={p} all={params} />
                </View>
              </View>
            ) : (
              <View style={styles.pStack}>
                <View style={styles.pStackHead}>
                  <Text style={styles.pLabel}>{p.label}</Text>
                  {!!p.inText && <Text style={styles.pInText}>{p.inText}</Text>}
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaType}>{typeText(p)}</Text>
                  {p.required
                    ? <Text style={styles.required}>required</Text>
                    : p.default != null ? <Text style={styles.metaDefault}>default <Text style={styles.extraMono}>{p.default}</Text></Text> : null}
                </View>
                {!!p.help && <Md text={p.help} onLink={onLink} />}
                <ParamExtras p={p} all={params} />
              </View>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

export function StepReferenceView({ entry, live, onNavigate, liveCategories, compact, showTitle = true }: {
  entry: RefEntry;
  live: boolean;
  onNavigate: (t: DocTarget) => void;
  liveCategories?: { key: string; label: string }[];
  /** Embedded in the step editor (smaller title). */
  compact?: boolean;
  /** The keyword + block name heading (off when the page header already shows them). */
  showTitle?: boolean;
}) {
  const onLink = (href: string) => {
    const t = resolveHref(href);
    if (t) onNavigate(t);
  };
  const syntax = entry.syntax.join("\n");
  const concept = entry.chapter ? chapterMeta(entry.chapter) : undefined;
  const shot = entry.exampleScreen && screenFor(entry.exampleScreen) ? entry.exampleScreen : undefined;
  const notes = useMemo(() => entry.notes.map(n => `- ${n.replace(/\n/g, "\n  ")}`).join("\n"), [entry.notes]);

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        {showTitle && (
          <View style={styles.headTop}>
            <Text style={[styles.keyword, compact && { fontSize: 20 }]} selectable>{entry.keyword}</Text>
            <Text style={styles.block}>{entry.name}</Text>
          </View>
        )}
        {(entry.aliases.length > 0 || entry.background === false) && (
          <Text style={styles.block}>
            {[entry.aliases.length ? `Also written ${entry.aliases.join(", ")}` : "", entry.background === false ? "Skipped in background programs" : ""]
              .filter(Boolean).join("  ·  ")}
          </Text>
        )}
        <View style={styles.sourceRow}>
          <StatusPill label={entry.categoryLabel ?? categoryLabel(entry.category, liveCategories)} tone="accent" />
          {live
            ? <StatusPill label="Matches the connected robot" tone="success" icon={<Radio size={11} color={colors.success} />} />
            : <StatusPill label="Bundled reference" tone="neutral" icon={<BookOpen size={11} color={colors.textMuted} />} />}
        </View>
      </View>

      {!!entry.description && <Md text={entry.description} onLink={onLink} />}

      {!!syntax && (
        <View style={styles.section}>
          <SectionHeader title="Syntax" />
          <SrsCode code={syntax} inline notation />
        </View>
      )}

      {entry.params.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Parameters" />
          <ParamsTable params={entry.params} onLink={onLink} />
        </View>
      )}

      {entry.notes.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Notes" />
          <Md text={notes} onLink={onLink} />
        </View>
      )}

      {entry.errors.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Errors" />
          <Card padded={false}>
            {entry.errors.map((e, i) => (
              <View key={`${e.code}-${i}`}>
                {i > 0 && <Divider />}
                <View style={styles.errRow}>
                  <View style={styles.errHead}>
                    {!!e.code && <Text style={styles.errCode}>{e.code}</Text>}
                    {!!e.label && <Text style={styles.errLabel}>{e.label}</Text>}
                    {e.catchable != null && (
                      <StatusPill label={e.catchable ? "Catchable" : "Stops the program"} tone={e.catchable ? "warning" : "danger"} />
                    )}
                  </View>
                  {!!e.when && <Md text={e.when} onLink={onLink} />}
                </View>
              </View>
            ))}
          </Card>
        </View>
      )}

      {!!entry.example && (
        <View style={styles.section}>
          <SectionHeader title="Example" />
          <SrsCode code={entry.example} />
          {shot && <DocFigure src={shot} alt={`${entry.keyword} example as blocks`} title="The example in the Blocks editor" maxWidth={560} />}
        </View>
      )}

      {(entry.seeAlso.length > 0 || concept) && (
        <View style={styles.section}>
          <SectionHeader title="See also" />
          {entry.seeAlso.length > 0 && (
            <View style={styles.chips}>
              {entry.seeAlso.map(s => {
                const target = findRefEntry(s);
                return (
                  <Chip key={s} label={target?.keyword ?? s} selected={false}
                    tint={[accents.purple, accents.purpleSoft]}
                    onPress={() => onNavigate({ kind: "step", key: target?.type ?? s })} />
                );
              })}
            </View>
          )}
          {concept && (
            <Pressable onPress={() => onNavigate({ kind: "chapter", id: concept.id })} accessibilityRole="link"
              style={({ pressed }) => [styles.chapterLink, pressed && { opacity: 0.7 }]}>
              <BookOpen size={16} color={colors.accent} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.caption}>{chapterLabel(concept)}</Text>
                <Text style={styles.chapterLinkText} numberOfLines={1}>{concept.title}</Text>
              </View>
              <ChevronRight size={16} color={colors.textFaint} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  head: { gap: spacing.xs },
  headTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" },
  keyword: { ...type.mono, fontSize: 24, fontWeight: "700", color: colors.text },
  block: { fontSize: 14, color: colors.textMuted },
  sourceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  section: { gap: spacing.sm },
  tableCard: { overflow: "hidden" },
  pRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, alignItems: "flex-start" },
  pHead: { backgroundColor: colors.background },
  pHeadText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.4, textTransform: "uppercase" },
  cName: { width: 150, gap: 2 },
  cType: { width: 120 },
  cDefault: { width: 100 },
  cDesc: { flex: 1, minWidth: 0, gap: spacing.xs },
  cell: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  pLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  pInText: { ...type.mono, fontSize: 12, color: accents.purple },
  pStack: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.xs + 2 },
  pStackHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, flexWrap: "wrap" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  metaType: {
    fontSize: 11, fontWeight: "600", color: accents.cyan, backgroundColor: accents.cyanSoft,
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.sm, overflow: "hidden",
  },
  required: { fontSize: 11, fontWeight: "700", color: colors.warning },
  metaDefault: { fontSize: 12, color: colors.textMuted },
  extra: { fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  extraMono: { ...type.mono, fontSize: 12 },
  errRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, gap: spacing.xs },
  errHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  errCode: { ...type.mono, fontWeight: "700", color: colors.danger },
  errLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chapterLink: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  chapterLinkText: { fontSize: 14, fontWeight: "600", color: colors.accent },
});
