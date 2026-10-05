import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronDown, ChevronRight, Lock } from "lucide-react-native";
import { accents, colors, radii, shadows, spacing, type } from "@/src/components/ui/kit";
import { useExpressionEnv } from "./ExpressionEnv";
import { pluginGroupTitle, useSplitSymbols } from "./pluginSymbols";

/**
 * Collapsed list of the controller's read-only properties under the variables, so
 * users find out `$robot.x`, `$time.hour` and friends exist. They are shown, not
 * edited: the controller resolves them live and never lets a program assign one.
 */
export function PropertiesSection() {
  const env = useExpressionEnv();
  const [open, setOpen] = useState(false);
  const split = useSplitSymbols();
  const all = env?.symbols?.properties ?? [];
  const properties = split.properties;
  if (all.length === 0) return null;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen(o => !o)} activeOpacity={0.7}
        accessibilityRole="button" accessibilityState={{ expanded: open }}>
        {open ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
        <Text style={styles.title}>Properties</Text>
        <Text style={styles.count}>{all.length}</Text>
        <View style={styles.spacer} />
        <Lock size={12} color={colors.textFaint} />
        <Text style={styles.readOnly}>read-only</Text>
      </TouchableOpacity>
      {open && (
        <>
          <Text style={styles.note}>
            System values the controller keeps up to date. Use them in any expression or condition; they cannot be set by a step or edited here.
          </Text>
          {properties.map(p => <PropertyRow key={p.name} p={p} />)}
          {split.plugins.filter(g => g.properties.length > 0).map(g => (
            <View key={g.id}>
              <Text style={styles.group}>{pluginGroupTitle(g).toUpperCase()}</Text>
              {g.properties.map(p => <PropertyRow key={p.name} p={p} />)}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function PropertyRow({ p }: { p: { name: string; type: string; description: string } }) {
  return (
    <View style={styles.row}>
      <View style={styles.nameRow}>
        <Text style={styles.name}>${p.name}</Text>
        {!!p.type && <Text style={styles.type}>{p.type}</Text>}
      </View>
      {!!p.description && <Text style={styles.desc}>{p.description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, overflow: "hidden", ...shadows.soft,
  },
  header:   { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: spacing.md },
  title:    { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  count:    { ...type.caption, fontWeight: "600" },
  spacer:   { flex: 1 },
  readOnly: { ...type.caption },
  note:     { fontSize: 12, color: colors.textMuted, lineHeight: 16, paddingHorizontal: 14, paddingBottom: spacing.sm },
  row: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  group: {
    fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  name:    { fontSize: 13, fontWeight: "700", color: accents.cyan },
  type:    { ...type.caption },
  desc:    { fontSize: 12, color: colors.textFaint, marginTop: 1 },
});
