// The manual inside another surface (the step editor): its own small page stack so links
// between instructions and chapters work without leaving the editor. Back walks the stack, then
// returns to the host via onClose.

import { ArrowLeft, BookOpen, ExternalLink } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "@/src/components/ui/kit";
import { DocTarget, chapterMeta } from "@/src/docs/manual";
import { useStepReference } from "@/src/docs/useStepReference";
import { ManualChapterView } from "./ManualChapterView";
import { ManualContentsView } from "./ManualContentsView";
import { StepReferenceView } from "./StepReferenceView";

function StepPage({ k, onNavigate }: { k: string; onNavigate: (t: DocTarget) => void }) {
  const { entry, live } = useStepReference(k);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      {entry
        ? <StepReferenceView entry={entry} live={live} onNavigate={onNavigate} compact />
        : (
          <View style={styles.none}>
            <Text style={type.body}>This step has no page in the manual yet.</Text>
            <Pressable onPress={() => onNavigate({ kind: "contents" })} accessibilityRole="link">
              <Text style={styles.link}>Browse the manual</Text>
            </Pressable>
          </View>
        )}
    </ScrollView>
  );
}

function titleOf(t: DocTarget): string {
  switch (t.kind) {
    case "step": return t.key;
    case "chapter": return chapterMeta(t.id)?.title ?? "Chapter";
    default: return "Programming Manual";
  }
}

export function ManualPanel({ initial, onClose, closeLabel = "Back to the step", onOpenFull }: {
  initial: DocTarget;
  onClose: () => void;
  closeLabel?: string;
  /** Leave the host and open the current page as a full manual page (omit to hide). */
  onOpenFull?: (t: DocTarget) => void;
}) {
  const [stack, setStack] = useState<DocTarget[]>([initial]);
  const cur = stack[stack.length - 1];
  const push = (t: DocTarget) => {
    if (t.kind === "external") { void Linking.openURL(t.url); return; }
    setStack(s => [...s, t]);
  };
  const back = () => (stack.length > 1 ? setStack(s => s.slice(0, -1)) : onClose());

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" style={styles.back}
          accessibilityLabel={stack.length > 1 ? "Back" : closeLabel}>
          <ArrowLeft size={16} color={colors.accent} />
          <Text style={styles.backText} numberOfLines={1}>{stack.length > 1 ? "Back" : closeLabel}</Text>
        </Pressable>
        <View style={styles.where}>
          <BookOpen size={13} color={colors.textFaint} />
          <Text style={styles.whereText} numberOfLines={1}>{titleOf(cur)}</Text>
        </View>
        {onOpenFull && (
          <Pressable onPress={() => onOpenFull(cur)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Open in the manual">
            <ExternalLink size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <View style={{ flex: 1 }}>
        {cur.kind === "step" && <StepPage key={`s-${stack.length}`} k={cur.key} onNavigate={push} />}
        {cur.kind === "chapter" && (
          <ManualChapterView key={`c-${stack.length}-${cur.id}`} id={cur.id} anchor={cur.anchor} onNavigate={push} compact contentStyle={styles.pad} />
        )}
        {cur.kind === "contents" && (
          <ScrollView key={`t-${stack.length}`} style={{ flex: 1 }} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            <ManualContentsView onNavigate={push} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "50%" },
  backText: { fontSize: 13, fontWeight: "600", color: colors.accent },
  where: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  whereText: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  pad: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.lg },
  none: { gap: spacing.sm },
  link: { fontSize: 14, fontWeight: "600", color: colors.accent },
});
