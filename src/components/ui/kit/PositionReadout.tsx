import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { Card } from "./Card";
import { accents, colors, radii, spacing, type } from "./theme";

export type ReadoutAxis = {
  /** Axis letter(s): "X", "Y", "Z", "RZ", "J1"… */
  label: string;
  /** Already-formatted value ("123.45") or a number (formatted to 2 decimals). */
  value: number | string;
  /**
   * Optional commanded/target value, shown in a second column beside the live
   * value ("current → target"). Dimmed once it matches the live value, so a
   * glance tells you which axes still have somewhere to go.
   */
  target?: number | string;
  /** Unit shown faintly after the value ("mm", "°"). */
  unit?: string;
  /** Highlight this axis (e.g. the joint currently faulted or being jogged). */
  active?: boolean;
};

const fmtValue = (v: number | string) => (typeof v === "number" ? v.toFixed(2) : v);
const reached  = (a: ReadoutAxis) =>
  a.target !== undefined && Number(fmtValue(a.value)) === Number(fmtValue(a.target));

type Props = {
  axes: ReadoutAxis[];
  /** lg = jog/DRO prominence, md = dashboard rows. Default md. */
  size?: "md" | "lg";
  /** Wrap in a Card surface. Default true; false for embedding in an existing Card. */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * CNC-style DRO (digital readout): one row per axis, axis letter in a small
 * tile on the left, right-aligned mono value. Use this for X/Y/Z/RZ or joint
 * position displays instead of a grid of StatTiles — positions read as an
 * aligned column of numbers, the way machine operators expect.
 *
 *   <PositionReadout axes={[
 *     { label: "X",  value: status.x,  unit: "mm" },
 *     { label: "Y",  value: status.y,  unit: "mm" },
 *     { label: "Z",  value: status.z,  unit: "mm" },
 *     { label: "RZ", value: status.rz, unit: "°"  },
 *   ]} />
 */
export function PositionReadout({ axes, size = "md", card = true, style }: Props) {
  const lg = size === "lg";
  const hasTargets = axes.some((a) => a.target !== undefined);

  const rows = (
    <View style={style}>
      {hasTargets && (
        <View style={[styles.header, lg && styles.headerLg]}>
          <Text style={styles.headerLabel}>CURRENT</Text>
          <Text style={[styles.headerLabel, styles.headerTarget, lg && styles.headerTargetLg]}>TARGET</Text>
          <View style={[styles.unit, lg && styles.unitLg]} />
        </View>
      )}
      {axes.map((axis, i) => (
        <View
          key={axis.label}
          style={[styles.row, lg && styles.rowLg, (i > 0 || hasTargets) && styles.rowBorder]}
        >
          <View style={[styles.axisTile, lg && styles.axisTileLg, axis.active && styles.axisTileActive]}>
            <Text style={[styles.axisLabel, lg && styles.axisLabelLg, axis.active && styles.axisLabelActive]}>
              {axis.label}
            </Text>
          </View>
          <Text
            style={[styles.value, lg && styles.valueLg, axis.active && styles.valueActive]}
            numberOfLines={1}
          >
            {fmtValue(axis.value)}
          </Text>
          {hasTargets && (
            <Text
              style={[styles.target, lg && styles.targetLg, reached(axis) && styles.targetReached]}
              numberOfLines={1}
            >
              {axis.target === undefined ? "" : `→ ${fmtValue(axis.target)}`}
            </Text>
          )}
          {!!axis.unit && <Text style={[styles.unit, lg && styles.unitLg]}>{axis.unit}</Text>}
        </View>
      ))}
    </View>
  );

  return card ? <Card padded={false}>{rows}</Card> : rows;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowLg: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  axisTile: {
    minWidth: 34,
    paddingHorizontal: spacing.xs,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  axisTileLg:     { minWidth: 42, height: 32 },
  axisTileActive: { backgroundColor: colors.accentSoft },
  axisLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  axisLabelLg:     { fontSize: 14 },
  axisLabelActive: { color: colors.accent },
  value: {
    flex: 1,
    textAlign: "right",
    fontFamily: type.mono.fontFamily,
    fontVariant: ["tabular-nums"],
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  valueLg:     { fontSize: 24 },
  valueActive: { color: colors.accent },
  // Target column: the commanded position the axis is heading to.
  target: {
    width: 92,
    textAlign: "right",
    fontFamily: type.mono.fontFamily,
    fontVariant: ["tabular-nums"],
    fontSize: 15,
    fontWeight: "600",
    color: accents.purple,
  },
  targetLg:      { width: 116, fontSize: 19 },
  targetReached: { color: colors.textFaint },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  headerLg: { paddingHorizontal: spacing.lg },
  headerLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textFaint,
    letterSpacing: 0.5,
    textAlign: "right",
  },
  headerTarget:   { width: 92, color: accents.purple },
  headerTargetLg: { width: 116 },
  unit: {
    width: 28,
    fontSize: 12,
    color: colors.textFaint,
  },
  unitLg: { fontSize: 13, width: 30 },
});
