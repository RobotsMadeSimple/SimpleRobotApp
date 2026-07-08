import { PinType } from "@/src/models/robotModels";
import {
  Settings,
  ToggleLeft,
  ToggleRight,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ── Type helpers ──────────────────────────────────────────────────────────────

export function typeColor(type: PinType) {
  if (type === "Input")    return { fg: "#2563eb", bg: "#eff6ff" };
  if (type === "Output")   return { fg: "#7c3aed", bg: "#f5f3ff" };
  if (type === "Neopixel") return { fg: "#d97706", bg: "#fffbeb" };
  return { fg: "#6b7280", bg: "#f3f4f6" };
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
  last,
  onToggle,
}: {
  label: string;
  sublabel: string;
  type: PinType;
  value: boolean;
  last?: boolean;
  onToggle?: () => void;
}) {
  const { fg, bg } = typeColor(type);
  const isOutput   = type === "Output";
  const isNeopixel = type === "Neopixel";

  return (
    <View style={[ios.row, !last && ios.rowBorder]}>
      <View style={[ios.typeBadge, { backgroundColor: bg }]}>
        <Text style={[ios.typeBadgeText, { color: fg }]}>{typeLabel(type)}</Text>
      </View>

      <View style={ios.rowInfo}>
        <Text style={ios.rowLabel} numberOfLines={1}>{label}</Text>
        <Text style={ios.rowSub}   numberOfLines={1}>{sublabel}</Text>
      </View>

      {!isOutput && !isNeopixel && (
        <>
          <View style={[ios.dot, value ? ios.dotOn : ios.dotOff]} />
          <View style={[ios.badge, value ? ios.badgeOn : ios.badgeOff]}>
            <Text style={[ios.badgeText, value ? ios.badgeTextOn : ios.badgeTextOff]}>
              {value ? "ON" : "OFF"}
            </Text>
          </View>
        </>
      )}

      {isOutput && (
        <Pressable onPress={onToggle} hitSlop={8}>
          {value
            ? <ToggleRight size={28} color="#7c3aed" />
            : <ToggleLeft  size={28} color="#d1d5db" />
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
      <View style={[ios.connBadge, connected ? ios.connOn : ios.connOff]}>
        {connected
          ? <Wifi    size={11} color="#16a34a" />
          : <WifiOff size={11} color="#dc2626" />
        }
        <Text style={[ios.connText, connected ? ios.connTextOn : ios.connTextOff]}>
          {connected ? "Connected" : "Offline"}
        </Text>
      </View>
      {actions}
      {onConfigure && (
        <Pressable style={ios.configBtn} onPress={onConfigure} hitSlop={6}>
          <Settings size={15} color="#6b7280" />
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

export const ios = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cardName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  cardSub:  { fontSize: 11, color: "#9ca3af", marginTop: 1 },

  connBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  connOn:      { backgroundColor: "#f0fdf4" },
  connOff:     { backgroundColor: "#fef2f2" },
  connText:    { fontSize: 11, fontWeight: "600" },
  connTextOn:  { color: "#16a34a" },
  connTextOff: { color: "#dc2626" },

  configBtn: {
    marginLeft: 6,
    padding: 4,
  },

  group: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  groupDot: {
    width: 8, height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  groupLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  groupCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
    backgroundColor: "#fff",
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  typeBadge: {
    width: 36, height: 22,
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  typeBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: "500", color: "#111827" },
  rowSub:   { fontSize: 11, color: "#9ca3af", marginTop: 1 },

  dot: { width: 9, height: 9, borderRadius: 5 },
  dotOn:  { backgroundColor: "#22c55e", shadowColor: "#22c55e", shadowOpacity: 0.6, shadowRadius: 4, elevation: 2 },
  dotOff: { backgroundColor: "#d1d5db" },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 7, minWidth: 42, alignItems: "center",
  },
  badgeOn:       { backgroundColor: "#f0fdf4" },
  badgeOff:      { backgroundColor: "#f3f4f6" },
  badgeText:     { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  badgeTextOn:   { color: "#16a34a" },
  badgeTextOff:  { color: "#9ca3af" },

  neoDots: { flexDirection: "row", gap: 3 },
  neoDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fbbf24", opacity: 0.5 },

  emptyCard: { fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 16 },
});
