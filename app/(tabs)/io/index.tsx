import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useNanoIO, useRelayIO, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { AuxDeviceState, CameraState } from "@/src/models/robotModels";
import {
  Camera,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Gauge,
  Plus,
  Radio,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  subtitle: string;
  connected: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.navCardIcon, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={styles.navCardBody}>
        <Text style={styles.navCardName}>{name}</Text>
        <Text style={styles.navCardSub}>{subtitle}</Text>
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
      {onDelete && (
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={8}
          style={styles.deleteBtn}
        >
          <Trash2 size={16} color="#ef4444" />
        </TouchableOpacity>
      )}
      <ChevronRight size={18} color="#9ca3af" />
    </TouchableOpacity>
  );
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
    Alert.alert(
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
      icon: <Cpu size={22} color="#4f46e5" />,
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
      icon: <Radio size={22} color="#0891b2" />,
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
      icon: <Gauge size={22} color="#7c3aed" />,
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
      icon: <Camera size={22} color="#2563eb" />,
      iconBg: "#eff6ff",
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

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* STB4100 — always visible, 1 card */}
        <DeviceNavCard
          icon={<CircuitBoard size={22} color="#16a34a" />}
          iconBg="#f0fdf4"
          name="STB4100"
          subtitle="STB4100 · USB HID"
          connected={status.driverConnected}
          onPress={() => router.push("/(tabs)/io/stb")}
        />

        {/* One card per Nano device */}
        {ioConfig?.enableNanoCards && nanos.map((nano, idx) => (
          <DeviceNavCard
            key={nano.id}
            icon={<Cpu size={22} color="#4f46e5" />}
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
            icon={<Radio size={22} color="#0891b2" />}
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
            icon={<Gauge size={22} color="#7c3aed" />}
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
            icon={<Camera size={22} color="#2563eb" />}
            iconBg="#eff6ff"
            name={cam.name}
            subtitle={`Device ${cam.deviceIndex} · ${cam.width}×${cam.height} · ${cam.targetFps}fps`}
            connected={cam.connected}
            onPress={() => router.push({ pathname: "/(tabs)/io/cameras", params: { cameraId: cam.id } })}
            onDelete={() => confirmRemove(cam.name, () => robotClient.removeCamera(cam.id).catch(() => {}))}
          />
        ))}

        {/* Add Device button */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddModal(true)}>
          <Plus size={15} color="#2563eb" />
          <Text style={styles.addBtnText}>Add Device</Text>
        </TouchableOpacity>
      </ScrollView>

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
                <X size={20} color="#6b7280" />
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
              addableTypes.map((type, idx, arr) => {
                const busy = enabling === type.field;
                return (
                  <TouchableOpacity
                    key={type.field}
                    style={[styles.typeRow, idx < arr.length - 1 && styles.typeRowBorder]}
                    onPress={type.onAdd}
                    activeOpacity={0.7}
                    disabled={!!enabling}
                  >
                    <View style={[styles.typeIcon, { backgroundColor: type.iconBg }]}>
                      {type.icon}
                    </View>
                    <View style={styles.typeRowBody}>
                      <Text style={styles.typeRowName}>{type.name}</Text>
                      <Text style={styles.typeRowSub}>{type.subtitle}</Text>
                    </View>
                    {busy
                      ? <ActivityIndicator size="small" color="#2563eb" />
                      : <ChevronRight size={18} color="#9ca3af" />
                    }
                  </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content:   { padding: 16, paddingBottom: 40, gap: 10 },

  // ── Nav cards ──────────────────────────────────────────────────────────────
  navCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  navCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  navCardBody: { flex: 1 },
  navCardName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  navCardSub:  { fontSize: 12, color: "#9ca3af", marginTop: 2 },

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

  deleteBtn: {
    padding: 6,
    marginLeft: 4,
  },

  // ── Add Device button ──────────────────────────────────────────────────────
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
    backgroundColor: "#f0f9ff",
    marginTop: 4,
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },

  // ── Add Device modal ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    width: "100%",
    maxWidth: 400,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginBottom: 12,
    lineHeight: 18,
  },

  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  typeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f3f4f6",
  },
  typeIcon: {
    width: 44, height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  typeRowBody: { flex: 1 },
  typeRowName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  typeRowSub:  { fontSize: 12, color: "#9ca3af", marginTop: 2 },

  allAddedRow: { paddingVertical: 16, alignItems: "center" },
  allAddedText: { fontSize: 14, color: "#9ca3af" },
});
