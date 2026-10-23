import {
  NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { useConnected,
  useIoDevices,
  useRelayIO,
  useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { AuxDeviceState,
  CameraState,
  DeviceState } from "@/src/models/robotModels";
import {
  Camera,
  CircuitBoard,
  Cpu,
  Gauge,
  Plus,
  Radio,
  Smartphone,
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
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { appAlert } from "@/src/components/ui/AppAlert";
import { CameraCalibrationControls } from "@/src/components/ui/calibration/CameraCalibrationControls";
import { cameraSourceSummary, cameraSourceTag, isPhoneCamera } from "@/src/components/ui/camera/cameraSource";
import { DEFAULT_PHONE_DEVICE_NAME } from "@/src/components/provider/providerUtil";

import {
  Button,
  Card,
  colors,
  Divider,
  InfoTip,
  Input,
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
  enableIoDevices: boolean;
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
  tag,
  statusPill,
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
  /** Small source tag before the status pill ("RTSP" / "HTTP" network cameras). */
  tag?: string | null;
  /** Replaces the Connected/Offline pill (e.g. the Plugins summary). */
  statusPill?: React.ReactNode;
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
          {!!tag && <StatusPill label={tag} tone="accent" />}
          {statusPill ?? (
            <StatusPill
              label={connected ? "Connected" : "Offline"}
              tone={connected ? "success" : "danger"}
              dot
            />
          )}
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
  const ioDevices  = useIoDevices();
  const relay  = useRelayIO();
  const status = useRobotStatus();

  const [ioConfig,    setIoConfig]    = useState<IOConfig | null>(null);
  const [auxDevices,  setAuxDevices]  = useState<AuxDeviceState[]>([]);
  const [cameras,     setCameras]     = useState<CameraState[]>([]);
  const [devices,     setDevices]     = useState<DeviceState[]>([]);
  const [addModal,    setAddModal]    = useState(false);
  const [enabling,    setEnabling]    = useState<keyof IOConfig | null>(null);
  // Add-Device modal → "Phone" opens a name step (set up the device; a phone links to it later).
  const [phoneNameStep, setPhoneNameStep] = useState(false);
  const [phoneName,     setPhoneName]     = useState(DEFAULT_PHONE_DEVICE_NAME);

  // Which cards to show comes from the robot config. Load it when the tab gains
  // focus AND whenever the connection comes up: if the controller starts while
  // this tab is already open, the focus-time request has failed and would
  // otherwise leave the page on the offline defaults until the user navigated away.
  const connected = useConnected();
  const loadIoPage = useCallback(() => {
    if (!connected) {
      setIoConfig(cfg => cfg ?? {
        enableStbCard: true, enableIoDevices: false,
        enableRelayCard: false, enableAuxAxis: false, enableCameras: false,
      });
      return;
    }
    robotClient.getRobotConfig()
      .then(cfg => setIoConfig({
        enableStbCard:   cfg.enableStbCard   ?? true,
        enableIoDevices: cfg.enableIoDevices ?? false,
        enableRelayCard: cfg.enableRelayCard ?? false,
        enableAuxAxis:   cfg.enableAuxAxis   ?? false,
        enableCameras:   cfg.enableCameras   ?? false,
      }))
      .catch(() => {});
    robotClient.getCameras().catch(() => {});
    robotClient.getAuxState().catch(() => {});
    // Refresh Nano + relay state so the IO summary cards reflect outputs a
    // running program changed, not the stale state from the last app action.
    robotClient.getIO().catch(() => {});
  }, [connected]);

  useFocusEffect(loadIoPage);
  useEffect(() => { loadIoPage(); }, [loadIoPage]);

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

  // The phone shows up as ONE "This phone" IO device (camera + sensors), fed by the provider
  // screen. Devices have no live-push topic, so poll GetDevices (no-op on older controllers).
  useEffect(() => {
    robotClient.getDevices().then(setDevices).catch(() => {});
    const poll = setInterval(() => robotClient.getDevices().then(setDevices).catch(() => {}), 3000);
    return () => clearInterval(poll);
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
      field: "enableIoDevices",
      icon: <Cpu size={20} color="#4f46e5" />,
      iconBg: "#eef2ff",
      name: "Arduino Nano Device",
      subtitle: "Serial-connected microcontroller",
      onAdd: async () => {
        await enableDeviceType("enableIoDevices");
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
      name: "Camera",
      subtitle: "USB or network (RTSP / HTTP) camera",
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

  // A phone device is an all-encompassing IO device (camera + sensors). It's set up here (from any
  // phone/tablet/web) as a named entry; a phone then *links* to it from the device card to become
  // its provider. Every DeviceManager device is a phone/client device. Its backing
  // "phone" camera is surfaced through the device, never as a standalone card in the Cameras list.
  const phoneDevices   = devices;
  const visibleCameras = cameras.filter(c => !isPhoneCamera(c));

  // The phone this device is assigned to provide from (stored in the device's providerConfig blob),
  // for display. null = not linked to any phone yet.
  const assignedPhoneName = (dev: DeviceState): string | null => {
    try {
      const p = JSON.parse(dev.providerConfig ?? "");
      return typeof p?.assignedPhoneName === "string" && p.assignedPhoneName ? p.assignedPhoneName : null;
    } catch { return null; }
  };
  // A phone device is "live" when its channels are fresh OR its backing camera is streaming — a
  // camera-only WebRTC stream pushes no channels, so the device's own freshness alone reads as Offline.
  const phoneDeviceLive = (dev: DeviceState): boolean =>
    dev.connected || cameras.some(c => isPhoneCamera(c) && c.name === dev.name && c.connected);

  // Create a named phone device (setup only — no streaming starts until a phone links to it).
  const createPhoneDevice = async (name: string) => {
    const trimmed = name.trim() || DEFAULT_PHONE_DEVICE_NAME;
    await robotClient.addDevice(trimmed).catch(() => {});
    robotClient.getDevices().then(setDevices).catch(() => {});
  };

  // Open the provider for a device so THIS phone starts feeding it (the "link" step).
  const linkThisPhoneTo = (dev: DeviceState) => {
    router.push({ pathname: "/(tabs)/io/phone-provider", params: { deviceId: dev.id, name: dev.name } });
  };

  const removePhoneDevice = (dev: DeviceState) => {
    robotClient.removeDevice(dev.id).catch(() => {});
    // Also remove the backing phone camera this device owns (named after the device), so nothing is orphaned.
    const cam = cameras.find(c => isPhoneCamera(c) && c.name === dev.name);
    if (cam) robotClient.removeCamera(cam.id).catch(() => {});
    setDevices(prev => prev.filter(d => d.id !== dev.id));
  };

  const closeAddModal = () => {
    setAddModal(false);
    setPhoneNameStep(false);
    setPhoneName(DEFAULT_PHONE_DEVICE_NAME);
  };

  const addPhoneDevice = async () => {
    const name = phoneName;
    closeAddModal();
    await createPhoneDevice(name);
  };

  // An aux-stepper device's spare-pin IO rides the same ioDevices stream, but it is shown
  // inside that device's Aux Stepper screen (not as its own card here), so exclude it from
  // the generic IO-device cards and the count.
  const auxIds = new Set(auxDevices.map(d => d.deviceId));
  const nanoDevices = ioDevices.filter(n => !auxIds.has(n.id));

  // Devices online/offline summary — STB4100 is always present; the rest only
  // count once their device type is enabled, mirroring the cards rendered below.
  const connectionFlags = ioConfig ? [
    status.driverConnected,
    ...(ioConfig.enableIoDevices ? nanoDevices.map(n => n.connected) : []),
    ...(ioConfig.enableRelayCard ? [relay?.connected ?? false] : []),
    ...(ioConfig.enableAuxAxis ? auxDevices.map(d => d.connected) : []),
    ...(ioConfig.enableCameras ? visibleCameras.map(c => c.connected) : []),
    ...phoneDevices.map(phoneDeviceLive),
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

        {/* One card per Nano device (aux-stepper spare-pin IO is shown under its Aux card) */}
        {ioConfig?.enableIoDevices && nanoDevices.map((nano, idx) => (
          <DeviceNavCard
            key={nano.id}
            icon={<Cpu size={20} color="#4f46e5" />}
            iconBg="#eef2ff"
            name={nano.name}
            subtitle={nano.name}
            connected={nano.connected}
            onPress={() => router.push({ pathname: "/(tabs)/io/nanos", params: { deviceId: nano.id } })}
            onDelete={idx === 0 ? () => confirmRemove("Arduino Nano Devices", () => disableDeviceType("enableIoDevices")) : undefined}
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

        {/* One card per phone IO device (camera + sensors). Tapping links THIS phone as the
            provider; a device set up on one phone can be linked from another. */}
        {phoneDevices.map(dev => {
          const live = phoneDeviceLive(dev);
          const provider = assignedPhoneName(dev);
          const subtitle = provider
            ? (live ? `Provided by ${provider} · streaming` : `Provided by ${provider}`)
            : "Not linked — open to assign a phone";
          return (
            <DeviceNavCard
              key={dev.id}
              icon={<Smartphone size={20} color={colors.accent} />}
              iconBg={colors.accentSoft}
              name={dev.name}
              subtitle={subtitle}
              connected={live}
              onPress={() => linkThisPhoneTo(dev)}
              onDelete={() => confirmRemove(dev.name, () => removePhoneDevice(dev))}
            />
          );
        })}

        {/* One card per camera (phone cameras excluded — they live under the phone device) */}
        {ioConfig?.enableCameras && visibleCameras.map(cam => (
          <DeviceNavCard
            key={cam.id}
            icon={<Camera size={20} color={colors.accent} />}
            iconBg={colors.accentSoft}
            name={cam.name}
            subtitle={`${cameraSourceSummary(cam)} · ${cam.targetFps}fps`}
            tag={cameraSourceTag(cam)}
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
        <KeyboardAvoidingView
          style={styles.modalOuter}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
        <Pressable style={styles.modalOverlay} onPress={() => setAddModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{phoneNameStep ? "Set up a phone" : "Add Device"}</Text>
              <TouchableOpacity onPress={closeAddModal} hitSlop={8}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {phoneNameStep ? (
              <>
                <Text style={styles.modalSubtitle}>
                  Name this phone device. Set it up here, then open it on any phone to stream that
                  phone&apos;s camera & sensors — the phone that links can be a different one.
                </Text>
                <Input
                  value={phoneName}
                  onChangeText={setPhoneName}
                  placeholder={DEFAULT_PHONE_DEVICE_NAME}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={addPhoneDevice}
                />
                <View style={styles.modalButtons}>
                  <Button label="Back" variant="secondary" style={styles.modalBtnFlex} onPress={() => setPhoneNameStep(false)} />
                  <Button label="Add" style={styles.modalBtnFlex} onPress={addPhoneDevice} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalSubtitle}>
                  Select a device type to add to this controller.
                </Text>
                {addableTypes.map((devType) => {
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
                      <Divider inset />
                    </View>
                  );
                })}

                {/* A phone IO device (camera + sensors). Multiple are allowed, and the phone that
                    links as provider can be a different one than set it up here. */}
                <ListRow
                  card={false}
                  title="Phone"
                  subtitle="Camera & sensors — streamed from a phone"
                  icon={<Smartphone size={20} color={colors.accent} />}
                  iconColor={colors.accentSoft}
                  onPress={() => { setPhoneName(DEFAULT_PHONE_DEVICE_NAME); setPhoneNameStep(true); }}
                  chevron
                />
              </>
            )}
            </ScrollView>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
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
  modalOuter: { flex: 1 },
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
    maxHeight: "85%",
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

  // Phone set-up step (name entry) buttons.
  modalButtons: { flexDirection: "row", gap: spacing.sm + 2, marginTop: spacing.md },
  modalBtnFlex: { flex: 1 },

  allAddedRow: { paddingVertical: spacing.lg, alignItems: "center" },
  allAddedText: { fontSize: 14, color: colors.textFaint },
});
