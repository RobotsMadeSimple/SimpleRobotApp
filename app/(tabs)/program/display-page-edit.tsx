import { router, Tabs, useLocalSearchParams } from "expo-router";
import { Check, Code2, Eye, LayoutGrid, Upload, Wand2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DisplayPageBuilder } from "@/src/components/ui/program/DisplayPageBuilder";
import { DisplayPageView } from "@/src/components/ui/program/DisplayPageView";
import { compileLayout } from "@/src/components/ui/program/displayCompiler";
import { DEFAULT_DISPLAY_HTML } from "@/src/components/ui/program/displaySnippets";
import { WidgetConfigPanel } from "@/src/components/ui/program/WidgetConfigPanel";
import { colors, PageHeader, radii, spacing } from "@/src/components/ui/kit";
import type { DisplayPageLayout, DisplayPageMode, DisplayWidget } from "@/src/models/robotModels";
import { useBuiltPrograms, useConnected } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";

const DEFAULT_LAYOUT: DisplayPageLayout = { cols: 12, rowHeight: 44, widgets: [] };

type Tab = "design" | "html" | "preview";

/**
 * Editor for a program's custom display page. "Design" is a drag-and-drop widget grid; "HTML"
 * is the raw editor (with generate-from-widgets and, on web, upload); "Preview" renders the live
 * page. Design widgets compile to HTML (displayCompiler) that the same bridge runs. Saves the
 * layout, the raw HTML, and which mode the page uses.
 */
