import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { ExpressionField } from "@/src/components/ui/builder/expressions/ExpressionEditorModal";
import { colors, radii, spacing } from "@/src/components/ui/kit";
import type { DisplayWidget, PluginSummary, ProgramVariable } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { ConfigField, DISPLAY_WIDGET_DEFS } from "./displayWidgets";

type Props = {
  widget: DisplayWidget;
  /** The program's variables, used by the expression editor and the image-variable chips. */
  variables: ProgramVariable[];
  onChange: (config: Record<string, any>) => void;
  onClose: () => void;
};

/** Edits the selected widget's config, one field per the widget type's definition. */
export function WidgetConfigPanel({ widget, variables, onChange, onClose }: Props) {
  const def = DISPLAY_WIDGET_DEFS[widget.type];
  const c = widget.config || {};
  const set = (key: string, value: any) => onChange({ ...c, [key]: value });

  const visible = (f: ConfigField) =>
    !f.showWhen || f.showWhen.equals.includes(String(c[f.showWhen.key]));

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>{def.label} widget</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        {def.fields.filter(visible).map((f) => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.label}>{f.label}</Text>
            <FieldInput field={f} value={c[f.key]} variables={variables} onChange={(v) => set(f.key, v)} onSetMany={onChange} config={c} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function FieldInput({
  field,
  value,
  variables,
  config,
  onChange,
  onSetMany,
}: {
  field: ConfigField;
  value: any;
  variables: ProgramVariable[];
  config: Record<string, any>;
  onChange: (v: any) => void;
  onSetMany: (config: Record<string, any>) => void;
}) {
  if (field.kind === "expression") {
    return (
      <ExpressionField
        style={styles.input}
        value={value ?? ""}
        onChange={onChange}
        title={field.label}
        placeholder={field.placeholder}
        variables={variables}
      />
    );
  }

  if (field.kind === "select") {
    return (
      <View style={styles.chipRow}>
        {(field.options ?? []).map((o) => {
          const active = String(value) === o.value;
          return (
            <TouchableOpacity key={o.value} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(o.value)} activeOpacity={0.7}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  if (field.kind === "number") {
    return (
      <TextInput
        style={styles.input}
        value={value === undefined || value === null ? "" : String(value)}
        onChangeText={(t) => onChange(t === "" || t === "-" ? t : Number(t))}
        keyboardType="numbers-and-punctuation"
        placeholder={field.placeholder}
        placeholderTextColor={colors.textFaint}
      />
    );
  }

  if (field.kind === "variable") {
    // Image-variable picker: chips of the program's image variables, plus free text.
    const imageVars = variables.filter((v) => v.isImage).map((v) => v.name);
    return (
      <>
        <TextInput
          style={styles.input}
          value={value ?? ""}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={field.placeholder || "variable name"}
          placeholderTextColor={colors.textFaint}
        />
        {imageVars.length > 0 && (
          <View style={styles.chipRow}>
            {imageVars.map((v) => (
              <TouchableOpacity key={v} style={[styles.chip, value === v && styles.chipActive]} onPress={() => onChange(v)} activeOpacity={0.7}>
                <Text style={[styles.chipText, value === v && styles.chipTextActive]}>${v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </>
    );
  }

  if (field.kind === "plugin") {
    return <PluginPicker config={config} onSetMany={onSetMany} />;
  }

  // text
  return (
    <TextInput
      style={styles.input}
      value={value ?? ""}
      onChangeText={onChange}
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={field.placeholder}
      placeholderTextColor={colors.textFaint}
    />
  );
}

/** Lists installed plugins that ship a UI; selecting one stores id/entry/title/name. */
function PluginPicker({ config, onSetMany }: { config: Record<string, any>; onSetMany: (c: Record<string, any>) => void }) {
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [uiEntries, setUiEntries] = useState<Record<string, { entry: string; title: string } | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await robotClient.getPlugins();
        if (cancelled) return;
        setPlugins(list);
        const entries: Record<string, { entry: string; title: string } | null> = {};
        await Promise.all(
          list.map(async (p) => {
            try {
              const detail = await robotClient.getPlugin(p.id);
              const ui = detail.manifest?.ui;
              entries[p.id] = ui?.entry ? { entry: ui.entry, title: ui.title || p.name } : null;
            } catch {
              entries[p.id] = null;
            }
          }),
        );
        if (!cancelled) setUiEntries(entries);
      } catch {
        /* not connected */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Text style={styles.muted}>Loading plugins…</Text>;
  const withUi = plugins.filter((p) => uiEntries[p.id]);
  if (withUi.length === 0) return <Text style={styles.muted}>No installed plugin ships a UI to embed.</Text>;

  return (
    <View style={styles.chipRow}>
      {withUi.map((p) => {
        const ui = uiEntries[p.id]!;
        const active = config.pluginId === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, active && styles.chipActive]}
            activeOpacity={0.7}
            onPress={() => onSetMany({ ...config, pluginId: p.id, entry: ui.entry, title: ui.title, pluginName: p.name })}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, maxHeight: 300 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: 14, fontWeight: "700", color: colors.text },
  body: { paddingHorizontal: spacing.md },
  field: { paddingVertical: spacing.sm },
  label: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, color: colors.text, backgroundColor: colors.surfaceMuted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  chipActive: { borderColor: colors.accentFaded, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  chipTextActive: { color: colors.accent },
  muted: { fontSize: 12, color: colors.textFaint, paddingVertical: spacing.sm },
});
