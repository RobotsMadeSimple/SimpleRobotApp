import { router, Tabs, useLocalSearchParams } from "expo-router";
import { LayoutDashboard, Pencil } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { DisplayPageView } from "@/src/components/ui/program/DisplayPageView";
import { compileLayout } from "@/src/components/ui/program/displayCompiler";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { colors, PageHeader, spacing } from "@/src/components/ui/kit";
import { useBuiltPrograms, useConnected } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

/**
 * Full-screen viewer for a program's custom display page. Renders the user HTML in a
 * sandboxed WebView/iframe (see DisplayPageView) wired to the live program over the bridge.
 * When the program has no page yet, offers to create one in the editor.
 */
export default function DisplayPageScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const programName = name ? decodeURIComponent(name) : "";
  const connected = useConnected();
  const builtPrograms = useBuiltPrograms();
  const program = builtPrograms.find((p) => p.name === programName) ?? null;

  // Widget pages compile to the same bridge HTML; "html" (or legacy, no mode) renders raw HTML.
  const useWidgets = (program?.displayPageMode ?? (program?.displayPageLayout ? "widgets" : "html")) === "widgets";
  const html = useMemo(() => {
    if (!program) return "";
    return useWidgets
      ? compileLayout(program.displayPageLayout, { pluginUiUrl: (id, e) => robotClient.pluginUiUrl(id, e) })
      : program.displayPageHtml ?? "";
  }, [program, useWidgets]);
  const hasPage = useWidgets ? (program?.displayPageLayout?.widgets?.length ?? 0) > 0 : !!program?.displayPageHtml;

  const crumbs = [
    { label: "Program", href: "/program" },
    { label: "Programs", href: "/(tabs)/program/robot-programs" },
    { label: programName },
  ];
  const editHref = `/program/display-page-edit?name=${encodeURIComponent(programName)}`;

  return (
    <View style={styles.root}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <PageHeader
        title={programName || "Display Page"}
        subtitle="Custom display page"
        crumbs={crumbs}
        backTo={`/program/monitor-program?name=${encodeURIComponent(programName)}`}
        right={
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push(editHref)} activeOpacity={0.7}>
            <Pencil size={14} color={colors.accent} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        }
      />

      {!connected ? (
        <NotConnectedOverlay />
      ) : hasPage ? (
        <DisplayPageView
          html={html}
          programName={programName}
          programId={program?.id}
          style={styles.page}
        />
      ) : (
        <View style={styles.empty}>
          <LayoutDashboard size={40} color={colors.borderStrong} />
          <Text style={styles.emptyTitle}>No display page yet</Text>
          <Text style={styles.emptySub}>
            Build a custom dashboard for &quot;{programName}&quot; — show variables, images and graphs,
            and add inputs and a run button.
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => router.push(editHref)} activeOpacity={0.8}>
            <Pencil size={15} color={colors.onAccent} />
            <Text style={styles.createBtnText}>Create display page</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, backgroundColor: colors.surface },

  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: 9, borderWidth: 1.5, borderColor: colors.accentFaded, backgroundColor: colors.accentSoft,
  },
  editBtnText: { color: colors.accent, fontSize: 13, fontWeight: "700" },

  empty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: spacing.md, padding: spacing.xxl,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" },
  emptySub: { fontSize: 13, color: colors.textFaint, textAlign: "center", lineHeight: 20, maxWidth: 360 },
  createBtn: {
    flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 11, backgroundColor: colors.accent,
  },
  createBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
});
