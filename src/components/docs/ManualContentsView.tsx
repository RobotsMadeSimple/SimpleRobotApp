// The manual's contents: search, the chapters, and the instruction reference grouped by
// category. Used by the manual route and the step editor's help panel.

import { BookOpen, ChevronRight, FileText, ListTree, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Divider, EmptyState, Input, SectionHeader, StatusPill, colors, radii, spacing, type } from "@/src/components/ui/kit";
import { DocTarget, categoryLabel, categoryOrder, chapterGroups, chapterLabel, chapters, manual, searchManual } from "@/src/docs/manual";
import type { RefEntry } from "@/src/docs/types";
import { useReferenceList } from "@/src/docs/useStepReference";

function PressRow({ onPress, children, label }: { onPress: () => void; children: React.ReactNode; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.row, (pressed || hovered) && styles.rowPressed]}
    >
      {children}
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
}

function ChapterList({ onNavigate }: { onNavigate: (t: DocTarget) => void }) {
  if (chapters.length === 0) {
    return <EmptyState icon={<BookOpen size={28} color={colors.textFaint} />} title="No chapters yet" subtitle="This version of the app has no manual chapters bundled." />;
  }
  return (
    <View style={styles.groups}>
      {chapterGroups().map((g, gi) => (
        <View key={g.part?.id ?? `g${gi}`} style={styles.group}>
          {!!g.part && <Text style={styles.groupLabel}>{g.part.title}</Text>}
          <Card padded={false}>
            {g.chapters.map((c, i) => (
              <View key={c.id}>
                {i > 0 && <Divider />}
                <PressRow label={`${chapterLabel(c)}: ${c.title}`} onPress={() => onNavigate({ kind: "chapter", id: c.id })}>
                  <View style={[styles.num, !/^\d+$/.test(c.number) && styles.numAppendix]}>
                    <Text style={[styles.numText, !/^\d+$/.test(c.number) && styles.numTextAppendix]}>{c.number}</Text>
                  </View>
                  <Text style={styles.chapterTitle} numberOfLines={2}>{c.title}</Text>
                </PressRow>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

function ReferenceList({ entries, live, categories, onNavigate }: {
  entries: RefEntry[];
  live: boolean;
  categories?: { key: string; label: string }[];
  onNavigate: (t: DocTarget) => void;
}) {
  const groups = useMemo(() => {
    const by = new Map<string, RefEntry[]>();
    for (const e of entries) { const k = e.category || "other"; if (!by.has(k)) by.set(k, []); by.get(k)!.push(e); }
    const order = categoryOrder(categories);
    return [...by.entries()].sort(([a], [b]) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [entries, categories]);

  if (entries.length === 0) {
    return <EmptyState icon={<ListTree size={28} color={colors.textFaint} />} title="No instructions bundled" subtitle="Connect to a robot to list its steps, or re-sync the manual." />;
  }
  return (
    <View style={styles.groups}>
      {live && <View style={{ flexDirection: "row" }}><StatusPill label="Matches the connected robot" tone="success" dot /></View>}
      {groups.map(([cat, list]) => (
        <View key={cat} style={styles.group}>
          <Text style={styles.groupLabel}>{categoryLabel(cat, categories)}</Text>
          <Card padded={false}>
            {list.map((e, i) => (
              <View key={e.type}>
                {i > 0 && <Divider />}
                <PressRow label={`${e.keyword}, ${e.name}`} onPress={() => onNavigate({ kind: "step", key: e.type })}>
                  <Text style={styles.kw} numberOfLines={1}>{e.keyword}</Text>
                  <Text style={styles.blockName} numberOfLines={1}>{e.name}</Text>
                </PressRow>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

export function ManualContentsView({ onNavigate, twoColumn, initialQuery = "" }: {
  onNavigate: (t: DocTarget) => void;
  /** Chapters and reference side by side (desktop). */
  twoColumn?: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const { entries, live, categories } = useReferenceList();
  
  const hits = useMemo(() => searchManual(query, entries), [query, entries]);
  const searching = query.trim().length >= 2;

  const search = (
    <Input
      value={query}
      onChangeText={setQuery}
      placeholder="Search the manual and instructions"
      icon={<Search size={16} color={colors.textFaint} />}
      clearable
      autoCorrect={false}
      autoCapitalize="none"
      accessibilityLabel="Search the manual"
      returnKeyType="search"
    />
  );

  if (searching) {
    return (
      <View style={styles.root}>
        {search}
        <SectionHeader title={`${hits.length} ${hits.length === 1 ? "result" : "results"}`} />
        {hits.length === 0 ? (
          <EmptyState icon={<Search size={28} color={colors.textFaint} />} title="Nothing found" subtitle="Try a keyword such as MoveL, or a word like speed." />
        ) : (
          <Card padded={false}>
            {hits.map((h, i) => (
              <View key={`${h.kind}-${h.kind === "step" ? h.key : h.id + (h.heading?.id ?? "")}-${i}`}>
                {i > 0 && <Divider />}
                <PressRow
                  label={h.title}
                  onPress={() => onNavigate(h.kind === "step" ? { kind: "step", key: h.key } : { kind: "chapter", id: h.id, anchor: h.heading?.id })}
                >
                  {h.kind === "step"
                    ? <ListTree size={16} color={colors.accent} />
                    : <FileText size={16} color={colors.textMuted} />}
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.hitTitle} numberOfLines={1}>
                      {h.kind === "chapter" && h.heading ? `${h.heading.text}` : h.title}
                    </Text>
                    {h.kind === "chapter" && h.heading && <Text style={type.caption} numberOfLines={1}>{h.title}</Text>}
                    {!!h.snippet && <Text style={styles.snippet} numberOfLines={2}>{h.snippet}</Text>}
                  </View>
                </PressRow>
              </View>
            ))}
          </Card>
        )}
      </View>
    );
  }

  const chaptersCol = (
    <View style={styles.col}>
      <SectionHeader title="Chapters" icon={BookOpen} right={manual.version ? <Text style={type.caption}>{manual.version}</Text> : undefined} />
      <ChapterList onNavigate={onNavigate} />
    </View>
  );
  const refCol = (
    <View style={styles.col}>
      <SectionHeader title="Instruction reference" icon={ListTree} />
      <ReferenceList entries={entries} live={live} categories={categories} onNavigate={onNavigate} />
    </View>
  );

  return (
    <View style={styles.root}>
      {search}
      {twoColumn ? (
        <View style={styles.twoCol}>
          <View style={{ flex: 1, minWidth: 0 }}>{chaptersCol}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{refCol}</View>
        </View>
      ) : (
        <>
          {chaptersCol}
          {refCol}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  col: { gap: spacing.md },
  twoCol: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.md, minHeight: 48 },
  rowPressed: { backgroundColor: colors.surfaceHover },
  num: { width: 28, height: 28, borderRadius: radii.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  numText: { fontSize: 13, fontWeight: "700", color: colors.accent },
  numAppendix: { backgroundColor: colors.background },
  numTextAppendix: { color: colors.textMuted },
  chapterTitle: { ...type.title, flex: 1, minWidth: 0 },
  groups: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupLabel: { fontSize: 13, fontWeight: "700", color: colors.textSecondary, marginLeft: 2 },
  kw: { ...type.mono, fontWeight: "700", color: colors.text, minWidth: 120, maxWidth: "50%" },
  blockName: { flex: 1, minWidth: 0, fontSize: 13, color: colors.textMuted },
  hitTitle: { ...type.title, fontSize: 14 },
  snippet: { fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
});
