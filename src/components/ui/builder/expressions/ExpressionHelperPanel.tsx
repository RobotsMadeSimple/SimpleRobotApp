import React, { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { X } from "lucide-react-native";
import { ProgramVariable } from "@/src/models/robotModels";
import { colors, radii } from "@/src/components/ui/kit";
import { useActiveFieldRegistry } from "./ActiveField";
import { useExpressionEnv } from "./ExpressionEnv";
import { pluginGroupTitle, useSplitSymbols } from "./pluginSymbols";
import { SymbolSections } from "./SymbolSections";
import { FunctionsList } from "./FunctionsList";
import { variableToken } from "./ExpressionEditorModal";

/**
 * The wide-mode side panel: every variable, caller variable, global, read-only property, IO name and
 * function, always visible, with a search. Tapping one inserts it into whichever expression field is
 * currently focused (tracked by the ActiveField registry).
 */
export function ExpressionHelperPanel({ variables, contextVariables, contextLabel, style, onInsert, onClose }: {
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
  style?: any;
  /** When set, inserts route here instead of the focused-field registry (modal use on narrow). */
  onInsert?: (token: string) => void;
  /** When set (modal use), shows a close × in the header and a Cancel button at the bottom. */
  onClose?: () => void;
}) {
  const reg = useActiveFieldRegistry();
  const env = useExpressionEnv();
  const split = useSplitSymbols();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"vars" | "props" | "fns" | "plugins">("vars");
  const hasPlugins = split.plugins.length > 0;

  const active = reg?.active ?? null;
  // A stable insert so changing the focused field doesn't re-render (and re-mount) the symbol lists.
  const regRef = useRef(reg);
  regRef.current = reg;
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;
  const insert = useCallback((tok: string) => {
    if (onInsertRef.current) onInsertRef.current(tok);
    else regRef.current?.active?.insert(tok);
  }, []);

  const q = search.trim().toLowerCase();
  const envVars = env?.symbols?.variables;
  const { shownVars, shownContext, shownGlobals, functions, pluginGroups } = useMemo(() => {
    const matches = (n: string) => !q || n.toLowerCase().includes(q);
    const localNames = new Set((variables ?? []).map(v => v.name.toLowerCase()));
    return {
      shownVars:    (variables ?? []).filter(v => matches(v.name)),
      shownContext: (contextVariables ?? []).filter(v => matches(v.name)),
      shownGlobals: (envVars ?? []).filter(v => v.isGlobal && !localNames.has(v.name.toLowerCase()) && matches(v.name)),
      functions:    split.functions,
      pluginGroups: split.plugins
        .map(g => ({ g, fns: g.functions.filter(f => !q
          || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
          || g.name.toLowerCase().includes(q)) }))
        .filter(x => x.fns.length > 0),
    };
  }, [q, variables, contextVariables, envVars, split]);

  return (
    <View style={[hs.panel, style]}>
      <View style={hs.titleRow}>
        <Text style={hs.title}>Insert</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={12} activeOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Close">
            <X size={18} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={hs.hint}>
        {onInsert ? "Tap to insert into the field." : active ? "Tap to insert into the focused field." : "Focus a field, then tap to insert."}
      </Text>
      <View style={hs.tabBar}>
        {([["vars", "Variables"], ["props", "Properties"], ["fns", "Functions"],
           ...(hasPlugins ? [["plugins", "Plugins"] as const] : [])] as const).map(([t, label]) => (
          <TouchableOpacity key={t} style={[hs.tab, tab === t && hs.tabActive]} onPress={() => setTab(t)} activeOpacity={0.7}>
            <Text style={[hs.tabText, tab === t && hs.tabTextActive]} numberOfLines={1}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={hs.searchBox}>
        <TextInput style={hs.searchInput} value={search} onChangeText={setSearch}
          placeholder="Search…" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
            <X size={13} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>
      {/* All three tabs stay mounted (hidden with display:none) so switching is instant — the lists
          mount once when the panel opens rather than re-mounting on every tab change. */}
      <ScrollView style={hs.scroll} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        <View style={tab !== "vars" && hs.hidden}>
          {shownVars.length > 0 && (
            <Section title="Variables">
              {shownVars.map(v => <Chip key={v.id} label={"$" + v.name} onPress={() => insert(variableToken(v))} />)}
            </Section>
          )}
          {shownContext.length > 0 && (
            <Section title={contextLabel ?? "Caller variables"}>
              {shownContext.map(v => <Chip key={"c:" + v.id} label={"$" + v.name} onPress={() => insert(variableToken(v))} />)}
            </Section>
          )}
          {shownGlobals.length > 0 && (
            <Section title="Globals">
              {shownGlobals.map(v => <Chip key={"g:" + v.name} label={"$" + v.name} onPress={() => insert("$" + v.name)} />)}
            </Section>
          )}
          {shownVars.length + shownContext.length + shownGlobals.length === 0 && <Text style={hs.empty}>No variables yet.</Text>}
        </View>

        <View style={tab !== "props" && hs.hidden}>
          <SymbolSections search={search} onPick={name => insert("$" + name)} includePlugins={false} />
        </View>

        <View style={tab !== "fns" && hs.hidden}>
          {functions.length > 0
            ? <FunctionsList functions={functions} search={search} onInsert={name => insert(name + "(")} />
            : <Text style={hs.empty}>No functions.</Text>}
        </View>

        {hasPlugins && (
          <View style={tab !== "plugins" && hs.hidden}>
            <SymbolSections search={search} onPick={name => insert("$" + name)} pluginsOnly />
            {pluginGroups.map(({ g, fns }) => (
              <React.Fragment key={g.id}>
                <Text style={hs.section}>{pluginGroupTitle(g)}  ·  functions</Text>
                <FunctionsList functions={fns} search="" onInsert={name => insert(name + "(")} />
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>
      {onClose && (
        <TouchableOpacity style={hs.cancel} onPress={onClose} activeOpacity={0.7}
          accessibilityRole="button" accessibilityLabel="Cancel">
          <Text style={hs.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** The helper panel in a centred modal — the narrow-screen replacement for per-field insert chips. */
export function ExpressionHelperModal({ visible, onClose, variables, contextVariables, contextLabel, onInsert }: {
  visible: boolean;
  onClose: () => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
  onInsert: (token: string) => void;
}) {
  // A pixel maxHeight — a "%" maxHeight can't resolve against the auto-height wrapper here, so the
  // panel would collapse to just its header. Cap at ~78% of the screen, leaving room for the top gap.
  const { height: winH } = useWindowDimensions();
  const panelMaxHeight = Math.max(260, Math.round(winH * 0.78) - 52);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={hs.modalOverlay} onPress={onClose}>
        <Pressable style={hs.modalWrap} onPress={() => {}}>
          <ExpressionHelperPanel
            variables={variables}
            contextVariables={contextVariables}
            contextLabel={contextLabel}
            onInsert={tok => { onInsert(tok); onClose(); }}
            onClose={onClose}
            style={[hs.modalPanel, { maxHeight: panelMaxHeight }]}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={hs.section}>{title}</Text>
      <View style={hs.chipWrap}>{children}</View>
    </>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={hs.chip} activeOpacity={0.7} onPress={onPress}>
      <Text style={hs.chipText} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const hs = StyleSheet.create({
  panel: {
    width: 300, backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 15, fontWeight: "800", color: colors.text },
  cancel: {
    marginTop: 12, paddingVertical: 11, alignItems: "center",
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
  hint:  { fontSize: 11, color: colors.textFaint, marginTop: 2, marginBottom: 10 },
  tabBar: { flexDirection: "row", gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, padding: 3, marginBottom: 8 },
  tab:    { flex: 1, paddingVertical: 6, borderRadius: radii.sm - 2, alignItems: "center" },
  tabActive: { backgroundColor: colors.surface, ...(({ shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 })) },
  tabText:   { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  tabTextActive: { color: colors.text },
  empty: { fontSize: 12, color: colors.textFaint, fontStyle: "italic", marginTop: 10 },
  hidden: { display: "none" },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-start", alignItems: "center", paddingTop: 52, paddingHorizontal: 24 },
  modalWrap: { width: "100%", maxWidth: 480 },
  modalPanel: { width: "100%" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.sm, paddingHorizontal: 10, backgroundColor: colors.surfaceMuted, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 8 },
  scroll: { flexShrink: 1, minHeight: 0 },
  section: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.4, marginTop: 10, marginBottom: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: "#ede9fe", maxWidth: "100%" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6d28d9" },
});
