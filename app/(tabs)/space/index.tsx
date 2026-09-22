import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { accents, Card, colors, Divider, ListRow, PageHeader, PositionReadout, Screen, SectionHeader, spacing, StatTile } from "@/src/components/ui/kit";
import { useGrids, usePoints, useRobotStatus, useStacks, useTools } from "@/src/providers/RobotProvider";
import { router } from "expo-router";
import { Crosshair, Grid3x3, Layers, LayoutGrid, MapPin, Wrench } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

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

export default function SpacePage() {
  const status = useRobotStatus();
  const points = usePoints();
  const grids  = useGrids();
  const stacks = useStacks();
  const tools  = useTools();

  const fmt = (v?: number) => (v ?? 0).toFixed(1);

  const positionAxes = [
    { label: "X",  value: fmt(status.x),  unit: "mm" },
    { label: "Y",  value: fmt(status.y),  unit: "mm" },
    { label: "Z",  value: fmt(status.z),  unit: "mm" },
    { label: "RZ", value: fmt(status.rz), unit: "°"  },
  ];

  const summaryTiles = [
    { label: "Points", value: points.length, icon: MapPin,     tint: [colors.success, colors.successSoft] as [string, string] },
    { label: "Tools",  value: tools.length,  icon: Wrench,     tint: [colors.accent,  colors.accentSoft]  as [string, string] },
    { label: "Grids",  value: grids.length,  icon: LayoutGrid, tint: [colors.warning, colors.warningSoft] as [string, string] },
    { label: "Stacks", value: stacks.length, icon: Layers,     tint: [accents.purple, accents.purpleSoft] as [string, string] },
  ];

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader title="Space" subtitle="Points, tools, grids, and workspace setup" />

      <Screen>
        {/* ── Current position ── */}
        <SectionHeader title="Current position" icon={Crosshair} />
        <PositionReadout axes={positionAxes} />

        {/* ── Workspace summary ── */}
        <SectionHeader title="Workspace" icon={LayoutGrid} style={styles.summaryHeader} />
        <View style={styles.tileRow}>
          {summaryTiles.map(({ label, value, icon, tint }) => (
            <StatTile key={label} label={label} value={value} icon={icon} tint={tint} style={styles.tile} />
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

  // ── Stat tile rows ────────────────────────────────────────────────────────
  // flexWrap so 4 tiles wrap to 2×2 on narrow phones instead of overflowing.
  tileRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm + 2,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 130,
  },
});
