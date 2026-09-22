import { LucideIcon } from "lucide-react-native";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, radii, shadows, spacing, type } from "./theme";

type Props = {
  /** Short label ("Points", "Uptime", "Status"). */
  label: string;
  /** The headline value. Strings and numbers both fine. */
  value: string | number;
  icon?: LucideIcon;
  /** [foreground, soft background] pair for the icon; defaults to accent. */
  tint?: [string, string];
  /** Small line under the value ("+3 this week", "since 09:14"). */
  hint?: string;
  /** Monospace value (coordinates, serials, IPs). */
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Compact labeled stat for dashboard rows. Lay several out with flex:
 *
 *   <View style={{ flexDirection: "row", gap: spacing.md }}>
 *     <StatTile label="Points" value={points.length} icon={MapPin} style={{ flex: 1 }} />
 *     <StatTile label="Grids"  value={grids.length}  icon={Grid3x3} style={{ flex: 1 }} />
 *   </View>
 */
export function StatTile({ label, value, icon: Icon, tint, hint, mono, style }: Props) {
  const [fg, soft] = tint ?? [colors.accent, colors.accentSoft];

  // Long values (prerelease firmware strings, hostnames) scale down and may
  // wrap to a second line instead of clipping unreadably at the tile edge.
  const text = String(value);
  const long = text.length > 12;
  const sizeStyle =
    text.length <= 12 ? null : text.length <= 20 ? styles.valueLong : styles.valueVeryLong;

  return (
    <View style={[styles.tile, shadows.soft, style]}>
      <View style={styles.topRow}>
        <Text style={[type.caption, styles.label]} numberOfLines={1}>{label}</Text>
        {Icon && (
          <View style={[styles.iconWell, { backgroundColor: soft }]}>
            <Icon size={14} color={fg} />
          </View>
        )}
      </View>
      <Text style={[styles.value, mono && styles.valueMono, sizeStyle]} numberOfLines={long ? 2 : 1}>
        {text}
      </Text>
      {!!hint && <Text style={[type.caption, styles.hint]} numberOfLines={1}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: 110,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  label: { textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "600" },
  iconWell: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  value:         { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  valueMono:     { fontFamily: type.mono.fontFamily, fontSize: 18 },
  valueLong:     { fontSize: 15, lineHeight: 19 },
  valueVeryLong: { fontSize: 13, lineHeight: 17 },
  hint:      { marginTop: 2 },
});