export default function DisplayPageEditScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const programName = name ? decodeURIComponent(name) : "";
  const connected = useConnected();
  const builtPrograms = useBuiltPrograms();
  const program = builtPrograms.find((p) => p.name === programName) ?? null;

  const [layout, setLayout] = useState<DisplayPageLayout>(program?.displayPageLayout ?? DEFAULT_LAYOUT);
  const [html, setHtml] = useState<string>(program?.displayPageHtml || DEFAULT_DISPLAY_HTML);
  const [mode, setMode] = useState<DisplayPageMode>(
    program?.displayPageMode ?? (program?.displayPageLayout ? "widgets" : program?.displayPageHtml ? "html" : "widgets"),
  );
  const [tab, setTab] = useState<Tab>(mode === "html" ? "html" : "design");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const programVariables = useMemo(() => program?.variables ?? [], [program?.variables]);
  const selectedWidget = layout.widgets.find((w) => w.id === selectedId) ?? null;

  const previewHtml = useMemo(
    () => (mode === "widgets" ? compileLayout(layout, { pluginUiUrl: (id, e) => robotClient.pluginUiUrl(id, e) }) : html),
    [mode, layout, html],
  );

  // The live background shown on the Design canvas — always the compiled widget layout, and
  // debounced so editing a field doesn't reload the preview on every keystroke.
  const [designPreviewHtml, setDesignPreviewHtml] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setDesignPreviewHtml(compileLayout(layout, { pluginUiUrl: (id, e) => robotClient.pluginUiUrl(id, e) })),
      350,
    );
    return () => clearTimeout(t);
  }, [layout]);

  const crumbs = useMemo(
    () => [
      { label: "Program", href: "/program" },
      { label: programName, href: `/program/display-page?name=${encodeURIComponent(programName)}` },
      { label: "Display page" },
    ],
    [programName],
  );

  // The page's source (`mode`) follows what you actually edit, not which tab you look at — so
  // Preview always shows the real page. Touching widgets makes it a widget page; typing HTML
  // (or uploading) makes it an HTML page.
  const setWidgets = (widgets: DisplayWidget[]) => { setLayout((l) => ({ ...l, widgets })); setMode("widgets"); };
  const updateSelectedConfig = (config: Record<string, any>) => {
    setLayout((l) => ({ ...l, widgets: l.widgets.map((w) => (w.id === selectedId ? { ...w, config } : w)) }));
    setMode("widgets");
  };
  const editHtml = (t: string) => { setHtml(t); setMode("html"); };

  const goTab = (t: Tab) => setTab(t); // navigation only — never changes the page's source

  const generateFromWidgets = () => {
    setHtml(compileLayout(layout, { pluginUiUrl: (id, e) => robotClient.pluginUiUrl(id, e) }));
    setMode("html");
    appAlert("Generated", "Filled the HTML editor from your widget design, and switched the page to HTML mode.");
  };

  const uploadHtml = () => {
    if (Platform.OS !== "web") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".html,.htm,text/html";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { setHtml(String(r.result || "")); setMode("html"); setTab("html"); };
      r.readAsText(f);
    };
    input.click();
  };

  const save = async () => {
    if (!program) return;
    setSaving(true);
    try {
      await robotClient.saveBuiltProgram({
        ...program,
        displayPageMode: mode,
        displayPageLayout: layout,
        displayPageHtml: html,
        lastUpdatedUnixMs: Date.now(),
      });
      await robotClient.getBuiltPrograms().catch(() => {});
      router.back();
    } catch (e) {
      appAlert("Couldn't save", String(e));
    } finally {
      setSaving(false);
    }
  };

  const backTo = `/program/display-page?name=${encodeURIComponent(programName)}`;

  if (!connected) {
    return (
      <View style={styles.root}>
        <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
        <PageHeader title="Display page" crumbs={crumbs} backTo={backTo} />
        <NotConnectedOverlay />
      </View>
    );
  }

  const TABS: { key: Tab; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
    { key: "design", label: "Design", Icon: LayoutGrid },
    { key: "html", label: "HTML", Icon: Code2 },
    { key: "preview", label: "Preview", Icon: Eye },
  ];

  return (
    <View style={styles.root}>
      <Tabs.Screen options={{ tabBarStyle: { display: "none" }, headerShown: false }} />
      <PageHeader
        title="Display page"
        subtitle={programName}
        crumbs={crumbs}
        backTo={backTo}
        right={
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving || !program} activeOpacity={0.8}>
            <Check size={14} color={colors.onAccent} />
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.tabs}>
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <TouchableOpacity key={key} style={[styles.tab, active && styles.tabActive]} onPress={() => goTab(key)} activeOpacity={0.7}>
              <Icon size={14} color={active ? colors.accent : colors.textMuted} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "design" && (
        <View style={styles.fill}>
          <DisplayPageBuilder
            layout={layout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setWidgets}
            programName={programName}
            programId={program?.id}
            previewHtml={designPreviewHtml}
            showPreview={connected}
          />
          {selectedWidget && (
            <WidgetConfigPanel
              widget={selectedWidget}
              variables={programVariables}
              onChange={updateSelectedConfig}
              onClose={() => setSelectedId(null)}
            />
          )}
        </View>
      )}

      {tab === "html" && (
        <View style={styles.fill}>
          <View style={styles.htmlToolbar}>
            <TouchableOpacity style={styles.toolBtn} onPress={generateFromWidgets} activeOpacity={0.7}>
              <Wand2 size={13} color={colors.accent} />
              <Text style={styles.toolBtnText}>Generate from widgets</Text>
            </TouchableOpacity>
            {Platform.OS === "web" && (
              <TouchableOpacity style={styles.toolBtn} onPress={uploadHtml} activeOpacity={0.7}>
                <Upload size={13} color={colors.accent} />
                <Text style={styles.toolBtnText}>Upload .html</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.code}
            value={html}
            onChangeText={editHtml}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder="<div>…</div>"
            placeholderTextColor={colors.textFaint}
            textAlignVertical="top"
          />
        </View>
      )}

      {tab === "preview" && (
        <DisplayPageView html={previewHtml} programName={programName} programId={program?.id} style={styles.fill} />
      )}
    </View>
  );
}

const MONO = Platform.select({ web: "monospace", ios: "Menlo", default: "monospace" });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },

  saveBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 9, backgroundColor: colors.accent },
  saveBtnText: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },

  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  tabActive: { borderColor: colors.accentFaded, backgroundColor: colors.accentSoft },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextActive: { color: colors.accent },

  htmlToolbar: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: colors.accentFaded, backgroundColor: colors.accentSoft },
  toolBtnText: { fontSize: 12, fontWeight: "700", color: colors.accent },

  code: { flex: 1, margin: spacing.md, padding: spacing.md, backgroundColor: "#0f172a", color: "#e2e8f0", borderRadius: radii.lg, fontFamily: MONO, fontSize: 13, lineHeight: 19 },
});
