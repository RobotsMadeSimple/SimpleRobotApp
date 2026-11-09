import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check, ChevronDown, Minus, Plus } from "lucide-react-native";
import { SegmentedControl, colors, radii, spacing, accents } from "@/src/components/ui/kit";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { SliderParamRow } from "@/src/components/vision/VisionParams";
import type { ParamFieldSpec, ToolParams } from "@/src/models/visionTools";
import { ves } from "./visionEditorStyles";

/**
 * Renders a list of param field specs (src/models/visionTools.ts) — the one params panel every
 * tool and filter shares. Numbers get a stepper with a typed field, 0–255 style ranges a slider,
 * small enumerations a segmented control, long ones a picker sheet.
 */
export function ParamFields({ fields, values, onChange }: {
  fields: ParamFieldSpec[];
  values: ToolParams;
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  const shown = fields.filter(f => !f.showIf || f.showIf(values));
  if (shown.length === 0) return null;
  return (
    <View style={{ gap: spacing.md }}>
      {shown.map(f => <ParamField key={f.key} field={f} value={values[f.key]} onChange={v => onChange(f.key, v)} />)}
    </View>
  );
}

function ParamField({ field, value, onChange }: {
  field: ParamFieldSpec;
  value: unknown;
  onChange: (v: string | number | boolean) => void;
}) {
  switch (field.kind) {
    case "int":
    case "number": {
      const step = field.step ?? 1;
      const decimals = field.kind === "int" ? 0 : Math.max(0, Math.min(4, -Math.floor(Math.log10(step))));
      return (
        <View>
          <View style={ves.paramRow}>
            <Text style={ves.paramLabel}>{field.label}</Text>
            <NumberStepper
              value={typeof value === "number" ? value : Number(value ?? field.min)}
              min={field.min} max={field.max} step={step} decimals={decimals}
              onChange={onChange}
              accessibilityLabel={field.label}
            />
          </View>
          {!!field.desc && <Text style={ves.paramDesc}>{field.desc}</Text>}
        </View>
      );
    }
    case "slider": {
      const step = field.step ?? 1;
      return (
        <SliderParamRow
          label={field.label}
          value={typeof value === "number" ? value : Number(value ?? field.min)}
          min={field.min} max={field.max}
          onChange={v => onChange(Math.round(v / step) * step)}
          desc={field.desc}
        />
      );
    }
    case "segment":
      return (
        <View style={{ gap: 6 }}>
          <Text style={ves.paramLabel}>{field.label}</Text>
          <SegmentedControl
            size="sm"
            options={field.options}
            value={String(value ?? field.options[0]?.value)}
            onChange={onChange}
          />
          {!!field.desc && <Text style={ves.paramDesc}>{field.desc}</Text>}
        </View>
      );
    case "bool":
      return (
        <View>
          <View style={ves.paramRow}>
            <Text style={ves.paramLabel}>{field.label}</Text>
            <Switch value={!!value} onValueChange={onChange} trackColor={{ true: accents.cyan }} />
          </View>
          {!!field.desc && <Text style={ves.paramDesc}>{field.desc}</Text>}
        </View>
      );
    case "select":
      return <SelectField label={field.label} desc={field.desc} options={field.options} value={value as number | string} onChange={onChange} />;
  }
}

/** − [value] + with a typed field; clamps to [min, max] and rounds to the step's decimals. */
export function NumberStepper({ value, min, max, step = 1, decimals = 0, onChange, accessibilityLabel, width = 72 }: {
  value: number; min: number; max: number; step?: number; decimals?: number;
  onChange: (v: number) => void; accessibilityLabel?: string; width?: number;
}) {
  const fmt = (n: number) => (Number.isFinite(n) ? String(Number(n.toFixed(decimals))) : "");
  // The typed text is held only while the field is focused; otherwise it shows the value.
  const [editing, setEditing] = useState<string | null>(null);
  const text = editing ?? fmt(value);
  const clamp = (n: number) => Math.max(min, Math.min(max, Number(n.toFixed(decimals))));
  const bump = (d: number) => onChange(clamp((Number.isFinite(value) ? value : min) + d * step));
  return (
    <View style={st.stepper}>
      <TouchableOpacity style={st.stepBtn} onPress={() => bump(-1)} hitSlop={6} accessibilityLabel={`Decrease ${accessibilityLabel ?? ""}`}>
        <Minus size={14} color={colors.textSecondary} />
      </TouchableOpacity>
      <TextInput
        style={[ves.paramInput, { width, textAlign: "center" }]}
        keyboardType="numeric"
        value={text}
        aria-label={accessibilityLabel}
        placeholder={accessibilityLabel}
        placeholderTextColor={colors.textFaint}
        onFocus={() => setEditing(text)}
        onChangeText={t => {
          setEditing(t);
          const n = parseFloat(t);
          if (!isNaN(n) && n >= min && n <= max) onChange(Number(n.toFixed(decimals)));
        }}
        onBlur={() => setEditing(null)}
        selectTextOnFocus
      />
      <TouchableOpacity style={st.stepBtn} onPress={() => bump(1)} hitSlop={6} accessibilityLabel={`Increase ${accessibilityLabel ?? ""}`}>
        <Plus size={14} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

/** A labelled value row that opens a picker sheet. */
export function SelectField<T extends number | string>({ label, desc, options, value, onChange }: {
  label: string; desc?: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View>
      <TouchableOpacity style={st.selectRow} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Text style={ves.paramLabel}>{label}</Text>
        <Text style={st.selectValue} numberOfLines={1}>{current?.label ?? String(value)}</Text>
        <ChevronDown size={14} color={colors.textFaint} />
      </TouchableOpacity>
      {!!desc && <Text style={ves.paramDesc}>{desc}</Text>}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          {options.map(o => (
            <TouchableOpacity
              key={String(o.value)}
              style={[ves.sheetRow, o.value === value && ves.sheetRowActive]}
              onPress={() => { onChange(o.value); setOpen(false); }}
            >
              <Text style={[ves.sheetRowName, { flex: 1 }]}>{o.label}</Text>
              {o.value === value && <Check size={16} color={colors.accent} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const st = StyleSheet.create({
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: {
    width: 30, height: 30, borderRadius: radii.sm, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border,
  },
  selectRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 32 },
  selectValue: { fontSize: 13, fontWeight: "600", color: colors.text, maxWidth: "55%" },
});
