import { LocalInput } from "@/src/components/space/OffsetFields";
import { colors, Divider, radii, RadioRow, spacing, StatusPill, type } from "@/src/components/ui/kit";
import { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

const fmtNum = (v: number | null | undefined) => (v == null || !isFinite(v) ? "" : String(+v.toFixed(4)));

/**
 * A numeric field over a number value. It keeps its own text while typing (LocalInput), so "1."
 * or "-" never get pushed back into it; only a parsable value reaches `onChange`. With `nullable`,
 * an empty field reports null (e.g. an optional override).
 */
export function NumField({
  value, onChange, nullable, label, ...rest
}: Omit<ComponentProps<typeof LocalInput>, "value" | "onChange"> & {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  nullable?: boolean;
  /** Accessibility label (the visible label is the FieldLabel above it). */
  label: string;
}) {
  return (
    <LocalInput
      value={fmtNum(value)}
      onChange={t => {
        const trimmed = t.trim();
        if (trimmed === "") { if (nullable) onChange(null); return; }
        const n = parseFloat(trimmed);
        if (isFinite(n) && /^-?\d*\.?\d*(e-?\d+)?$/i.test(trimmed)) onChange(n);
      }}
      keyboardType="numbers-and-punctuation"
      selectTextOnFocus
      accessibilityLabel={label}
      style={s.mono}
      {...rest}
    />
  );
}

/** Small labelled numeric fields in a wrapping row (frame X/Y/Z/RZ, window start/end…). */
export function NumGrid({ fields }: {
  fields: { key: string; label: string; value: number | null | undefined; onChange: (v: number) => void }[];
}) {
  return (
    <View style={s.grid}>
      {fields.map(f => (
        <View key={f.key} style={s.gridField}>
          <Text style={s.gridLabel}>{f.label}</Text>
          <NumField value={f.value} onChange={v => { if (v != null) f.onChange(v); }} label={f.label} style={s.gridInput} />
        </View>
      ))}
    </View>
  );
}

export type PickOption = { key: string; title: string; subtitle?: string; tag?: string };

/** A bordered single-choice list (device / axis pickers inside the editor card). */
export function PickList({ options, selected, onSelect, empty }: {
  options: PickOption[];
  selected: string | null;
  onSelect: (key: string) => void;
  empty: ReactNode;
}) {
  if (options.length === 0) return <Text style={s.empty}>{empty}</Text>;
  return (
    <View style={s.list}>
      {options.map((o, i) => (
        <View key={o.key}>
          {i > 0 && <Divider />}
          <RadioRow
            title={o.title}
            subtitle={o.subtitle}
            selected={selected === o.key}
            onPress={() => onSelect(o.key)}
            style={s.row}
            right={o.tag ? <StatusPill label={o.tag} tone="accent" /> : undefined}
          />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  mono: { ...type.mono },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  gridField: { width: "22%", minWidth: 72, flexGrow: 1 },
  gridLabel: { fontSize: 11, fontWeight: "600", color: colors.textFaint, textAlign: "center", marginBottom: spacing.xs },
  gridInput: { ...type.mono, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, textAlign: "center" },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, overflow: "hidden", backgroundColor: colors.surface },
  row: { paddingHorizontal: spacing.md },
  empty: { ...type.caption, fontSize: 12 },
});
