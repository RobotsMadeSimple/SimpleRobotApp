import { colors, Input, spacing, type } from "@/src/components/ui/kit";
import { ComponentProps, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/** Editable 6-axis offset, held as strings while typing. */
export type OffsetDraft = {
  name: string;
  description: string;
  x: string; y: string; z: string;
  rx: string; ry: string; rz: string;
};

export const EMPTY_OFFSET_DRAFT: OffsetDraft = {
  name: "", description: "",
  x: "0", y: "0", z: "0",
  rx: "0", ry: "0", rz: "0",
};

type Offset = { name: string; description?: string; x: number; y: number; z: number; rx: number; ry: number; rz: number };

export function offsetToDraft(o: Offset): OffsetDraft {
  return {
    name: o.name, description: o.description ?? "",
    x: String(o.x), y: String(o.y), z: String(o.z),
    rx: String(o.rx), ry: String(o.ry), rz: String(o.rz),
  };
}

export function parseOffsetDraft(d: OffsetDraft) {
  return {
    name:        d.name.trim(),
    description: d.description.trim() || undefined,
    x:  parseFloat(d.x)  || 0,
    y:  parseFloat(d.y)  || 0,
    z:  parseFloat(d.z)  || 0,
    rx: parseFloat(d.rx) || 0,
    ry: parseFloat(d.ry) || 0,
    rz: parseFloat(d.rz) || 0,
  };
}

/**
 * A text input that holds its own copy of the value while being edited, so frequent parent
 * re-renders (e.g. a screen that reads the ~20Hz status broadcast) don't push the value back into
 * the field mid-type — with selectTextOnFocus that would reselect and overwrite what you type.
 * The local copy is re-seeded only when the value changes from outside (e.g. after a re-teach).
 */
type LocalInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChangeText" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
};
export function LocalInput({ value, onChange, ...rest }: LocalInputProps) {
  const [text, setText] = useState(value);
  const [seed, setSeed] = useState(value);
  if (value !== seed) { setSeed(value); setText(value); }   // external change → re-seed
  return <Input value={text} onChangeText={t => { setText(t); onChange(t); }} {...rest} />;
}

export type OffsetAxis = "x" | "y" | "z" | "rx" | "ry" | "rz";

/** A wrapping grid of labelled numeric fields, one per axis. */
export function OffsetGrid({
  draft, axes, onChange,
}: {
  draft: OffsetDraft;
  axes: OffsetAxis[];
  onChange: (axis: OffsetAxis, v: string) => void;
}) {
  return (
    <View style={s.grid}>
      {axes.map(a => (
        <View key={a} style={s.field}>
          <Text style={s.label}>{a.toUpperCase()}</Text>
          <LocalInput
            style={s.input}
            value={draft[a]}
            onChange={v => onChange(a, v)}
            keyboardType="numbers-and-punctuation"
            selectTextOnFocus
            accessibilityLabel={a.toUpperCase()}
          />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  field: { width: "30%", flexGrow: 1 },
  label: {
    fontSize: 11, fontWeight: "600", color: colors.textFaint,
    textAlign: "center", marginBottom: spacing.xs,
  },
  input: {
    ...type.mono,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    textAlign: "center",
  },
});
