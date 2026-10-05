import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Lock } from "lucide-react-native";
import { ms } from "../builderStyles";
import { accents, colors } from "@/src/components/ui/kit";
import { useExpressionEnv } from "./ExpressionEnv";

/**
 * "Properties" and "IO" sections for a variable picker that inserts into an
 * expression. Properties are read-only system values (`$robot.x`, `$time.hour`, …);
 * IO names read the boards. Picking one hands back its name without the `$`.
 */
export function SymbolSections({ search, onPick }: { search: string; onPick: (name: string) => void }) {
  const env = useExpressionEnv();
  if (!env?.symbols) return null;
  const q = search.trim().toLowerCase();
  const match = (name: string, description: string) =>
    !q || name.toLowerCase().includes(q) || description.toLowerCase().includes(q);
  const properties = env.symbols.properties.filter(p => match(p.name, p.description));
  const io = env.symbols.io.filter(i => match(i.name, i.description));

  return (
    <>
      <Section title="PROPERTIES · READ-ONLY" count={properties.length}>
        {properties.map((p, i) => (
          <SymbolRow key={p.name} name={p.name} description={p.description} tint={accents.cyan} readOnly
            last={i === properties.length - 1} onPress={() => onPick(p.name)} />
        ))}
      </Section>
      <Section title="IO" count={io.length}>
        {io.map((x, i) => (
          <SymbolRow key={x.name} name={x.name} description={x.description} tint={colors.success}
            last={i === io.length - 1} onPress={() => onPick(x.name)} />
        ))}
      </Section>
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.headerText}>{title}</Text>
      </View>
      {children}
    </>
  );
}

function SymbolRow({ name, description, tint, readOnly, last, onPress }: {
  name: string; description: string; tint: string; readOnly?: boolean; last: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[ms.row, !last && ms.rowBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={ms.rowText}>
        <View style={styles.nameRow}>
          <Text style={[ms.rowLabel, { color: tint }]}>${name}</Text>
          {readOnly && <Lock size={11} color={colors.textFaint} />}
        </View>
        {!!description && <Text style={ms.rowDesc} numberOfLines={2}>{description}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 4, paddingTop: 10, paddingBottom: 4, marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  headerText: { fontSize: 10, fontWeight: "700", color: colors.textFaint, letterSpacing: 0.5 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
});
