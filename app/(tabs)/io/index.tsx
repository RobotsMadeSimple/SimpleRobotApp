import {
  NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { useNanoIO,
  useRelayIO,
  useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { AuxDeviceState,
  CameraState } from "@/src/models/robotModels";
import {
  Camera,
  CircuitBoard,
  Cpu,
  Gauge,
  Plus,
  Radio,
  Wifi,
  WifiOff,
  X,
  } from "lucide-react-native";
import { router, useFocusEffect } from "expo-router";
import React,
  { useCallback,
  useEffect,
  useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { CameraCalibrationControls } from "@/src/components/ui/calibration/CameraCalibrationControls";

import {
  Button,
  Card,
  colors,
  Divider,
  InfoTip,
  ListRow,
  radii,
  PageHeader,
  Screen,
  SectionHeader,
  shadows,
  spacing,
  StatTile,
  StatusPill,
  type,
} from "@/src/components/ui/kit";

// ── IOConfig type ─────────────────────────────────────────────────────────────

type IOConfig = {
  enableStbCard:   boolean;
  enableNanoCards: boolean;
  enableRelayCard: boolean;
  enableAuxAxis:   boolean;
  enableCameras:   boolean;
};

// ── DeviceNavCard ─────────────────────────────────────────────────────────────

function DeviceNavCard({
  icon,
  iconBg,
  name,
  subtitle,
  connected,
  onPress,
  onDelete,
  footer,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  subtitle: string;
  connected: boolean;
  onPress: () => void;
  onDelete?: () => void;
  /** Extra strip under the row (camera calibration); turns the card into Card + flat row. */
  footer?: React.ReactNode;
}) {
  const row = (
    <ListRow
      card={!footer}
      style={footer ? styles.rowInCard : undefined}
      title={name}
      subtitle={subtitle}
      icon={icon}
      iconColor={iconBg}
      onPress={onPress}
      chevron
      right={
        <View style={styles.rowAccessories}>
          <StatusPill
            label={connected ? "Connected" : "Offline"}
            tone={connected ? "success" : "danger"}
            dot
          />
          {onDelete && <DeleteIconButton onPress={onDelete} style={styles.deleteBtn} />}
        </View>
      }
    />
  );
  if (!footer) return row;
  return <Card padded={false}>{row}{footer}</Card>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IoPage() {
  const nanos  = useNanoIO();
  const relay  = useRelayIO();
  const status = useRobotStatus();

  const [ioConfig,    setIoConfig]    = useState<IOConfig | null>(null);
  const [auxDevices,  setAuxDevices]  = useState<AuxDeviceState[]>([]);
  const [cameras,     setCameras]     = useState<CameraState[]>([]);
  const [addModal,    setAddModal]    = useState(false);
  const [enabling,    setEnabling]    = useState<keyof IOConfig | null>(null);

  useFocusEffect(
    useCallback(() => {
      robotClient.getRobotConfig()
        .then(cfg => setIoConfig({
          enableStbCard:   cfg.enableStbCard   ?? true,
          enableNanoCards: cfg.enableNanoCards ?? false,
          enableRelayCard: cfg.enableRelayCard ?? false,
          enableAuxAxis:   cfg.enableAuxAxis   ?? false,
          enableCameras:   cfg.enableCameras   ?? false,
        }))
        .catch(() => setIoConfig({
          enableStbCard: true, enableNanoCards: false,
          enableRelayCard: false, enableAuxAxis: false, enableCameras: false,
        }));
      robotClient.getCameras().catch(() => {});
      // Refresh Nano + relay state so the IO summary cards reflect outputs a
      // running program changed, not the stale state from the last app action.
      robotClient.getIO().catch(() => {});
    }, [])
  );

  useEffect(() => {
    robotClient.getAuxState().catch(() => {});
    const unsub = robotClient.onAuxAxis(devices => setAuxDevices(devices));
    // Aux state isn't in the status poll; refresh so the card reflects the
    // device coming online (and enable state) without a manual reload.
    const poll = setInterval(() => robotClient.getAuxState().catch(() => {}), 2000);
    return () => { unsub(); clearInterval(poll); };
  }, []);

  useEffect(() => {
    const unsub = robotClient.onCameras(cams => setCameras(cams));
    const poll  = setInterval(() => robotClient.getCameras().catch(() => {}), 3000);
    return () => { unsub(); clearInterval(poll); };
  }, []);

  const enableDeviceType = async (field: keyof IOConfig) => {
    if (!ioConfig || enabling) return;
    setEnabling(field);
    try {
      await robotClient.setRobotConfig({ [field]: true });
      setIoConfig(prev => prev ? { ...prev, [field]: true } : prev);
    } finally {
      setEnabling(null);
    }
  };

  const confirmRemove = (label: string, onConfirm: () => void) => {
    appAlert(
      "Remove Device",
      `Remove "${label}" from the IO panel?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: onConfirm },
      ]
    );
  };

  const disableDeviceType = (field: keyof IOConfig) => {
    robotClient.setRobotConfig({ [field]: false }).catch(() => {});
    setIoConfig(prev => prev ? { ...prev, [field]: false } : prev);
  };

  type AddableType = {
    field: keyof IOConfig;
    icon: React.ReactNode;
    iconBg: string;
    name: string;
    subtitle: string;
    onAdd: () => void;
  };

  // Device types the user can add — only shown if not yet enabled
  // (cameras are always offered since you can have multiple instances)
  const allDeviceTypes: AddableType[] = [
    {
      field: "enableNanoCards",
      icon: <Cpu size={20} color="#4f46e5" />,
      iconBg: "#eef2ff",
      name: "Arduino Nano Device",
      subtitle: "Serial-connected microcontroller",
      onAdd: async () => {
        await enableDeviceType("enableNanoCards");
        setAddModal(false);
      },
    },
    {
      field: "enableRelayCard",
      icon: <Radio size={20} color="#0891b2" />,
      iconBg: "#ecfeff",
      name: "USB Relay Board",
      subtitle: "DCTTECH 4CH · HID",
      onAdd: async () => {
        await enableDeviceType("enableRelayCard");
        setAddModal(false);
      },
    },
    {
      field: "enableAuxAxis",
      icon: <Gauge size={20} color="#7c3aed" />,
      iconBg: "#ede9fe",
      name: "Aux Stepper Axis",
      subtitle: "External stepper driver",
      onAdd: async () => {
        await enableDeviceType("enableAuxAxis");
        setAddModal(false);
      },
    },
    {
      field: "enableCameras",
      icon: <Camera size={20} color={colors.accent} />,
      iconBg: colors.accentSoft,
      name: "USB Camera",
      subtitle: "USB camera device",
      onAdd: () => {
        setAddModal(false);
        if (!ioConfig?.enableCameras) {
          robotClient.setRobotConfig({ enableCameras: true }).catch(() => {});
          setIoConfig(prev => prev ? { ...prev, enableCameras: true } : prev);
        }
        router.push({ pathname: "/(tabs)/io/cameras", params: { addNew: "1" } });
      },
    },
  ];

  // Show each type unless it's already enabled (except cameras, which can have multiple instances)
  const addableTypes = allDeviceTypes.filter(
    t => !ioConfig?.[t.field as keyof IOConfig] || t.field === "enableCameras"
  );

  // Devices online/offline summary — STB4100 is always present; the rest only
  // count once their device type is enabled, mirroring the cards rendered below.
  const connectionFlags = ioConfig ? [
    status.driverConnected,
    ...(ioConfig.enableNanoCards ? nanos.map(n => n.connected) : []),
    ...(ioConfig.enableRelayCard ? [relay?.connected ?? false] : []),
    ...(ioConfig.enableAuxAxis ? auxDevices.map(d => d.connected) : []),
    ...(ioConfig.enableCameras ? cameras.map(c => c.connected) : []),
  ] : [];
  const totalDevices   = connectionFlags.length;
  const onlineDevices  = connectionFlags.filter(Boolean).length;
  const offlineDevices = totalDevices - onlineDevices;

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <PageHeader title="I/O" subtitle="Connected devices, pins, and peripherals" />

      <Screen>
        {ioConfig && (
          <View style={styles.statRow}>
            <StatTile label="Devices" value={totalDevices} icon={CircuitBoard} style={styles.statTile} />
            <StatTile label="Online" value={onlineDevices} icon={Wifi}
                      tint={[colors.success, colors.successSoft]} style={styles.statTile} />
            <StatTile label="Offline" value={offlineDevices} icon={WifiOff}
                      tint={[colors.danger, colors.dangerSoft]} style={styles.statTile} />
          </View>
        )}

        <SectionHeader
          title="Devices"
          right={<InfoTip text="STB4100 is the robot's built-in I/O board and is always available. Add Nano boards, a relay board, aux stepper axes, or cameras for extra I/O — each becomes its own card below." />}
        />

        {/* STB4100 — always visible, 1 card */}
        <DeviceNavCard
          icon={<CircuitBoard size={20} color={colors.success} />}
          iconBg={colors.successSoft}
          name="STB4100"
          subtitle="STB4100 · USB HID"
          connected={status.driverConnected}
          onPress={() => router.push("/(tabs)/io/stb")}
        />

        {/* One card per Nano device */}
        {ioConfig?.enableNanoCards && nanos.map((nano, idx) => (
          <DeviceNavCard
            key={nano.id}
            icon={<Cpu size={20} color="#4f46e5" />}
            iconBg="#eef2ff"
            name={nano.name}
            subtitle={nano.name}
            connected={nano.connected}
            onPress={() => router.push({ pathname: "/(tabs)/io/nanos", params: { nanoId: nano.id } })}
            onDelete={idx === 0 ? () => confirmRemove("Arduino Nano Devices", () => disableDeviceType("enableNanoCards")) : undefined}
          />
        ))}

        {/* Relay board — 1 card */}
        {ioConfig?.enableRelayCard && (
          <DeviceNavCard
            icon={<Radio size={20} color="#0891b2" />}
            iconBg="#ecfeff"
            name="USB Relay Board"
            subtitle="DCTTECH 4CH · HID"
            connected={relay?.connected ?? false}
            onPress={() => router.push("/(tabs)/io/relay")}
            onDelete={() => confirmRemove("USB Relay Board", () => disableDeviceType("enableRelayCard"))}
          />
        )}

        {/* One card per aux device */}
        {ioConfig?.enableAuxAxis && auxDevices.map((dev, idx) => (
          <DeviceNavCard
            key={dev.deviceId}
            icon={<Gauge size={20} color="#7c3aed" />}
            iconBg="#ede9fe"
            name={dev.deviceName}
            subtitle={`${dev.deviceId}${dev.portName ? ` · ${dev.portName}` : ""}`}
            connected={dev.connected}
            onPress={() => router.push({ pathname: "/(tabs)/io/auxiliary", params: { deviceId: dev.deviceId } })}
            onDelete={idx === 0 ? () => confirmRemove("Aux Stepper Axes", () => disableDeviceType("enableAuxAxis")) : undefined}
          />
        ))}

        {/* One card per camera */}
        {ioConfig?.enableCameras && cameras.map(cam => (
          <DeviceNavCard
            key={cam.id}
            icon={<Camera size={20} color={colors.accent} />}
            iconBg={colors.accentSoft}
            name={cam.name}
            subtitle={`Device ${cam.deviceIndex} · ${cam.width}×${cam.height} · ${cam.targetFps}fps`}
            connected={cam.connected}
            onPress={() => router.push({ pathname: "/(tabs)/io/cameras", params: { cameraId: cam.id } })}
            onDelete={() => confirmRemove(cam.name, () => robotClient.removeCamera(cam.id).catch(() => {}))}
            footer={<CameraCalibrationControls camera={cam} layout="footer" />}
          />
        ))}

        {/* Add Device button */}
        <Button
          variant="dashed"
          label="Add Device"
          icon={<Plus size={15} color={colors.accent} />}
          onPress={() => setAddModal(true)}
        />
      </Screen>

      {/* Add Device — centered modal */}
      <Modal
        visible={addModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAddModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Device</Text>
              <TouchableOpacity onPress={() => setAddModal(false)} hitSlop={8}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select a device type to add to this controller.
            </Text>

            {addableTypes.length === 0 ? (
              <View style={styles.allAddedRow}>
                <Text style={styles.allAddedText}>All device types are already added.</Text>
              </View>
            ) : (
              addableTypes.map((devType, idx, arr) => {
                const busy = enabling === devType.field;
                return (
                  <View key={devType.field}>
                    <ListRow
                      card={false}
                      title={devType.name}
                      subtitle={devType.subtitle}
                      icon={devType.icon}
                      iconColor={devType.iconBg}
                      onPress={devType.onAdd}
                      chevron={!busy}
                      right={busy ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
                    />
                    {idx < arr.length - 1 && <Divider inset />}
                  </View>
                );
              })
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  statRow:  { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statTile: { flex: 1, minWidth: 130 },

  rowAccessories: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  // ListRow's own card padding, for the flat row inside a camera card with a footer.
  rowInCard: { paddingHorizontal: spacing.lg - 2, paddingTop: spacing.lg - 2, paddingBottom: spacing.md },
  deleteBtn: { padding: spacing.xs + 2, marginLeft: 0 },

  // ── Add Device modal ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    width: "100%",
    maxWidth: 400,
    padding: spacing.lg + 4,
    ...shadows.raised,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  modalTitle:    type.pageTitle,
  modalSubtitle: { ...type.subtitle, marginBottom: spacing.md, lineHeight: 18 },

  allAddedRow: { paddingVertical: spacing.lg, alignItems: "center" },
  allAddedText: { fontSize: 14, color: colors.textFaint },
});
