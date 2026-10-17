import { colors } from "@/src/components/ui/kit";
import { Gauge } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

type Option = { key: string; label: string };

/**
 * Speed as a slider: the thumb snaps across an ordered set of discrete speeds (fine step → fast
 * continuous). Tap or drag anywhere on the track to pick the nearest. Shows the current level
 * prominently and the two ends as a precise↔fast hint.
 */
export function SpeedSlider({ options, value, onChange }: {
  options: Option[];
  value: string;
  onChange: (key: string) => void;
}) {
  const n   = options.length;
  const idx = Math.max(0, options.findIndex(o => o.key === value));
  const [barW, setBarW] = useState(1);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const commit = (i: number) => {
    const c = Math.max(0, Math.min(n - 1, i));
    if (options[c].key !== options[idxRef.current].key) onChange(options[c].key);
  };
  const pick = (x: number) => {
    "worklet";
    const frac = Math.max(0, Math.min(1, x / barW));
    runOnJS(commit)(Math.round(frac * (n - 1)));
  };

  const pan = Gesture.Pan()
    .onBegin(e => pick(e.x))
    .onUpdate(e => pick(e.x));

  const frac = n > 1 ? idx / (n - 1) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Gauge size={15} color={colors.accent} />
        <Text style={styles.label}>SPEED</Text>
        <Text style={styles.value}>{options[idx]?.label ?? ""}</Text>
      </View>

      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={e => setBarW(e.nativeEvent.layout.width)}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${frac * 100}%` }]} />
          </View>
          {options.map((o, i) => {
            const f = n > 1 ? i / (n - 1) : 0;
            return <View key={o.key} style={[styles.notch, { left: `${f * 100}%` }, i <= idx && styles.notchOn]} />;
          })}
          <View style={[styles.thumb, { left: `${frac * 100}%` }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const THUMB = 22;
const styles = StyleSheet.create({
  wrap:   { gap: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  label:  { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.5 },
  value:  { marginLeft: "auto", fontSize: 15, fontWeight: "700", color: colors.accent },

  hit:    { height: 40, justifyContent: "center" },
  track:  { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  fill:   { height: 6, borderRadius: 3, backgroundColor: colors.accent },

  notch:  { position: "absolute", top: 15, width: 3, height: 10, marginLeft: -1.5, borderRadius: 1.5, backgroundColor: colors.border },
  notchOn:{ backgroundColor: colors.accent },

  // (end labels removed to keep the mobile config compact)

  thumb:  {
    position: "absolute",
    top: (40 - THUMB) / 2,
    width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    marginLeft: -THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 3, borderColor: colors.accent,
  },

  ends:   { flexDirection: "row", justifyContent: "space-between" },
  endText:{ fontSize: 11, color: colors.textFaint },
});
