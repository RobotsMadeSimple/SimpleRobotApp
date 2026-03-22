import { getSelectedRobot } from "@/src/connections/robotState";
import { useRobots } from "@/src/providers/RobotProvider";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import {
  Activity,
  Cpu,
  Gauge,
  Hash,
  Network,
  Server,
  Tag,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react-native";
import { Tabs } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

const robotImages: Record<string, any> = {
  TBot: require("@/assets/images/TBot.png"),
};
const defaultRobotImage = require("@/assets/images/no-robot.png");

// ── Small building blocks ─────────────────────────────────────────────────────

function InfoRow({
  icon,
  iconColor,
  tileBg,
  label,
  value,
  last = false,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  tileBg?: string;
  label: string;
  value: string | number | React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <View style={[styles.rowTile, { backgroundColor: tileBg ?? "#f3f4f6" }]}>
        {icon}
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? (
        <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.statusDot}>
      <View style={[styles.dot, { backgroundColor: ok ? "#16a34a" : "#dc2626" }]} />
      <Text style={[styles.dotLabel, { color: ok ? "#16a34a" : "#dc2626" }]}>{label}</Text>
    </View>
  );
}

function SpeedRow({
  label,
  speed,
  accel,
  decel,
  last = false,
}: {
  label: string;
  speed: number;
  accel: number;
  decel: number;
  last?: boolean;
}) {
  return (
    <View style={[styles.speedRow, !last && styles.infoRowBorder]}>
      <Text style={styles.speedLabel}>{label}</Text>
      <View style={styles.speedValues}>
        <View style={styles.speedChip}>
          <Text style={styles.speedChipKey}>Spd</Text>
          <Text style={styles.speedChipVal}>{speed.toFixed(0)}</Text>
        </View>
        <View style={styles.speedChip}>
          <Text style={styles.speedChipKey}>Acc</Text>
          <Text style={styles.speedChipVal}>{accel.toFixed(0)}</Text>
        </View>
        <View style={styles.speedChip}>
          <Text style={styles.speedChipKey}>Dec</Text>
          <Text style={styles.speedChipVal}>{decel.toFixed(0)}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AboutRobot() {
  const selectedRobot = getSelectedRobot();
  const { robots } = useRobots();
  const status = useRobotStatus();

  const robot =
    robots.find((r) => r.serialNumber === selectedRobot?.serialNumber) ??
    selectedRobot;

  if (!robot) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>No robot selected</Text>
      </View>
    );
  }

  const imageSource = robotImages[robot.robotType] ?? defaultRobotImage;
  const isHoming = status.homingState !== "WaitingForStart";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Tabs.Screen options={{ headerShown: false }} />
      {/* Hero card */}
      <View style={styles.heroCard}>
        <View style={styles.heroImageWrapper}>
          <Image source={imageSource} style={styles.heroImage} resizeMode="contain" />
        </View>
        <Text style={styles.heroName}>{robot.robotName || "Unknown Robot"}</Text>
        {!!robot.robotType && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{robot.robotType}</Text>
          </View>
        )}
      </View>

      {/* Identity */}
      <Text style={styles.sectionLabel}>IDENTITY</Text>
      <View style={styles.card}>
        <InfoRow
          icon={<Tag size={16} color="#2563eb" />}
          tileBg="#eff6ff"
          label="Name"
          value={robot.robotName || "—"}
        />
        <InfoRow
          icon={<Cpu size={16} color="#7c3aed" />}
          tileBg="#f5f3ff"
          label="Type"
          value={robot.robotType || "—"}
        />
        <InfoRow
          icon={<Hash size={16} color="#6b7280" />}
          tileBg="#f9fafb"
          label="Serial Number"
          value={robot.serialNumber || "—"}
          last
        />
      </View>

      {/* Network */}
      <Text style={styles.sectionLabel}>NETWORK</Text>
      <View style={styles.card}>
        <InfoRow
          icon={<Network size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="IP Address"
          value={robot.ipAddress || "—"}
        />
        <InfoRow
          icon={<Server size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="Port"
          value={robot.port}
        />
        <InfoRow
          icon={<Zap size={16} color="#0891b2" />}
          tileBg="#ecfeff"
          label="Endpoint"
          value={`/${robot.controlEndpoint}`}
          last
        />
      </View>

      {/* Live status */}
      <Text style={styles.sectionLabel}>LIVE STATUS</Text>
      <View style={styles.card}>
        <InfoRow
          icon={status.connected ? <Wifi size={16} color="#16a34a" /> : <WifiOff size={16} color="#dc2626" />}
          tileBg={status.connected ? "#f0fdf4" : "#fef2f2"}
          label="Connection"
          value={<StatusDot ok={status.connected} label={status.connected ? "Connected" : "Disconnected"} />}
        />
        <InfoRow
          icon={<Cpu size={16} color={status.driverConnected ? "#16a34a" : "#dc2626"} />}
          tileBg={status.driverConnected ? "#f0fdf4" : "#fef2f2"}
          label="Motor Driver"
          value={<StatusDot ok={status.driverConnected} label={status.driverConnected ? "Online" : "Offline"} />}
        />
        <InfoRow
          icon={<Activity size={16} color={status.wasHomed ? "#16a34a" : "#f97316"} />}
          tileBg={status.wasHomed ? "#f0fdf4" : "#fff7ed"}
          label="Homed"
          value={<StatusDot ok={status.wasHomed} label={status.wasHomed ? "Yes" : "No"} />}
        />
        <InfoRow
          icon={<Gauge size={16} color="#6b7280" />}
          tileBg="#f9fafb"
          label="Homing State"
          value={isHoming ? status.homingState : "Idle"}
          last
        />
      </View>

      {/* Motion parameters */}
      <Text style={styles.sectionLabel}>MOTION PARAMETERS</Text>
      <View style={styles.card}>
        <SpeedRow
          label="Linear (mm/s)"
          speed={status.speedS}
          accel={status.accelS}
          decel={status.decelS}
        />
        <SpeedRow
          label="Joint (°/s)"
          speed={status.speedJ}
          accel={status.accelJ}
          decel={status.decelJ}
          last
        />
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  content: {
    padding: 16,
    paddingBottom: 36,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  centerText: {
    fontSize: 15,
    color: "#6b7280",
  },

  // Hero
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 8,
  },
  heroImageWrapper: {
    width: 110,
    height: 110,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  heroImage: {
    width: 90,
    height: 90,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  typeBadge: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  // Card
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: "hidden",
  },

  // Info row
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  rowTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  infoValue: {
    fontSize: 14,
    color: "#6b7280",
    maxWidth: "45%",
    textAlign: "right",
  },

  // Status dot
  statusDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLabel: {
    fontSize: 13,
    fontWeight: "600",
  },

  // Speed rows
  speedRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 8,
  },
  speedLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  speedValues: {
    flexDirection: "row",
    gap: 8,
  },
  speedChip: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  speedChipKey: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.5,
  },
  speedChipVal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
});
