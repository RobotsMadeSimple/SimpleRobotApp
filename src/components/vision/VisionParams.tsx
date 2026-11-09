import { useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { accents, colors, spacing, radii, shadows } from "@/src/components/ui/kit";

export function ParamRow({ label, value, min, max, onChange, desc }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; desc?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <TextInput
          style={styles.paramInput}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseFloat(t);
            if (!isNaN(n) && n >= min && n <= max) onChange(n);
          }}
        />
      </View>
      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, desc }: {
  label: string; value: boolean; onChange: (v: boolean) => void; desc?: string;
}) {
  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: accents.cyan }} />
      </View>
      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

export function SliderParamRow({ label, value, min, max, onChange, desc }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; desc?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const THUMB_D     = 20;
  const ROW_H       = THUMB_D + 8;
  const barWRef     = useRef(1);
  const valueRef    = useRef(value);
  const startValRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current    = value;
  onChangeRef.current = onChange;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startValRef.current = valueRef.current; },
    onPanResponderMove: (_, g) => {
      if (Math.abs(g.dy) > Math.abs(g.dx) + 5) return;
      const raw     = startValRef.current + (g.dx / Math.max(1, barWRef.current)) * (max - min);
      const clamped = Math.max(min, Math.min(max, raw));
      onChangeRef.current(Math.round(clamped * 1000) / 1000);
    },
    onPanResponderRelease: () => {},
  })).current;

  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));

  return (
    <View>
      <View style={styles.paramRow}>
        <Text style={styles.paramLabel}>{label}</Text>
        <TextInput
          style={styles.paramInput}
          keyboardType="numeric"
          value={text}
          onChangeText={t => {
            setText(t);
            const n = parseFloat(t);
            if (!isNaN(n) && n >= min && n <= max) onChange(n);
          }}
        />
      </View>

      <View
        style={{ height: ROW_H, position: 'relative', marginTop: 6, marginBottom: 2 }}
        onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
      >
        <View style={{
          position: 'absolute', left: 0, right: 0,
          top: (ROW_H - 4) / 2, height: 4, borderRadius: 2,
          backgroundColor: colors.border, overflow: 'hidden',
        }}>
          <View style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 2, backgroundColor: colors.warning }} />
        </View>

        <View
          {...pan.panHandlers}
          style={{
            position: 'absolute',
            left: `${frac * 100}%`,
            top: 0,
            width: THUMB_D, height: ROW_H,
            marginLeft: -THUMB_D / 2,
            justifyContent: 'center', alignItems: 'center',
          }}
        >
          <View style={[{
            width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
            backgroundColor: colors.surface, borderWidth: 2.5, borderColor: colors.warning,
          }, shadows.soft]} />
        </View>
      </View>

      {!!desc && <Text style={styles.paramDesc}>{desc}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  paramRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  paramLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  paramDesc:  { fontSize: 11, color: colors.textFaint, marginTop: 2, lineHeight: 15 },
  paramInput: {
    width: 80, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textAlign: 'right',
    fontSize: 13, color: colors.text,
  },
});
