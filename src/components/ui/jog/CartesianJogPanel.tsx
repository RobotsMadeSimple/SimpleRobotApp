import { JogButton } from "@/src/components/ui/JogButton";
import { colors } from "@/src/components/ui/kit";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RedoDot,
  UndoDot,
} from "lucide-react-native";
import { StyleSheet, useWindowDimensions, View } from "react-native";

export type CartesianAxis = "x" | "y" | "z" | "rz";

type Props = {
  onStart:     (axis: CartesianAxis, direction: 1 | -1) => void;
  onStopAxis:  (axis: CartesianAxis, direction: 1 | -1) => void;
  /** When set, buttons shrink so the 3-row pad fits within this height (short screens). */
  maxHeight?:  number;
};

const GAP = 8;

/**
 * XYZ / Tool jog layout: an explicit 3×3 X/Y cross (with RZ on the top corners) and a Z column
 * on the right. Laid out with plain rows rather than a wrapping grid so the buttons land in the
 * same places on every platform. Buttons size to both the width (4 columns) and, when given,
 * the available height (3 rows).
 */
export function CartesianJogPanel({ onStart, onStopAxis, maxHeight }: Props) {
  const { width } = useWindowDimensions();

  // 4 columns (3 cross + 1 Z) with gaps; cap by height (3 rows) on short screens.
  const byWidth  = (width - 40 - 4 * GAP) / 4;
  const byHeight = maxHeight ? (maxHeight - 2 * GAP) / 3 : Infinity;
  const size = Math.max(40, Math.min(byWidth, byHeight, 86));
  const icon = Math.round(size * 0.42);

  const btn = (
    label: string, ic: React.ReactNode, pos: "above" | "below" | "left" | "right",
    axis: CartesianAxis, dir: 1 | -1,
  ) => (
    <JogButton
      label={label}
      icon={ic}
      iconPosition={pos}
      onStart={() => onStart(axis, dir)}
      onStop={() => onStopAxis(axis, dir)}
      size={size}
    />
  );
  const spacer = <View style={{ width: size, height: size }} />;

  return (
    <View style={styles.wrap}>
      {/* X/Y cross, RZ on the top corners */}
      <View style={styles.cross}>
        <View style={styles.row}>
          {btn("+RZ", <UndoDot      size={icon} color={colors.textMuted} />, "above", "rz",  1)}
          {btn("-X",  <ChevronUp    size={icon} color={colors.textMuted} />, "above", "x",  -1)}
          {btn("-RZ", <RedoDot      size={icon} color={colors.textMuted} />, "above", "rz", -1)}
        </View>
        <View style={styles.row}>
          {btn("-Y",  <ChevronLeft  size={icon} color={colors.textMuted} />, "left",  "y", -1)}
          {spacer}
          {btn("+Y",  <ChevronRight size={icon} color={colors.textMuted} />, "right", "y",  1)}
        </View>
        <View style={styles.row}>
          {spacer}
          {btn("+X",  <ChevronDown  size={icon} color={colors.textMuted} />, "below", "x",  1)}
          {spacer}
        </View>
      </View>

      {/* Z column (aligned to the cross's top and bottom rows) */}
      <View style={[styles.zcol, { height: size * 3 + GAP * 2 }]}>
        {btn("+Z", <ChevronUp   size={icon} color={colors.textMuted} />, "above", "z",  1)}
        {btn("-Z", <ChevronDown size={icon} color={colors.textMuted} />, "below", "z", -1)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: GAP * 2 },
  cross: { gap: GAP },
  row:   { flexDirection: "row", gap: GAP },
  zcol:  { justifyContent: "space-between" },
});
