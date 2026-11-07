// One chapter of the programming manual, rendered natively from its bundled Markdown.

import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { ManualChapterView } from "@/src/components/docs/ManualChapterView";
import { PageHeader, colors } from "@/src/components/ui/kit";
import { usePaneLayout, useWideContent } from "@/src/components/ui/responsive";
import { chapterLabel, chapterMeta } from "@/src/docs/manual";
import { manualBack, openManual } from "@/src/docs/navigation";

export default function ManualChapterScreen() {
  const { id, anchor } = useLocalSearchParams<{ id?: string; anchor?: string }>();
  const meta = id ? chapterMeta(id) : undefined;
  const desktop = usePaneLayout() === "desktop";
  const wideContent = useWideContent();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title={meta?.title ?? "Chapter"}
        subtitle={meta ? chapterLabel(meta) : "Not in this manual"}
        crumbs={[
          { label: "Program", href: "/program" },
          { label: "Manual", href: "/(tabs)/program/manual" },
          { label: meta?.title ?? "Chapter" },
        ]}
        onBack={() => manualBack()}
        connection={false}
      />
      <ManualChapterView
        key={meta?.id ?? id}
        id={meta?.id ?? id ?? ""}
        anchor={anchor}
        onNavigate={openManual}
        wide={desktop}
        // Prose reads best at a measure of ~80 characters, even on a wide window.
        contentStyle={[wideContent, { maxWidth: 860 }]}
      />
    </View>
  );
}
