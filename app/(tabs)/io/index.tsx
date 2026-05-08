import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useNanoIO, useRelayIO, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { NanoState, PinType } from "@/src/models/robotModels";
import {
  CircuitBoard,
  Cpu,
  Radio,
  Settings,
  ToggleLeft,
  ToggleRight,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react-native";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// Config flags — fetched once on mount
// ─────────────────────────────────────────────────────────────────────────────

type IOConfig = {
  enableStbCard:   boolean;
  enableNanoCards: boolean;
  enableRelayCard: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function typeColor(type: PinType) {
  if (type === "Input")    return { fg: "#2563eb", bg: "#eff6ff" };
  if (type === "Output")   return { fg: "#7c3aed", bg: "#f5f3ff" };
  if (type === "Neopixel") return { fg: "#d97706", bg: "#fffbeb" };
  return { fg: "#6b7280", bg: "#f3f4f6" };
}

function typeLabel(type: PinType) {
  if (type === "Input")    return "IN";
  if (type === "Output")   return "OUT";
  if (type === "Neopixel") return "NEO";
  return "—";
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared IO row
// ─────────────────────────────────────────────────────────────────────────────

function IORow({
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
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.typeBadge, { backgroundColor: bg }]}>
        <Text style={[styles.typeBadgeText, { color: fg }]}>{typeLabel(type)}</Text>
      </View>

      <View style={styles.rowInfo}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sublabel}</Text>
      </View>

      {!isOutput && !isNeopixel && (
        <>
          <View style={[styles.dot, value ? styles.dotOn : styles.dotOff]} />
          <View style={[styles.badge, value ? styles.badgeOn : styles.badgeOff]}>
            <Text style={[styles.badgeText, value ? styles.badgeTextOn : styles.badgeTextOff]}>
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
        <View style={styles.neoDots}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.neoDot} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card wrapper
// ─────────────────────────────────────────────────────────────────────────────

function CardHeader({
  icon,
  iconBg,
  name,
  subtitle,
  connected,
  onConfigure,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  subtitle: string;
  connected: boolean;
  onConfigure?: () => void;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{name}</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
      </View>
      <View style={[styles.connBadge, connected ? styles.connOn : styles.connOff]}>
        {connected
          ? <Wifi    size={11} color="#16a34a" />
          : <WifiOff size={11} color="#dc2626" />
        }
        <Text style={[styles.connText, connected ? styles.connTextOn : styles.connTextOff]}>
          {connected ? "Connected" : "Offline"}
        </Text>
      </View>
      {onConfigure && (
        <Pressable style={styles.configBtn} onPress={onConfigure} hitSlop={6}>
          <Settings size={15} color="#6b7280" />
        </Pressable>
      )}
    </View>
  );
}

function PinGroup({
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
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupDot, { backgroundColor: bg, borderColor: fg }]} />
        <Text style={[styles.groupLabel, { color: fg }]}>{label}</Text>
      </View>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STB4100 card
// ─────────────────────────────────────────────────────────────────────────────

function RobotIOBoardCard() {
  const status = useRobotStatus();

  return (
    <View style={styles.card}>
      <CardHeader
        icon={<CircuitBoard size={16} color="#16a34a" />}
        iconBg="#f0fdf4"
        name="Robot IO Board"
        subtitle="STB4100 · USB HID"
        connected={status.driverConnected}
      />

      <PinGroup label="INPUTS" fg="#2563eb" bg="#eff6ff">
        {[
          { label: "Input 1", value: status.input1 },
          { label: "Input 2", value: status.input2 },
          { label: "Input 3", value: status.input3 },
          { label: "Input 4", value: status.input4 },
        ].map((inp, i, arr) => (
          <IORow
            key={inp.label}
            label={inp.label}
            sublabel={`STB4100 · Input ${i + 1}`}
            type="Input"
            value={inp.value}
            last={i === arr.length - 1}
          />
        ))}
      </PinGroup>

      <PinGroup label="OUTPUTS" fg="#7c3aed" bg="#f5f3ff">
        {[
          { label: "Output 1", value: status.output1, idx: 1 },
          { label: "Output 2", value: status.output2, idx: 2 },
          { label: "Output 3", value: status.output3, idx: 3 },
          { label: "Output 4", value: status.output4, idx: 4 },
        ].map((out, i, arr) => (
          <IORow
            key={out.label}
            label={out.label}
            sublabel={`STB4100 · Output ${i + 1}`}
            type="Output"
            value={out.value}
            last={i === arr.length - 1}
            onToggle={() => robotClient.setSTBOutput(out.idx, !out.value)}
          />
        ))}
      </PinGroup>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Arduino Nano card
// ─────────────────────────────────────────────────────────────────────────────

function NanoCard({ nano }: { nano: NanoState }) {
  const inputs    = nano.pins.filter(p => p.type === "Input");
  const outputs   = nano.pins.filter(p => p.type === "Output");
  const neopixels = nano.pins.filter(p => p.type === "Neopixel");

  const groups = [
    { label: "INPUTS",   fg: "#2563eb", bg: "#eff6ff", pins: inputs    },
    { label: "OUTPUTS",  fg: "#7c3aed", bg: "#f5f3ff", pins: outputs   },
    { label: "NEOPIXEL", fg: "#d97706", bg: "#fffbeb", pins: neopixels },
  ].filter(g => g.pins.length > 0);

  return (
    <View style={styles.card}>
      <CardHeader
        icon={<Cpu size={16} color="#4f46e5" />}
        iconBg="#eef2ff"
        name={nano.name}
        subtitle={nano.id}
        connected={nano.connected}
        onConfigure={() =>
          router.push({ pathname: "/(tabs)/io/configure", params: { nanoId: nano.id } })
        }
      />

      {groups.map(g => (
        <PinGroup key={g.label} label={g.label} fg={g.fg} bg={g.bg}>
          {g.pins.map((pin, i) => (
            <IORow
              key={pin.pin}
              label={pin.name || `Pin ${pin.pin}`}
              sublabel={`${nano.name} · D${pin.pin}`}
              type={pin.type}
              value={pin.value}
              last={i === g.pins.length - 1}
              onToggle={
                pin.type === "Output"
                  ? () => robotClient.setNanoOutput(nano.id, pin.pin, !pin.value)
                  : undefined
              }
            />
          ))}
        </PinGroup>
      ))}

      {nano.pins.length === 0 && (
        <Text style={styles.emptyCard}>
          No pins configured — tap the settings icon to set up this board.
        </Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USB Relay card
// ─────────────────────────────────────────────────────────────────────────────

function UsbRelayCard() {
  const relay = useRelayIO();
  const connected = relay?.connected ?? false;
  const relays    = relay?.relays ?? [false, false, false, false];
  const serial    = relay?.serial ?? "";

  return (
    <View style={styles.card}>
      <CardHeader
        icon={<Radio size={16} color="#0891b2" />}
        iconBg="#ecfeff"
        name="USB Relay Board"
        subtitle={`DCTTECH 4CH · HID${serial ? ` · ${serial}` : ""}`}
        connected={connected}
      />

      <PinGroup label="RELAYS" fg="#0891b2" bg="#ecfeff">
        {[0, 1, 2, 3].map((i) => (
          <IORow
            key={i}
            label={`Relay ${i + 1}`}
            sublabel={`Channel ${i + 1}`}
            type="Output"
            value={relays[i] ?? false}
            last={i === 3}
            onToggle={() => robotClient.setRelay(i + 1, !(relays[i] ?? false))}
          />
        ))}
      </PinGroup>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function IoPage() {
  const nanos = useNanoIO();
  const [ioConfig, setIoConfig] = useState<IOConfig | null>(null);

  useEffect(() => {
    robotClient.getRobotConfig()
      .then(cfg => setIoConfig({
        enableStbCard:   cfg.enableStbCard   ?? true,
        enableNanoCards: cfg.enableNanoCards ?? true,
        enableRelayCard: cfg.enableRelayCard ?? false,
      }))
      .catch(() => setIoConfig({ enableStbCard: true, enableNanoCards: true, enableRelayCard: false }));
  }, []);

  const showStb   = ioConfig?.enableStbCard   ?? true;
  const showNanos = ioConfig?.enableNanoCards  ?? true;
  const showRelay = ioConfig?.enableRelayCard  ?? false;

  const hasAnything = showStb || (showNanos && nanos.length > 0) || showRelay;

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {showStb   && <RobotIOBoardCard />}
        {showNanos && nanos.map(nano => <NanoCard key={nano.id} nano={nano} />)}
        {showRelay && <UsbRelayCard />}

        {!hasAnything && (
          <View style={styles.emptyState}>
            <Zap size={22} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No IO Cards Enabled</Text>
            <Text style={styles.emptyBody}>
              Enable IO cards in Robot → Configure to see them here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content:   { padding: 16, paddingBottom: 40, gap: 16 },

  // ── Card shell ─────────────────────────────────────────────────────────────
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

  // ── Card header ────────────────────────────────────────────────────────────
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

  // ── Pin group ──────────────────────────────────────────────────────────────
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

  // ── IO row ─────────────────────────────────────────────────────────────────
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

  // ── Input indicator ────────────────────────────────────────────────────────
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

  // ── Neopixel preview ───────────────────────────────────────────────────────
  neoDots:  { flexDirection: "row", gap: 3 },
  neoDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fbbf24", opacity: 0.5 },

  // ── Empty states ───────────────────────────────────────────────────────────
  emptyCard: { fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 16 },
  emptyState: { marginTop: 20, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  emptyBody:  {
    fontSize: 13, color: "#9ca3af",
    textAlign: "center", paddingHorizontal: 32, lineHeight: 20,
  },
});
