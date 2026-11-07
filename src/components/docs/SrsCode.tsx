// A read-only code block: SRS source coloured with the editor's tokenizer (srsTokens.ts) as
// React Native Text spans, matching the code editor's palette (editorCore.ts srsHighlight).
// Other languages render as plain monospace. Long lines scroll sideways, never wrap.

import { memo, useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextStyle, View } from "react-native";

import { useStepCatalog } from "@/src/components/ui/builder/useStepCatalog";
import { SrsTokenType, srsKeywords, srsStartState, srsTokenizeLine } from "@/src/components/ui/code-editor/srsTokens";
import { accents, colors, radii, spacing } from "@/src/components/ui/kit";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Roboto Mono', monospace" });

// Same colours as the editor (editorCore.ts) so a snippet reads like it does in the editor.
const TOKEN_STYLE: Partial<Record<SrsTokenType, TextStyle>> = {
  keyword:  { color: colors.accent, fontWeight: "600" },
  flow:     { color: "#9333ea", fontWeight: "600" },
  decl:     { color: "#0f766e", fontWeight: "600" },
  variable: { color: accents.purple },
  string:   { color: accents.orange },
  template: { color: accents.purple, fontWeight: "600" },
  escape:   { color: "#c2410c" },
  number:   { color: "#0369a1" },
  unit:     { color: "#0369a1", fontStyle: "italic" },
  bool:     { color: "#0369a1", fontWeight: "600" },
  comment:  { color: colors.textFaint, fontStyle: "italic" },
  section:  { color: colors.text, fontWeight: "700" },
  pragma:   { color: colors.textFaint },
  json:     { color: colors.textFaint },
  attr:     { color: accents.cyan },
  argName:  { color: "#475569" },
  name:     { color: "#065f46" },
  operator: { color: "#64748b" },
  punct:    { color: "#64748b" },
  error:    { color: colors.danger, textDecorationLine: "underline" },
};

const SRS_LANGS = new Set(["srs", "simplerobot"]);

type SpanType = SrsTokenType | "placeholder";
type Span = { text: string; type?: SpanType };

const NOTATION_STYLE: TextStyle = { color: colors.textMuted, fontStyle: "italic" };

/**
 * Colour each line. In `notation` (syntax lines like `MoveL <target>[, speed=…]`) the
 * <placeholders> and the … notation are drawn muted instead of as errors.
 */
function highlight(code: string, kw: ReturnType<typeof srsKeywords>, notation: boolean): Span[][] {
  const st = srsStartState();
  return code.split("\n").map(line => {
    const kinds: (SpanType | undefined)[] = new Array(line.length).fill(undefined);
    for (const t of srsTokenizeLine(line, st, kw)) for (let i = t.from; i < t.to; i++) kinds[i] = t.type;
    if (notation) {
      for (const m of line.matchAll(/<[^<>\s][^<>]*>|…/g)) for (let i = m.index; i < m.index + m[0].length; i++) kinds[i] = "placeholder";
      for (let i = 0; i < line.length; i++) if (kinds[i] === "error") kinds[i] = "placeholder";
    }
    const spans: Span[] = [];
    for (let i = 0; i < line.length;) {
      let j = i + 1;
      while (j < line.length && kinds[j] === kinds[i]) j++;
      spans.push({ text: line.slice(i, j), type: kinds[i] });
      i = j;
    }
    return spans;
  });
}

export const SrsCode = memo(function SrsCode({ code, lang = "srs", inline, notation }: {
  code: string;
  lang?: string;
  /** Tighter padding, for syntax lines inside cards. */
  inline?: boolean;
  /** Syntax notation: placeholders muted, long lines wrap instead of scrolling sideways. */
  notation?: boolean;
}) {
  const catalog = useStepCatalog();
  const kw = useMemo(() => srsKeywords(catalog.catalog
    ? catalog.catalog.steps.flatMap(s => [s.keyword, ...(s.aliases ?? [])])
    : undefined), [catalog.catalog]);
  const isSrs = SRS_LANGS.has(lang.toLowerCase());
  const lines = useMemo<Span[][]>(
    () => (isSrs ? highlight(code.replace(/\s+$/, ""), kw, !!notation) : code.replace(/\s+$/, "").split("\n").map(l => [{ text: l }])),
    [code, kw, isSrs, notation],
  );

  const text = (
    <Text selectable style={styles.code} accessibilityLabel={code}>
      {lines.map((spans, i) => (
        <Text key={i}>
          {spans.map((s, k) => (
            <Text key={k} style={s.type === "placeholder" ? NOTATION_STYLE : s.type ? TOKEN_STYLE[s.type] : undefined}>{s.text}</Text>
          ))}
          {i < lines.length - 1 ? "\n" : ""}
        </Text>
      ))}
    </Text>
  );
  return (
    <View style={[styles.wrap, inline && styles.wrapInline]}>
      {notation
        ? <View style={[styles.content, inline && styles.contentInline]}>{text}</View>
        : (
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.content, inline && styles.contentInline]}>
            {text}
          </ScrollView>
        )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapInline: { borderRadius: radii.sm },
  content: { paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2 },
  contentInline: { paddingVertical: spacing.sm },
  code: { fontFamily: mono, fontSize: 13, lineHeight: 20, color: colors.text },
});
