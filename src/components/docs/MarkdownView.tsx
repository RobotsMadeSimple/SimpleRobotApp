// Native renderer for the manual's Markdown subset (parser: src/docs/markdown.ts). Headings,
// paragraphs, lists, tables (sideways-scrolling on phones), inline code, SRS code blocks,
// callouts, figures (SVG / screenshots) and links that navigate inside the manual.

import { AlertTriangle, Info, Lightbulb, OctagonAlert, Star } from "lucide-react-native";
import { Fragment, ReactNode, memo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextStyle, View } from "react-native";

import { accents, colors, radii, spacing } from "@/src/components/ui/kit";
import { Block, CalloutKind, Inline, ListItem, inlineText } from "@/src/docs/markdown";
import { DocFigure } from "./DocFigure";
import { SrsCode } from "./SrsCode";

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" });

export type MarkdownViewProps = {
  blocks: Block[];
  onLink: (href: string) => void;
  /** Top-level heading positions (y within this view), for jump links. */
  onHeadingLayout?: (id: string, y: number) => void;
  /** Leave out a leading `# Title` (the page header already shows it). */
  skipTitle?: boolean;
  /** Smaller body text (embedded panels). */
  compact?: boolean;
};

// ── Inlines ──────────────────────────────────────────────────────────────────

