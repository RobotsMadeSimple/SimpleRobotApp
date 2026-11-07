// A manual chapter: the rendered Markdown in its own scroll view, an "On this page" jump list
// (a side column on wide screens, a card at the top plus a floating sections button on phones),
// in-page anchor scrolling and previous / next chapter links.

import { ArrowUp, ChevronLeft, ChevronRight, List } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Card, colors, radii, shadows, spacing, type } from "@/src/components/ui/kit";
import { ChapterHeading, DocTarget, adjacentChapters, chapterBlocks, chapterHeadings, chapterMeta, resolveHref } from "@/src/docs/manual";
import { MarkdownView } from "./MarkdownView";

function JumpList({ headings, active, onJump, limit }: {
  headings: ChapterHeading[]; active?: string; onJump: (id: string) => void; limit?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? headings.slice(0, limit) : headings;
  return (
    <View style={styles.jump}>
      {shown.map(h => (
        <Pressable key={h.id} onPress={() => onJump(h.id)} accessibilityRole="link" accessibilityLabel={`Jump to ${h.text}`}
          style={({ pressed }) => [styles.jumpRow, h.level === 3 && styles.jumpSub, h.id === active && styles.jumpActive, pressed && { opacity: 0.6 }]}>
          <Text style={[styles.jumpText, h.level === 3 && styles.jumpTextSub, h.id === active && styles.jumpTextActive]} numberOfLines={2}>{h.text}</Text>
        </Pressable>
      ))}
      {limit != null && headings.length > limit && (
        <Pressable onPress={() => setAll(a => !a)} accessibilityRole="button" style={styles.jumpRow}>
          <Text style={styles.jumpMore}>{all ? "Show fewer" : `Show all ${headings.length} sections`}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ManualChapterView({ id, anchor, onNavigate, wide, contentStyle, compact }: {
  id: string;
  anchor?: string;
  onNavigate: (t: DocTarget) => void;
  /** Show the jump list as a side column. */
  wide?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const meta = chapterMeta(id);
  const blocks = useMemo(() => chapterBlocks(id), [id]);
  const headings = useMemo(() => chapterHeadings(id), [id]);
  const { prev, next } = adjacentChapters(meta?.id ?? id);

  const scrollRef = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const headingY = useRef(new Map<string, number>());
  const pending = useRef<string | undefined>(anchor);
  const [active, setActive] = useState<string | undefined>();
  const [scrolled, setScrolled] = useState(false);
  const [sheet, setSheet] = useState(false);

  const scrollToHeading = useCallback((hid: string) => {
    const y = headingY.current.get(hid);
    if (y == null) { pending.current = hid; return; }
    pending.current = undefined;
    scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + y - spacing.md), animated: true });
    setActive(hid);
  }, []);

  // A new anchor: scroll to it (now, or once it has been laid out). Callers key this view by
  // chapter id, so a different chapter starts fresh at the top.
  useEffect(() => {
    if (anchor) scrollToHeading(anchor);
  }, [anchor, scrollToHeading]);

  const onHeadingLayout = useCallback((hid: string, y: number) => {
    headingY.current.set(hid, y);
    if (pending.current === hid) setTimeout(() => scrollToHeading(hid), 30);
  }, [scrollToHeading]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setScrolled(y > 500);
    let cur: string | undefined;
    for (const h of headings) {
      const hy = headingY.current.get(h.id);
      if (hy != null && bodyY.current + hy - 80 <= y) cur = h.id;
    }
    if (cur !== active) setActive(cur);
  };

  const onLink = (href: string) => {
    const t = resolveHref(href, meta?.id);
    if (!t) return;
    if (t.kind === "chapter" && t.id === meta?.id && t.anchor) { scrollToHeading(t.anchor); return; }
    onNavigate(t);
  };

  const jumpCard = headings.length > 1 && !wide && (
    <Card style={styles.jumpCard}>
      <View style={styles.jumpHead}>
        <List size={14} color={colors.textMuted} />
        <Text style={type.sectionLabel}>On this page</Text>
      </View>
      <JumpList headings={headings} onJump={scrollToHeading} limit={6} />
    </Card>
  );

  const pager = (prev || next) && (
    <View style={styles.pager}>
      {prev ? (
        <Pressable style={({ pressed }) => [styles.pagerBtn, pressed && { opacity: 0.7 }]} accessibilityRole="link"
          onPress={() => onNavigate({ kind: "chapter", id: prev.id })}>
          <ChevronLeft size={16} color={colors.textMuted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.caption}>Previous</Text>
            <Text style={styles.pagerTitle} numberOfLines={1}>{prev.title}</Text>
          </View>
        </Pressable>
      ) : <View style={{ flex: 1 }} />}
      {next ? (
        <Pressable style={({ pressed }) => [styles.pagerBtn, styles.pagerNext, pressed && { opacity: 0.7 }]} accessibilityRole="link"
          onPress={() => onNavigate({ kind: "chapter", id: next.id })}>
          <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
            <Text style={type.caption}>Next</Text>
            <Text style={styles.pagerTitle} numberOfLines={1}>{next.title}</Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      ) : <View style={{ flex: 1 }} />}
    </View>
  );

  if (!meta) {
    return <View style={[styles.missing, contentStyle]}><Text style={type.body}>This chapter is not in the bundled manual.</Text></View>;
  }

  const scroller = (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, contentStyle]}
      onScroll={onScroll}
      scrollEventThrottle={64}
      keyboardShouldPersistTaps="handled"
    >
      {jumpCard}
      <View onLayout={e => { bodyY.current = e.nativeEvent.layout.y; }}>
        <MarkdownView blocks={blocks} onLink={onLink} onHeadingLayout={onHeadingLayout} skipTitle compact={compact} />
      </View>
      {pager}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      {wide && headings.length > 1 ? (
        <View style={styles.wideRow}>
          <View style={{ flex: 1, minWidth: 0 }}>{scroller}</View>
          <View style={styles.aside}>
            <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg }}>
              <Text style={[type.sectionLabel, { marginBottom: spacing.sm, marginLeft: spacing.sm }]}>On this page</Text>
              <JumpList headings={headings} active={active} onJump={scrollToHeading} />
            </ScrollView>
          </View>
        </View>
      ) : scroller}

      {!wide && scrolled && (
        <View style={styles.fabs} pointerEvents="box-none">
          {headings.length > 1 && (
            <Pressable style={styles.fab} onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Jump to a section">
              <List size={18} color={colors.accent} />
            </Pressable>
          )}
          <Pressable style={styles.fab} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} accessibilityRole="button" accessibilityLabel="Back to top">
            <ArrowUp size={18} color={colors.accent} />
          </Pressable>
        </View>
      )}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="On this page">
        <ScrollView>
          <JumpList headings={headings} active={active} onJump={h => { setSheet(false); setTimeout(() => scrollToHeading(h), 200); }} />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.lg },
  missing: { padding: spacing.lg },
  wideRow: { flex: 1, flexDirection: "row" },
  aside: { width: 240, borderLeftWidth: 1, borderLeftColor: colors.border, paddingHorizontal: spacing.sm },
  jumpCard: { gap: spacing.sm },
  jumpHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
  jump: { gap: 2 },
  jumpRow: { paddingVertical: 7, paddingHorizontal: spacing.sm, borderRadius: radii.sm, minHeight: 36, justifyContent: "center" },
  jumpSub: { paddingLeft: spacing.xl },
  jumpActive: { backgroundColor: colors.accentSoft },
  jumpText: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  jumpTextSub: { fontWeight: "400", color: colors.textMuted, fontSize: 13.5 },
  jumpTextActive: { color: colors.accent },
  jumpMore: { fontSize: 13, color: colors.accent, fontWeight: "600" },
  pager: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  pagerBtn: {
    flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  pagerNext: {},
  pagerTitle: { fontSize: 14, fontWeight: "600", color: colors.accent },
  fabs: { position: "absolute", right: spacing.lg, bottom: spacing.xl, gap: spacing.sm },
  fab: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, ...shadows.raised,
  },
});
