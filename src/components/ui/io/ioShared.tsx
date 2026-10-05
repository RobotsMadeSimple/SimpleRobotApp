import { PinType } from "@/src/models/robotModels";
import {
  Settings,
  ToggleLeft,
  ToggleRight,
} from "lucide-react-native";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { accents, colors, radii, shadows, spacing, StatusPill, type } from "@/src/components/ui/kit";

// ── Type helpers ──────────────────────────────────────────────────────────────
//
// Input/Neopixel map onto kit tokens exactly. Output keeps its purple —
// a device-type tint (matches the Aux Stepper Axis tint elsewhere in this
// section), now via the kit's purple accent family.

export function typeColor(type: PinType) {
  if (type === "Input")    return { fg: colors.accent,     bg: colors.accentSoft };
  if (type === "Output")   return { fg: accents.purple,    bg: accents.purpleSoft }; // device-type tint
  if (type === "Neopixel") return { fg: colors.warning,    bg: colors.warningSoft };
  return { fg: colors.textMuted, bg: colors.background };
}

export function typeLabel(type: PinType) {
  if (type === "Input")    return "IN";
  if (type === "Output")   return "OUT";
  if (type === "Neopixel") return "NEO";
  return "—";
}

// ── IORow ─────────────────────────────────────────────────────────────────────

export function IORow({
  label,
  sublabel,
  type,
  value,
  onToggle,
}: {
  label: string;
  sublabel: string;
  type: PinType;
  value: boolean;
  onToggle?: () => void;
}) {
  const { fg, bg } = typeColor(type);
  const isOutput   = type === "Output";
  const isNeopixel = type === "Neopixel";

  return (
    <View style={ios.row}>
      <View style={[ios.typeBadge, { backgroundColor: bg }]}>
        <Text style={[ios.typeBadgeText, { color: fg }]}>{typeLabel(type)}</Text>
      </View>

      <View style={ios.rowInfo}>
        <Text style={ios.rowLabel} numberOfLines={1}>{label}</Text>
        <Text style={ios.rowSub}   numberOfLines={1}>{sublabel}</Text>
      </View>

      {!isOutput && !isNeopixel && (
        <StatusPill label={value ? "ON" : "OFF"} tone={value ? "success" : "neutral"} dot />
      )}

      {isOutput && (
        <Pressable onPress={onToggle} hitSlop={8}>
          {value
            ? <ToggleRight size={28} color={accents.purple} />
            : <ToggleLeft  size={28} color={colors.borderStrong} />
          }
        </Pressable>
      )}

      {isNeopixel && (
        <View style={ios.neoDots}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={ios.neoDot} />
          ))}
        </View>
      )}
    </View>
  );
}

// ── CardHeader ────────────────────────────────────────────────────────────────

export function CardHeader({
  icon,
  iconBg,
  name,
  subtitle,
  connected,
  onConfigure,
  actions,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  subtitle: string;
  connected: boolean;
  onConfigure?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <View style={ios.cardHeader}>
      <View style={[ios.cardIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={ios.cardName}>{name}</Text>
        <Text style={ios.cardSub}>{subtitle}</Text>
      </View>
      <StatusPill label={connected ? "Connected" : "Offline"} tone={connected ? "success" : "danger"} dot />
      {actions}
      {onConfigure && (
        <Pressable style={ios.configBtn} onPress={onConfigure} hitSlop={6}>
          <Settings size={15} color={colors.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

// ── PinGroup ──────────────────────────────────────────────────────────────────

export function PinGroup({
  label,
  fg,
  bg,
  children,
}: {
  label: string;
  fg: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <View style={ios.group}>
      <View style={ios.groupHeader}>
        <View style={[ios.groupDot, { backgroundColor: bg, borderColor: fg }]} />
        <Text style={[ios.groupLabel, { color: fg }]}>{label}</Text>
      </View>
      <View style={ios.groupCard}>{children}</View>
    </View>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
//
// Kept as a single `ios` StyleSheet (rather than folded fully into per-screen
// styles) because auxiliary.tsx reuses `ios.row` / `rowInfo` / `rowLabel` /
// `rowSub` / `emptyCard` directly for its motor-driver row.

export const ios = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadows.soft,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    padding: spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm + 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cardName: type.title,
  cardSub:  { ...type.caption, marginTop: 1 },

  configBtn: {
    marginLeft: spacing.xs + 2,
    padding: spacing.xs,
  },

  group: { paddingHorizontal: spacing.md + 2, paddingTop: spacing.md, paddingBottom: spacing.xs + 2 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginBottom: spacing.xs + 2,
  },
  groupDot: {
    width: 8, height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  groupLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  groupCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm + 1,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    gap: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  typeBadge: {
    width: 36, height: 22,
    borderRadius: radii.sm - 4,
    justifyContent: "center",
    alignItems: "center",
  },
  typeBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  rowInfo: { flex: 1 },
  rowLabel: { ...type.body, fontSize: 14, fontWeight: "500", color: colors.text },
  rowSub:   { ...type.caption, marginTop: 1 },

  neoDots: { flexDirection: "row", gap: 3 },
  neoDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fbbf24", opacity: 0.5 },

  emptyCard: { fontSize: 13, color: colors.textFaint, textAlign: "center", padding: spacing.lg },
});