function renderInlines(nodes: Inline[], onLink: (href: string) => void, keyBase = "", inLink = false): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyBase}${i}`;
    switch (n.t) {
      case "text": return <Fragment key={key}>{n.text}</Fragment>;
      case "br": return <Fragment key={key}>{"\n"}</Fragment>;
      case "code": return <Text key={key} style={[styles.inlineCode, inLink && styles.inlineCodeLink]}>{n.text}</Text>;
      case "strong": return <Text key={key} style={styles.strong}>{renderInlines(n.children, onLink, key + ".", inLink)}</Text>;
      case "em": return <Text key={key} style={styles.em}>{renderInlines(n.children, onLink, key + ".", inLink)}</Text>;
      case "del": return <Text key={key} style={styles.del}>{renderInlines(n.children, onLink, key + ".", inLink)}</Text>;
      case "image": return <Text key={key} style={styles.em}>{n.alt}</Text>;
      case "link":
        return (
          <Text key={key} style={styles.link} onPress={() => onLink(n.href)} accessibilityRole="link" suppressHighlighting={false}>
            {renderInlines(n.children, onLink, key + ".", true)}
          </Text>
        );
    }
  });
}

// ── Tables ───────────────────────────────────────────────────────────────────

/** Rough column widths from the longest cell, so phones scroll sideways instead of squashing. */
function columnWidths(b: Extract<Block, { t: "table" }>, available: number): number[] {
  const natural = b.head.map((h, c) => {
    const lens = [h, ...b.rows.map(r => r[c] ?? [])].map(cell => {
      const txt = inlineText(cell);
      const codeish = cell.some(x => x.t === "code");
      return txt.length * (codeish ? 7.8 : 7.2);
    });
    return Math.min(300, Math.max(72, Math.max(...lens) + 26));
  });
  const sum = (ws: number[]) => ws.reduce((a, b) => a + b, 0);
  const total = sum(natural);
  if (available <= 0) return natural;
  if (total <= available) return natural.map(w => Math.floor((w / total) * available));
  // Too wide: squeeze the wide columns (text wraps) as long as every column keeps ~140 px;
  // only when even that does not fit (phones) does the table scroll sideways.
  const floor = natural.map(w => Math.min(w, 140));
  const room = available - sum(floor);
  const excess = total - sum(floor);
  if (room >= 0 && excess > 0) return natural.map((w, i) => Math.floor(floor[i] + ((w - floor[i]) * room) / excess));
  return natural;
}

function DocTable({ b, onLink }: { b: Extract<Block, { t: "table" }>; onLink: (href: string) => void }) {
  const [avail, setAvail] = useState(0);
  const widths = columnWidths(b, avail - 2);
  const align = (c: number): TextStyle => ({ textAlign: b.align[c] ?? "left" });
  const overflows = avail > 0 && widths.reduce((a, w) => a + w, 0) > avail - 2;
  return (
    <View style={{ gap: spacing.xs }}>
    <View style={styles.tableWrap} onLayout={e => setAvail(Math.floor(e.nativeEvent.layout.width))}>
      <ScrollView horizontal showsHorizontalScrollIndicator bounces={false}>
        <View>
          <View style={[styles.tr, styles.thRow]}>
            {b.head.map((cell, c) => (
              <View key={c} style={[styles.td, { width: widths[c] }]}>
                <Text style={[styles.th, align(c)]}>{renderInlines(cell, onLink)}</Text>
              </View>
            ))}
          </View>
          {b.rows.map((row, r) => (
            <View key={r} style={[styles.tr, r % 2 === 1 && styles.trAlt, r === b.rows.length - 1 && styles.trLast]}>
              {row.map((cell, c) => (
                <View key={c} style={[styles.td, { width: widths[c] }]}>
                  <Text style={[styles.tdText, align(c)]}>{renderInlines(cell, onLink)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
    {overflows && <Text style={styles.tableHint}>Swipe the table sideways for more columns</Text>}
    </View>
  );
}

// ── Callouts ─────────────────────────────────────────────────────────────────

const CALLOUT: Record<CalloutKind, { fg: string; bg: string; border: string; Icon: typeof Info; label: string }> = {
  note:      { fg: colors.accent,   bg: colors.accentSoft,  border: colors.accentBorder,  Icon: Info,          label: "Note" },
  tip:       { fg: colors.success,  bg: colors.successSoft, border: colors.successBorder, Icon: Lightbulb,     label: "Tip" },
  important: { fg: accents.purple,  bg: accents.purpleSoft, border: accents.purpleBorder, Icon: Star,          label: "Important" },
  warning:   { fg: colors.warning,  bg: colors.warningSoft, border: colors.warningBorder, Icon: AlertTriangle, label: "Warning" },
  caution:   { fg: colors.danger,   bg: colors.dangerSoft,  border: colors.dangerBorder,  Icon: OctagonAlert,  label: "Caution" },
};

// ── Blocks ───────────────────────────────────────────────────────────────────

function ListView({ b, onLink, compact, depth }: { b: Extract<Block, { t: "list" }>; onLink: (h: string) => void; compact?: boolean; depth: number }) {
  return (
    <View style={styles.list}>
      {b.items.map((it: ListItem, i) => (
        <View key={i} style={styles.li}>
          <Text style={[styles.body, compact && styles.bodyCompact, styles.bullet, b.ordered && styles.bulletNum]}>
            {it.checked != null ? (it.checked ? "☑" : "☐") : b.ordered ? `${b.start + i}.` : depth % 2 === 0 ? "•" : "◦"}
          </Text>
          <View style={styles.liBody}>
            {it.children.map((c, k) => <BlockView key={k} b={c} onLink={onLink} compact={compact} depth={depth + 1} />)}
          </View>
        </View>
      ))}
    </View>
  );
}

function BlockView({ b, onLink, compact, depth = 0 }: { b: Block; onLink: (h: string) => void; compact?: boolean; depth?: number }) {
  switch (b.t) {
    case "heading":
      return (
        <Text style={[styles.h, HEADING[Math.min(b.level, 4) - 1], compact && b.level <= 2 && { fontSize: 16 }]} accessibilityRole="header">
          {renderInlines(b.children, onLink)}
        </Text>
      );
    case "paragraph":
      return <Text style={[styles.body, compact && styles.bodyCompact]}>{renderInlines(b.children, onLink)}</Text>;
    case "list":
      return <ListView b={b} onLink={onLink} compact={compact} depth={depth} />;
    case "table":
      return <DocTable b={b} onLink={onLink} />;
    case "code":
      return <SrsCode code={b.text} lang={b.lang} />;
    case "figure":
      return <DocFigure src={b.src} alt={b.alt} title={b.title} />;
    case "hr":
      return <View style={styles.hr} />;
    case "quote": {
      if (!b.callout) {
        return (
          <View style={styles.quote}>
            {b.children.map((c, k) => <BlockView key={k} b={c} onLink={onLink} compact={compact} depth={depth} />)}
          </View>
        );
      }
      const k = CALLOUT[b.callout];
      return (
        <View style={[styles.callout, { backgroundColor: k.bg, borderColor: k.border }]} accessibilityLabel={k.label}>
          <k.Icon size={16} color={k.fg} style={{ marginTop: 3 }} />
          <View style={styles.calloutBody}>
            {b.children.map((c, j) => <BlockView key={j} b={c} onLink={onLink} compact={compact} depth={depth} />)}
          </View>
        </View>
      );
    }
  }
}

export const MarkdownView = memo(function MarkdownView({ blocks, onLink, onHeadingLayout, skipTitle, compact }: MarkdownViewProps) {
  const shown = skipTitle && blocks[0]?.t === "heading" && blocks[0].level === 1 ? blocks.slice(1) : blocks;
  return (
    <View style={[styles.root, compact && styles.rootCompact]}>
      {shown.map((b, i) => (
        <View
          key={i}
          style={b.t === "heading" && i > 0 ? (b.level <= 2 ? styles.h2Gap : styles.h3Gap) : undefined}
          onLayout={b.t === "heading" && onHeadingLayout ? e => onHeadingLayout(b.id, e.nativeEvent.layout.y) : undefined}
        >
          <BlockView b={b} onLink={onLink} compact={compact} />
        </View>
      ))}
    </View>
  );
});

const HEADING: TextStyle[] = [
  { fontSize: 22, fontWeight: "700", color: colors.text, lineHeight: 28 },
  { fontSize: 19, fontWeight: "700", color: colors.text, lineHeight: 25 },
  { fontSize: 16, fontWeight: "700", color: colors.text, lineHeight: 22 },
  { fontSize: 14, fontWeight: "700", color: colors.textSecondary, lineHeight: 20 },
];

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  rootCompact: { gap: spacing.sm + 2 },
  h: {},
  h2Gap: { marginTop: spacing.md },
  h3Gap: { marginTop: spacing.xs },
  body: { fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  bodyCompact: { fontSize: 14, lineHeight: 21 },
  strong: { fontWeight: "700", color: colors.text },
  em: { fontStyle: "italic" },
  del: { textDecorationLine: "line-through" },
  link: { color: colors.accent, fontWeight: "600" },
  inlineCode: {
    fontFamily: mono, fontSize: 13, color: colors.text,
    backgroundColor: colors.background, borderRadius: 4,
    ...(Platform.OS === "web" ? { paddingHorizontal: 3, paddingVertical: 1 } : {}),
  },
  inlineCodeLink: { color: colors.accent, backgroundColor: colors.accentSoft },
  list: { gap: spacing.xs + 2 },
  li: { flexDirection: "row", gap: spacing.sm },
  bullet: { width: 14, textAlign: "center", color: colors.textMuted },
  bulletNum: { width: 22, textAlign: "right", fontWeight: "600" },
  liBody: { flex: 1, minWidth: 0, gap: spacing.xs + 2 },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: spacing.md, gap: spacing.sm },
  callout: {
    flexDirection: "row", gap: spacing.sm + 2, borderWidth: 1, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  calloutBody: { flex: 1, minWidth: 0, gap: spacing.sm },
  tableWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, overflow: "hidden", backgroundColor: colors.surface },
  tr: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  trAlt: { backgroundColor: colors.surfaceMuted },
  trLast: { borderBottomWidth: 0 },
  thRow: { backgroundColor: colors.background, borderBottomWidth: 1 },
  td: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm },
  th: { fontSize: 12, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.3 },
  tdText: { fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  tableHint: { fontSize: 11, color: colors.textFaint, textAlign: "right" },
});
