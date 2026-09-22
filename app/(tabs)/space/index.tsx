import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { accents, Card, colors, Divider, ListRow, radii, Screen, SectionHeader, shadows, spacing, type } from "@/src/components/ui/kit";
import { useGrids, usePoints, useRobotStatus, useStacks, useTools } from "@/src/providers/RobotProvider";
import { router } from "expo-router";
import { Grid3x3, Layers, LayoutGrid, MapPin, Wrench } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

const MENU_ITEMS = [
  {
    label: "Points",
    description: "View, move to, and manage saved robot positions",
    icon: MapPin,
    tileColor: colors.successSoft,
    iconColor: colors.success,
    onPress: () => router.navigate("/space/points"),
  },
  {
    label: "Tools",
    description: "Define TCP offsets and tool frame configurations",
    icon: Wrench,
    tileColor: colors.accentSoft,
    iconColor: colors.accent,
    onPress: () => router.navigate("/space/tools"),
  },
  {
    label: "Locals",
    description: "Configure local coordinate reference frames",
    icon: Grid3x3,
    tileColor: accents.purpleSoft,
    iconColor: accents.purple,
    onPress: () => router.navigate("/space/locals"),
  },
  {
    label: "Grids",
    description: "Define 2D position arrays for pick-and-place and pallet operations",
    icon: LayoutGrid,
    tileColor: colors.warningSoft,
    iconColor: colors.warning,
    onPress: () => router.navigate("/space/grids"),
  },
  {
    label: "Stacks",
    description: "Define 1D position arrays with optional round-robin indexing",
    icon: Layers,
    tileColor: accents.purpleSoft,
    iconColor: accents.purple,
    onPress: () => router.navigate("/space/stacks"),
  },
];

const SUMMARY_ITEMS = [
  { label: "Points",  color: colors.success, bgColor: colors.successSoft },
  { label: "Tools",   color: colors.accent,  bgColor: colors.accentSoft },
  { label: "Grids",   color: colors.warning, bgColor: colors.warningSoft },
  { label: "Stacks",  color: accents.purple, bgColor: accents.purpleSoft },
];

export default function SpacePage() {
  const status = useRobotStatus();
  const points = usePoints();
  const grids  = useGrids();
  const stacks = useStacks();
  const tools  = useTools();

  const fmt = (v?: number) => (v ?? 0).toFixed(1);

  const coords = [
    { label: "X",  value: status.x  },
    { label: "Y",  value: status.y  },
    { label: "Z",  value: status.z  },
    { label: "RZ", value: status.rz },
  ];

  const counts = [points.length, tools.length, grids.length, stacks.length];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />

      <Screen>
        {/* ── Current position ── */}
        <SectionHeader title="Current position" />
        <Card>
          <View style={styles.coordRow}>
            {coords.map(({ label, value }) => (
              <View key={label} style={styles.coordCell}>
                <Text style={styles.coordLabel}>{label}</Text>
                <Text style={styles.coordValue}>{fmt(value)}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* ── Workspace summary ── */}
        <SectionHeader title="Workspace" style={styles.summaryHeader} />
        <View style={styles.summaryRow}>
          {SUMMARY_ITEMS.map(({ label, color, bgColor }, i) => (
            <View key={label} style={[styles.summaryCard, { borderTopColor: color, borderTopWidth: 3 }]}>
              <Text style={[styles.summaryCount, { color }]}>{counts[i]}</Text>
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Navigation ── */}
        <SectionHeader title="Navigate to" style={styles.summaryHeader} />
        <Card>
          {MENU_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const isLast = i === MENU_ITEMS.length - 1;
            return (
              <View key={item.label}>
                <ListRow
                  card={false}
                  title={item.label}
                  subtitle={item.description}
                  icon={<Icon size={20} color={item.iconColor} />}
                  iconColor={item.tileColor}
                  onPress={item.onPress}
                />
                {!isLast && <Divider inset />}
              </View>
            );
          })}
        </Card>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  summaryHeader: { marginTop: spacing.sm },

  // ── Position ──────────────────────────────────────────────────────────────
  coordRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
  },
  coordCell: {
    flex: 1,
    alignItems: "center",
  },
  coordLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  coordValue: {
    ...type.mono,
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },

  // ── Summary tiles ─────────────────────────────────────────────────────────
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    gap: spacing.xs,
    ...shadows.soft,
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
    letterSpacing: 0.4,
  },
});
