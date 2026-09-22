import { useIsWide, useWideContent } from "@/src/components/ui/responsive";
import { setSelectedRobot } from "@/src/connections/robotState";
import { useRobots, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router } from "expo-router";
import {
  ArrowLeftRight,
  CodeXml,
  Gamepad2,
  Info,
  Move3d,
  Settings2,
} from "lucide-react-native";
import {
  Button,
  Card,
  colors,
  Divider,
  ListRow,
  radii,
  SectionHeader,
  spacing,
  type,
} from "@/src/components/ui/kit";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const robotImages: Record<string, any> = {
  ASTRO: require("@/assets/images/ASTRO.png"),
};

const defaultRobotImage = require("@/assets/images/no-robot.png");

function changeRobot() {
  robotClient.disconnect();
  setSelectedRobot(null);
  router.replace("/robot");
}

const MENU_ITEMS = [
  {
    label: "Monitor Program",
    description: "View and manage running programs",
    icon: CodeXml,
    tileColor: "#eff6ff",
    iconColor: "#2563eb",
    onPress: () => router.navigate("/program"),
  },
  {
    label: "Jog and Teach",
    description: "Manually move the robot and save points",
    icon: Gamepad2,
    tileColor: "#f0fdf4",
    iconColor: "#16a34a",
    onPress: () => router.navigate("/control"),
  },
  {
    label: "Inputs and Outputs",
    description: "Monitor and control digital I/O",
    icon: ArrowLeftRight,
    tileColor: "#fff7ed",
    iconColor: "#ea580c",
    onPress: () => router.navigate("/io"),
  },
  {
    label: "Points, Tools & Locals",
    description: "Manage saved positions and tool frames",
    icon: Move3d,
    tileColor: "#f5f3ff",
    iconColor: "#7c3aed",
    onPress: () => router.navigate("/space"),
  },
  {
    label: "Configure",
    description: "Homing offsets, speeds and motion settings",
    icon: Settings2,
    tileColor: "#fdf4ff",
    iconColor: "#9333ea",
    onPress: () => router.navigate("/robot/config"),
  },
  {
    label: "About Robot",
    description: "Serial number, firmware and diagnostics",
    icon: Info,
    tileColor: colors.surfaceMuted,
    iconColor: colors.textMuted,
    onPress: () => router.navigate("/robot/about"),
  },
];

export default function ConnectedRobot() {
  const selectedRobot = useSelectedRobot();
  const robots = useRobots();
  // Two-pane (wide) layout below — Screen only handles the single-column
  // gutter, so this screen keeps its own useWideContent/useIsWide per the kit README.
  const wideContent = useWideContent();
  const isWide = useIsWide();

  const robot =
    robots.find((r) => r.serialNumber === selectedRobot?.serialNumber) ??
    selectedRobot;

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No robot selected</Text>
        <Button label="Back to Robot Selection" onPress={changeRobot} />
      </View>
    );
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;

  const infoSection = (
    <>
      <SectionHeader title="Connected Robot" />
      <Card padded={false}>
        <View style={[styles.robotRow, isWide && styles.robotRowWide]}>
          <View style={[styles.imageWrapper, isWide && styles.imageWrapperWide]}>
            <Image
              source={imageSource}
              style={[styles.robotImage, isWide && styles.robotImageWide]}
              resizeMode="contain"
            />
          </View>

          <View style={styles.robotInfo}>
            <Text style={styles.robotName} numberOfLines={1}>{robot.robotName}</Text>
            {!!robot.robotType && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{robot.robotType}</Text>
              </View>
            )}
            <Text style={[type.mono, styles.robotIp]} numberOfLines={1}>
              {robot.ipAddress}:{robot.port}
            </Text>
          </View>
        </View>

        <Divider style={styles.cardSeparator} />

        <Button
          label="Change Robot"
          variant="ghost"
          onPress={changeRobot}
          textStyle={styles.changeBtnText}
          style={styles.changeBtn}
        />
      </Card>
    </>
  );

  const navSection = (
    <>
      <SectionHeader title="Navigate To" />
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
    </>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, wideContent]}
      showsVerticalScrollIndicator={false}
    >
      {isWide ? (
        // Wide: robot info + Change Robot in a narrow left column, the navigation
        // targets in the wider right one.
        <View style={styles.wideRow}>
          <View style={styles.wideLeftCol}>{infoSection}</View>
          <View style={styles.wideRightCol}>{navSection}</View>
        </View>
      ) : (
        <>
          {infoSection}
          <View style={styles.narrowGap}>{navSection}</View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // ── Wide two-column layout ──────────────────────────────────────────────────
  // Info + Change Robot on a narrow left column, navigation on the wider right.
  // alignItems flex-start so each column is only as tall as its own content.
  wideRow: {
    flexDirection: "row",
    gap: spacing.lg,
    alignItems: "flex-start",
  },
  wideLeftCol: {
    width: 360,
  },
  wideRightCol: {
    flex: 1,
  },
  narrowGap: { marginTop: spacing.xl },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  centerText: {
    fontSize: 15,
    color: colors.textMuted,
  },

  // ── Robot info ─────────────────────────────────────────────────────────────
  robotRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md + 2,
  },
  // Wide: stack the image above the info and let it span the column width.
  robotRowWide: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: spacing.md,
  },
  imageWrapper: {
    width: 120,
    height: 120,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapperWide: {
    width: "100%",
    height: 200,
  },
  robotImage: {
    width: 120,
    height: 120,
  },
  robotImageWide: {
    width: "100%",
    height: 200,
  },
  robotInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  robotName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  typeBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: radii.sm - 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.accent,
  },
  robotIp: {
    fontSize: 13,
    color: colors.textFaint,
  },
  cardSeparator: {
    marginVertical: 0,
  },
  changeBtn: {
    borderRadius: 0,
    paddingVertical: spacing.md + 1,
  },
  changeBtnText: {
    color: colors.danger,
  },
});
