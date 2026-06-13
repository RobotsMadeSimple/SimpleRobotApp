import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { JogButton } from "@/src/components/ui/JogButton";
import { useNanoIO, useRelayIO, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { AuxAxisChannelState, AuxDeviceState, CameraState, NanoState, PinType, auxUnitLabel } from "@/src/models/robotModels";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Gauge,
  Plus,
  Radio,
  Settings,
  Settings2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// Config flags — fetched once on mount
// ─────────────────────────────────────────────────────────────────────────────

type IOConfig = {
  enableStbCard:   boolean;
  enableNanoCards: boolean;
  enableRelayCard: boolean;
  enableAuxAxis:   boolean;
  enableCameras:   boolean;
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
      {actions}
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
  const relay     = useRelayIO();
  const connected = relay?.connected ?? false;
  const relays    = relay?.relays ?? [false, false, false, false];
  const names     = relay?.names  ?? ["Relay 1", "Relay 2", "Relay 3", "Relay 4"];
  const serial    = relay?.serial ?? "";

  return (
    <View style={styles.card}>
      <CardHeader
        icon={<Radio size={16} color="#0891b2" />}
        iconBg="#ecfeff"
        name="USB Relay Board"
        subtitle={`DCTTECH 4CH · HID${serial ? ` · ${serial}` : ""}`}
        connected={connected}
        onConfigure={() => router.push("/(tabs)/io/configure-relay")}
      />

      <PinGroup label="RELAYS" fg="#0891b2" bg="#ecfeff">
        {[0, 1, 2, 3].map((i) => (
          <IORow
            key={i}
            label={names[i] ?? `Relay ${i + 1}`}
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
// Aux Axis card
// ─────────────────────────────────────────────────────────────────────────────

const AUX_JOG_VELOCITY = 800;
const AUX_JOG_ACCEL    = 3200;
const AUX_JOG_DECEL    = 5000;

function AuxJogButton({
  deviceId,
  axisIndex,
  direction,
}: {
  deviceId: string;
  axisIndex: number;
  direction: 1 | -1;
}) {
  const startJog = () =>
    robotClient.jogAux({
      deviceId,
      axis:     axisIndex,
      velocity: AUX_JOG_VELOCITY * direction,
      accel:    AUX_JOG_ACCEL,
    });

  const stopJog = () =>
    robotClient.jogAux({ deviceId, axis: axisIndex, velocity: 0, decel: AUX_JOG_DECEL });

  return (
    <JogButton
      label={direction === -1 ? "−" : "+"}
      icon={
        direction === -1
          ? <ChevronLeft  size={26} color="#7c3aed" />
          : <ChevronRight size={26} color="#7c3aed" />
      }
      iconPosition={direction === -1 ? "left" : "right"}
      onStart={startJog}
      onStop={stopJog}
      size={64}
    />
  );
}

function AuxAxisConfigModal({
  deviceId,
  axis,
  onClose,
}: {
  deviceId: string;
  axis: AuxAxisChannelState;
  onClose: () => void;
}) {
  const [name,           setName]           = useState(axis.name);
  const [axisType,       setAxisType]       = useState(axis.axisType || "");
  const [stepsPerRev,    setStepsPerRev]    = useState(String(axis.stepsPerRev || 1600));
  const [gearRatio,      setGearRatio]      = useState(String(axis.gearRatio ?? 1));
  const [mmPerRev,       setMmPerRev]       = useState(String(axis.mmPerRev ?? 0));
  const [invertDir,      setInvertDir]      = useState(axis.invertDirection ?? false);
  const [saving,         setSaving]         = useState(false);

  const save = async () => {
    setSaving(true);
    await robotClient.setAuxAxisConfig({
      deviceId,
      axisIndex:      axis.axisIndex,
      name:           name.trim(),
      stepsPerRev:    parseInt(stepsPerRev)  || 1600,
      invertDirection: invertDir,
      axisType,
      gearRatio:      parseFloat(gearRatio)  || 1,
      mmPerRev:       parseFloat(mmPerRev)   || 0,
    });
    // Refresh state so the card reflects the new config
    await robotClient.getAuxState().catch(() => {});
    setSaving(false);
    onClose();
  };

  const typeOptions: { label: string; value: string }[] = [
    { label: "Unconfigured", value: "" },
    { label: "Rotary (°)",   value: "Rotary" },
    { label: "Linear (mm)",  value: "Linear" },
  ];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Axis {axis.axisIndex} Configuration</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cfgLabel}>NAME</Text>
          <TextInput
            style={styles.cfgInput}
            value={name}
            onChangeText={setName}
            placeholder={`Axis ${axis.axisIndex}`}
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
          />

          <Text style={[styles.cfgLabel, { marginTop: 14 }]}>TYPE</Text>
          <View style={styles.cfgSegRow}>
            {typeOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.cfgSeg, axisType === opt.value && styles.cfgSegActive]}
                onPress={() => setAxisType(opt.value)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cfgSegText, axisType === opt.value && styles.cfgSegTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.cfgLabel, { marginTop: 14 }]}>STEPS PER REVOLUTION</Text>
          <TextInput
            style={styles.cfgInput}
            value={stepsPerRev}
            onChangeText={setStepsPerRev}
            placeholder="1600"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            returnKeyType="done"
          />

          <Text style={[styles.cfgLabel, { marginTop: 14 }]}>GEAR RATIO</Text>
          <TextInput
            style={styles.cfgInput}
            value={gearRatio}
            onChangeText={setGearRatio}
            placeholder="1"
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            returnKeyType="done"
          />

          {axisType === "Linear" && (
            <>
              <Text style={[styles.cfgLabel, { marginTop: 14 }]}>MM PER OUTPUT REVOLUTION</Text>
              <TextInput
                style={styles.cfgInput}
                value={mmPerRev}
                onChangeText={setMmPerRev}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </>
          )}

          <View style={styles.cfgSwitchRow}>
            <Text style={styles.cfgSwitchLabel}>Invert direction</Text>
            <Switch
              value={invertDir}
              onValueChange={setInvertDir}
              trackColor={{ false: "#e5e7eb", true: "#7c3aed" }}
            />
          </View>

          <TouchableOpacity
            style={[styles.cfgSaveBtn, saving && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.cfgSaveBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function AuxAxisCard({ device }: { device: AuxDeviceState }) {
  const [configAxis, setConfigAxis] = useState<AuxAxisChannelState | null>(null);

  return (
    <View style={styles.card}>
      {configAxis && (
        <AuxAxisConfigModal
          deviceId={device.deviceId}
          axis={configAxis}
          onClose={() => setConfigAxis(null)}
        />
      )}

      <CardHeader
        icon={<Gauge size={16} color="#7c3aed" />}
        iconBg="#ede9fe"
        name={device.deviceName}
        subtitle={`${device.deviceId}${device.portName ? `  ·  ${device.portName}` : ""}`}
        connected={device.connected}
      />

      <PinGroup label="AXES" fg="#7c3aed" bg="#ede9fe">
        {device.axes.map((axis, i) => {
          const unitLabel = auxUnitLabel(axis);
          return (
            <View key={axis.axisIndex} style={[styles.row, i < device.axes.length - 1 && styles.rowBorder]}>
              <View style={[styles.typeBadge, { backgroundColor: "#ede9fe" }]}>
                <Text style={[styles.typeBadgeText, { color: "#7c3aed" }]}>{axis.axisIndex}</Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel} numberOfLines={1}>{axis.name || `Axis ${axis.axisIndex}`}</Text>
                <Text style={styles.rowSub}>{axis.axisType ? unitLabel : "Hold to jog"}</Text>
              </View>
              <TouchableOpacity
                style={styles.axisConfigBtn}
                onPress={() => setConfigAxis(axis)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Settings2 size={16} color="#9ca3af" />
              </TouchableOpacity>
              <View style={styles.jogRow}>
                <AuxJogButton deviceId={device.deviceId} axisIndex={axis.axisIndex} direction={-1} />
                <AuxJogButton deviceId={device.deviceId} axisIndex={axis.axisIndex} direction={1}  />
              </View>
            </View>
          );
        })}
        {device.axes.length === 0 && (
          <Text style={styles.emptyCard}>No axes configured.</Text>
        )}
      </PinGroup>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera cards
// ─────────────────────────────────────────────────────────────────────────────

function CameraConfigModal({
  camera,
  onClose,
}: {
  camera: CameraState | null; // null = add new
  onClose: () => void;
}) {
  const isNew = camera === null;
  const [name,        setName]        = useState(camera?.name ?? "Camera");
  const [deviceIndex, setDeviceIndex] = useState(String(camera?.deviceIndex ?? 0));
  const [width,       setWidth]       = useState(String(camera?.width  ?? 640));
  const [height,      setHeight]      = useState(String(camera?.height ?? 480));
  const [targetFps,   setTargetFps]   = useState(String(camera?.targetFps ?? 15));
  const [enabled,     setEnabled]     = useState(camera?.enabled ?? true);
  const [saving,      setSaving]      = useState(false);

  const save = async () => {
    setSaving(true);
    if (isNew) {
      await robotClient.addCamera({
        name:        name.trim(),
        deviceIndex: parseInt(deviceIndex) || 0,
        enabled,
        width:       parseInt(width)     || 640,
        height:      parseInt(height)    || 480,
        targetFps:   parseInt(targetFps) || 15,
      });
    } else {
      await robotClient.setCameraConfig({
        id:          camera!.id,
        name:        name.trim(),
        deviceIndex: parseInt(deviceIndex) || 0,
        enabled,
        width:       parseInt(width)     || 640,
        height:      parseInt(height)    || 480,
        targetFps:   parseInt(targetFps) || 15,
      });
    }
    await robotClient.getCameras().catch(() => {});
    setSaving(false);
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isNew ? "Add Camera" : `Configure ${camera!.name}`}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.cfgLabel}>NAME</Text>
          <TextInput style={styles.cfgInput} value={name} onChangeText={setName}
            placeholder="Camera" placeholderTextColor="#9ca3af" returnKeyType="done" />

          <Text style={[styles.cfgLabel, { marginTop: 14 }]}>DEVICE INDEX</Text>
          <TextInput style={styles.cfgInput} value={deviceIndex} onChangeText={setDeviceIndex}
            placeholder="0" placeholderTextColor="#9ca3af" keyboardType="numeric" returnKeyType="done" />

          <View style={ms2.twoCol}>
            <View style={ms2.twoColItem}>
              <Text style={[styles.cfgLabel, { marginTop: 14 }]}>WIDTH</Text>
              <TextInput style={styles.cfgInput} value={width} onChangeText={setWidth}
                placeholder="640" placeholderTextColor="#9ca3af" keyboardType="numeric" returnKeyType="done" />
            </View>
            <View style={ms2.twoColItem}>
              <Text style={[styles.cfgLabel, { marginTop: 14 }]}>HEIGHT</Text>
              <TextInput style={styles.cfgInput} value={height} onChangeText={setHeight}
                placeholder="480" placeholderTextColor="#9ca3af" keyboardType="numeric" returnKeyType="done" />
            </View>
          </View>

          <Text style={[styles.cfgLabel, { marginTop: 14 }]}>TARGET FPS</Text>
          <TextInput style={styles.cfgInput} value={targetFps} onChangeText={setTargetFps}
            placeholder="15" placeholderTextColor="#9ca3af" keyboardType="numeric" returnKeyType="done" />

          <View style={styles.cfgSwitchRow}>
            <Text style={styles.cfgSwitchLabel}>Enabled</Text>
            <Switch value={enabled} onValueChange={setEnabled}
              trackColor={{ false: "#e5e7eb", true: "#2563eb" }} />
          </View>

          <TouchableOpacity style={[styles.cfgSaveBtn, { backgroundColor: "#2563eb" }, saving && { opacity: 0.5 }]}
            onPress={save} disabled={saving} activeOpacity={0.8}>
            <Text style={styles.cfgSaveBtnText}>{saving ? "Saving…" : isNew ? "Add Camera" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Minimal two-column layout styles for the camera modal
const ms2 = StyleSheet.create({
  twoCol:     { flexDirection: "row", gap: 8 },
  twoColItem: { flex: 1 },
});

function CameraFeedCard({ camera, onEdit, onDelete }: {
  camera: CameraState;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const streamUrl = robotClient.cameraStreamUrl(camera.id);

  return (
    <View style={styles.card}>
      <CardHeader
        icon={<Camera size={16} color="#2563eb" />}
        iconBg="#eff6ff"
        name={camera.name}
        subtitle={`Device ${camera.deviceIndex}  ·  ${camera.width}×${camera.height}  ·  ${camera.targetFps}fps`}
        connected={camera.connected}
        actions={
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity onPress={onEdit} style={styles.configBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Settings2 size={16} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={styles.configBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Trash2 size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        }
      />
      {camera.enabled && streamUrl ? (
        <Image
          source={{ uri: streamUrl }}
          style={styles.cameraFeed}
          contentFit="contain"
          cachePolicy="none"
        />
      ) : (
        <View style={styles.cameraDisabled}>
          <Camera size={28} color="#d1d5db" />
          <Text style={styles.cameraDisabledText}>{camera.enabled ? "Not connected" : "Disabled"}</Text>
        </View>
      )}
    </View>
  );
}

function CameraManagerCard({ cameras, onRefresh }: {
  cameras: CameraState[];
  onRefresh: () => void;
}) {
  const [editCamera,  setEditCamera]  = useState<CameraState | null | 'new'>('new' as any);
  const [showModal,   setShowModal]   = useState(false);
  const [modalTarget, setModalTarget] = useState<CameraState | null>(null);

  const openAdd  = () => { setModalTarget(null); setShowModal(true); };
  const openEdit = (c: CameraState) => { setModalTarget(c); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setModalTarget(null); };

  const deleteCamera = async (id: string) => {
    await robotClient.removeCamera(id).catch(() => {});
    onRefresh();
  };

  return (
    <>
      {showModal && (
        <CameraConfigModal camera={modalTarget} onClose={closeModal} />
      )}
      <View style={styles.card}>
        <CardHeader
          icon={<Camera size={16} color="#2563eb" />}
          iconBg="#eff6ff"
          name="USB Cameras"
          subtitle={`${cameras.length} camera${cameras.length !== 1 ? 's' : ''} configured`}
          connected={cameras.some(c => c.connected)}
          actions={
            <TouchableOpacity onPress={openAdd} style={styles.configBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Plus size={16} color="#2563eb" />
            </TouchableOpacity>
          }
        />
        {cameras.length === 0 && (
          <Text style={styles.emptyCard}>
            No cameras added. Tap + to add a USB camera by device index.
          </Text>
        )}
      </View>
      {cameras.map(cam => (
        <CameraFeedCard
          key={cam.id}
          camera={cam}
          onEdit={() => openEdit(cam)}
          onDelete={() => deleteCamera(cam.id)}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function IoPage() {
  const nanos = useNanoIO();
  const [ioConfig,    setIoConfig]    = useState<IOConfig | null>(null);
  const [auxDevices,  setAuxDevices]  = useState<AuxDeviceState[]>([]);
  const [cameras,     setCameras]     = useState<CameraState[]>([]);

  // Re-fetch config every time this tab comes into focus so changes
  // made on the config page are reflected immediately.
  useFocusEffect(
    useCallback(() => {
      robotClient.getRobotConfig()
        .then(cfg => setIoConfig({
          enableStbCard:   cfg.enableStbCard   ?? true,
          enableNanoCards: cfg.enableNanoCards ?? true,
          enableRelayCard: cfg.enableRelayCard ?? false,
          enableAuxAxis:   cfg.enableAuxAxis   ?? false,
          enableCameras:   cfg.enableCameras   ?? false,
        }))
        .catch(() => setIoConfig({ enableStbCard: true, enableNanoCards: true, enableRelayCard: false, enableAuxAxis: false, enableCameras: false }));
    }, [])
  );

  useEffect(() => {
    robotClient.getAuxState().catch(() => {});
    return robotClient.onAuxAxis(devices => setAuxDevices(devices));
  }, []);

  useEffect(() => {
    robotClient.getCameras().catch(() => {});
    return robotClient.onCameras(cams => setCameras(cams));
  }, []);

  const showStb     = ioConfig?.enableStbCard   ?? true;
  const showNanos   = ioConfig?.enableNanoCards  ?? true;
  const showRelay   = ioConfig?.enableRelayCard  ?? false;
  const showAux     = ioConfig?.enableAuxAxis    ?? false;
  const showCameras = ioConfig?.enableCameras    ?? false;

  const hasAnything = showStb || (showNanos && nanos.length > 0) || showRelay
                   || (showAux && auxDevices.length > 0)
                   || (showCameras);

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {showStb     && <RobotIOBoardCard />}
        {showNanos   && nanos.map(nano => <NanoCard key={nano.id} nano={nano} />)}
        {showRelay   && <UsbRelayCard />}
        {showAux     && auxDevices.map(dev => <AuxAxisCard key={dev.deviceId} device={dev} />)}
        {showCameras && <CameraManagerCard cameras={cameras} onRefresh={() => robotClient.getCameras().catch(() => {})} />}

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

  // ── Aux jog buttons ────────────────────────────────────────────────────────
  jogRow:       { flexDirection: "row", gap: 8 },
  axisConfigBtn: { padding: 4, marginRight: 2 },

  // ── Aux axis config modal ──────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 16,
  },
  modalTitle:    { fontSize: 16, fontWeight: "700", color: "#111827" },
  modalCloseBtn: { padding: 4 },
  modalCloseText:{ fontSize: 18, color: "#6b7280" },

  cfgLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: "#6b7280", marginBottom: 6 },
  cfgInput: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, color: "#111827", backgroundColor: "#f9fafb",
  },
  cfgSegRow: { flexDirection: "row", gap: 6 },
  cfgSeg: {
    flex: 1, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    alignItems: "center", backgroundColor: "#f9fafb",
  },
  cfgSegActive: { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  cfgSegText:   { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  cfgSegTextActive: { color: "#fff" },
  cfgSwitchRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginTop: 16,
  },
  cfgSwitchLabel: { fontSize: 14, color: "#374151" },
  cfgSaveBtn: {
    marginTop: 20, backgroundColor: "#7c3aed",
    borderRadius: 10, paddingVertical: 13, alignItems: "center",
  },
  cfgSaveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // ── Camera feed ────────────────────────────────────────────────────────────
  cameraFeed: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#000",
  },
  cameraDisabled: {
    height: 160,
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  cameraDisabledText: { fontSize: 13, color: "#9ca3af" },

  // ── Empty states ───────────────────────────────────────────────────────────
  emptyCard: { fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 16 },
  emptyState: { marginTop: 20, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  emptyBody:  {
    fontSize: 13, color: "#9ca3af",
    textAlign: "center", paddingHorizontal: 32, lineHeight: 20,
  },
});
