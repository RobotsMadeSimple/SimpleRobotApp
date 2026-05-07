import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { usePoints, useRobotStatus } from "@/src/providers/RobotProvider";
import { router } from "expo-router";
import { ChevronRight, Grid3x3, MapPin, Wrench } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const MENU_ITEMS = [
  {
    label: "Points",
    description: "View, move to, and manage saved robot positions",
    icon: MapPin,
    tileColor: "#f0fdf4",
    iconColor: "#16a34a",
    onPress: () => router.navigate("/space/points"),
  },
  {
    label: "Tools",
    description: "Define TCP offsets and tool frame configurations",
    icon: Wrench,
    tileColor: "#eff6ff",
    iconColor: "#2563eb",
    onPress: () => router.navigate("/space/tools"),
  },
  {
    label: "Locals",
    description: "Configure local coordinate reference frames",
    icon: Grid3x3,
    tileColor: "#f5f3ff",
    iconColor: "#7c3aed",
    onPress: () => router.navigate("/space/locals"),
  },
];

const SUMMARY_ITEMS = [
  { label: "Points",  color: "#16a34a", bgColor: "#f0fdf4" },
  { label: "Tools",   color: "#2563eb", bgColor: "#eff6ff" },
  { label: "Locals",  color: "#7c3aed", bgColor: "#f5f3ff" },
];

export default function SpacePage() {
  const status = useRobotStatus();
  const points = usePoints();

  const fmt = (v?: number) => (v ?? 0).toFixed(1);

  const coords = [
    { label: "X",  value: status.x  },
    { label: "Y",  value: status.y  },
    { label: "Z",  value: status.z  },
    { label: "RZ", value: status.rz },
  ];

  // Counts per category — tools and locals not yet implemented
  const counts = [points.length, 0, 0];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Current position ── */}
        <Text style={styles.sectionLabel}>CURRENT POSITION</Text>
        <View style={styles.card}>
          <View style={styles.coordRow}>
            {coords.map(({ label, value }) => (
              <View key={label} style={styles.coordCell}>
                <Text style={styles.coordLabel}>{label}</Text>
                <Text style={styles.coordValue}>{fmt(value)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Workspace summary ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>WORKSPACE</Text>
        <View style={styles.summaryRow}>
          {SUMMARY_ITEMS.map(({ label, color, bgColor }, i) => (
            <View key={label} style={[styles.summaryCard, { borderTopColor: color, borderTopWidth: 3 }]}>
              <Text style={[styles.summaryCount, { color }]}>{counts[i]}</Text>
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Navigation ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>NAVIGATE TO</Text>
        <View style={styles.card}>
          {MENU_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const isLast = i === MENU_ITEMS.length - 1;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.menuRow, !isLast && styles.menuRowBorder]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.iconTile, { backgroundColor: item.tileColor }]}>
                  <Icon size={20} color={item.iconColor} />
                </View>

                <View style={styles.menuText}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuDesc} numberOfLines={1}>
                    {item.description}
                  </Text>
                </View>

                <ChevronRight size={18} color="#d1d5db" />
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },

  // ── Position ──────────────────────────────────────────────────────────────
  coordRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  coordCell: {
    flex: 1,
    alignItems: "center",
  },
  coordLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  coordValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    fontFamily: "monospace",
  },

  // ── Summary tiles ─────────────────────────────────────────────────────────
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.4,
  },

  // ── Menu rows ─────────────────────────────────────────────────────────────
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  menuDesc: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
