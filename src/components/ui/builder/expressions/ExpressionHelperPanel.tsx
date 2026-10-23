import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
export function ExpressionHelperPanel({ variables, contextVariables, contextLabel, style }: {
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  contextLabel?: string;
  style?: any;
}) {
  const reg = useActiveFieldRegistry();
  const env = useExpressionEnv();
  const split = useSplitSymbols();
  const [search, setSearch] = useState("");

  const active = reg?.active ?? null;
  const insert = (tok: string) => active?.insert(tok);

  const q = search.trim().toLowerCase();
  const matches = (n: string) => !q || n.toLowerCase().includes(q);
  const localNames = new Set((variables ?? []).map(v => v.name.toLowerCase()));
  const shownVars    = (variables ?? []).filter(v => matches(v.name));
  const shownContext = (contextVariables ?? []).filter(v => matches(v.name));
  const shownGlobals = (env?.symbols?.variables ?? [])
    .filter(v => v.isGlobal && !localNames.has(v.name.toLowerCase()) && matches(v.name));
  const functions = split.functions;
  const pluginGroups = split.plugins
    .map(g => ({ g, fns: g.functions.filter(f => !q
      || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
      || g.name.toLowerCase().includes(q)) }))
    .filter(x => x.fns.length > 0);

  return (
    <View style={[hs.panel, style]}>
      <Text style={hs.title}>Insert</Text>
      <Text style={hs.hint}>{active ? "Tap to insert into the focused field." : "Focus a field, then tap to insert."}</Text>
      <View style={hs.searchBox}>
        <TextInput style={hs.searchInput} value={search} onChangeText={setSearch}
          placeholder="Search…" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
            <X size={13} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={hs.scroll} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
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
        <SymbolSections search={search} onPick={name => insert("$" + name)} />
        {functions.length > 0 && (
          <>
            <Text style={hs.section}>Functions</Text>
            <FunctionsList functions={functions} search={search} onInsert={name => insert(name + "(")} />
          </>
        )}
        {pluginGroups.map(({ g, fns }) => (
          <React.Fragment key={g.id}>
            <Text style={hs.section}>{pluginGroupTitle(g)}</Text>
            <FunctionsList functions={fns} search="" onInsert={name => insert(name + "(")} />
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
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
  title: { fontSize: 15, fontWeight: "800", color: colors.text },
  hint:  { fontSize: 11, color: colors.textFaint, marginTop: 2, marginBottom: 10 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.sm, paddingHorizontal: 10, backgroundColor: colors.surfaceMuted, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 13, color: colors.text, paddingVertical: 8 },
  scroll: { flexGrow: 0 },
  section: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.4, marginTop: 10, marginBottom: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: "#ede9fe", maxWidth: "100%" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6d28d9" },
});
