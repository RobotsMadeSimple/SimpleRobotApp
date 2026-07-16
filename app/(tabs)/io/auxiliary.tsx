import { wide } from "@/src/components/ui/responsive";
import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { JogButton } from "@/src/components/ui/JogButton";
import { ios } from "@/src/components/ui/io/ioShared";
import { robotClient } from "@/src/services/RobotConnectService";
import { AuxAxisChannelState, AuxDeviceState, auxUnitLabel } from "@/src/models/robotModels";
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Settings2,
} from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── Jog constants ─────────────────────────────────────────────────────────────

const AUX_JOG_VELOCITY = 800;
const AUX_JOG_ACCEL    = 3200;
const AUX_JOG_DECEL    = 5000;

// ── AuxJogButton ──────────────────────────────────────────────────────────────

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

// ── AuxAxisConfigModal ────────────────────────────────────────────────────────

function AuxAxisConfigModal({
  deviceId,
  axis,
  onClose,
}: {
  deviceId: string;
  axis: AuxAxisChannelState;
  onClose: () => void;
}) {
  const [name,        setName]        = useState(axis.name);
  const [axisType,    setAxisType]    = useState(axis.axisType || "");
  const [stepsPerRev, setStepsPerRev] = useState(String(axis.stepsPerRev || 1600));
  const [gearRatio,   setGearRatio]   = useState(String(axis.gearRatio ?? 1));
  const [mmPerRev,    setMmPerRev]    = useState(String(axis.mmPerRev ?? 0));
  const [invertDir,   setInvertDir]   = useState(axis.invertDirection ?? false);
  const [saving,      setSaving]      = useState(false);

  const save = async () => {
    setSaving(true);
    await robotClient.setAuxAxisConfig({
      deviceId,
      axisIndex:       axis.axisIndex,
      name:            name.trim(),
      stepsPerRev:     parseInt(stepsPerRev)  || 1600,
      invertDirection: invertDir,
      axisType,
      gearRatio:       parseFloat(gearRatio)  || 1,
      mmPerRev:        parseFloat(mmPerRev)   || 0,
    });
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {([
              { label: "Full",  steps: 200  },
              { label: "1/2",   steps: 400  },
              { label: "1/4",   steps: 800  },
              { label: "1/8",   steps: 1600 },
              { label: "1/16",  steps: 3200 },
            ] as const).map(({ label, steps }) => {
              const active = stepsPerRev === String(steps);
              return (
                <TouchableOpacity
                  key={steps}
                  style={[styles.cfgSeg, active && styles.cfgSegActive, { flex: 0, paddingHorizontal: 12 }]}
                  onPress={() => setStepsPerRev(String(steps))}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cfgSegText, active && styles.cfgSegTextActive]}>{label}</Text>
                  <Text style={{ fontSize: 10, color: active ? "#e9d5ff" : "#9ca3af" }}>{steps}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.cfgInput}
            value={stepsPerRev}
            onChangeText={setStepsPerRev}
            placeholder="Custom"
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

// ── AuxDeviceDetail ───────────────────────────────────────────────────────────

function AuxDeviceDetail({ device }: { device: AuxDeviceState }) {
  const [configAxis, setConfigAxis] = useState<AuxAxisChannelState | null>(null);

  // Optimistic override for the enable toggle. The Switch is otherwise driven
  // entirely by server state, so a tap would snap back until the next poll —
  // and while state is stale it sends the wrong command. Reflect the tapped
  // value immediately, then clear once the server confirms it.
  const [pendingEnable, setPendingEnable] = useState<boolean | null>(null);

  useEffect(() => {
    if (pendingEnable !== null && (device.motorEnabled ?? false) === pendingEnable) {
      setPendingEnable(null);
    }
  }, [device.motorEnabled, pendingEnable]);

  const shownEnabled = pendingEnable ?? device.motorEnabled ?? false;

  const toggleEnable = (val: boolean) => {
    setPendingEnable(val);
    robotClient.enableAux(device.deviceId, val);
    // Nudge a fresh read so the confirmed state arrives promptly.
    setTimeout(() => robotClient.getAuxState().catch(() => {}), 150);
  };

  return (
    <>
      {configAxis && (
        <AuxAxisConfigModal
          deviceId={device.deviceId}
          axis={configAxis}
          onClose={() => setConfigAxis(null)}
        />
      )}

      <View>
        <Text style={styles.sectionLabel}>MOTOR DRIVERS</Text>
        <View style={styles.sectionBody}>
          <View style={[ios.row]}>
            <View style={ios.rowInfo}>
              <Text style={ios.rowLabel}>Motor Drivers</Text>
              <Text style={ios.rowSub}>{shownEnabled ? "Enabled" : "Disabled"}</Text>
            </View>
            <Switch
              value={shownEnabled}
              onValueChange={toggleEnable}
              disabled={!device.connected}
              trackColor={{ false: "#e5e7eb", true: "#c4b5fd" }}
              thumbColor={shownEnabled ? "#7c3aed" : "#9ca3af"}
            />
          </View>
        </View>
      </View>

      <View>
        <Text style={styles.sectionLabel}>AXES</Text>
        <View style={styles.sectionBody}>
          {device.axes.map((axis, i) => {
            const unitLabel = auxUnitLabel(axis);
            return (
              <View
                key={axis.axisIndex}
                style={[styles.axisRow, i < device.axes.length - 1 && styles.rowBorder]}
              >
                <View style={styles.axisIndexBadge}>
                  <Text style={styles.axisIndexText}>{axis.axisIndex}</Text>
                </View>
                <View style={ios.rowInfo}>
                  <Text style={ios.rowLabel} numberOfLines={1}>
                    {axis.name || `Axis ${axis.axisIndex}`}
                  </Text>
                  <Text style={ios.rowSub}>{axis.axisType ? unitLabel : "Hold to jog"}</Text>
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
                  <AuxJogButton deviceId={device.deviceId} axisIndex={axis.axisIndex} direction={1} />
                </View>
              </View>
            );
          })}
          {device.axes.length === 0 && (
            <Text style={ios.emptyCard}>No axes configured.</Text>
          )}
        </View>
      </View>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuxPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  const [auxDevices, setAuxDevices] = useState<AuxDeviceState[]>([]);

  useEffect(() => {
    robotClient.getAuxState().catch(() => {});
    const unsub = robotClient.onAuxAxis(devices => setAuxDevices(devices));
    // Aux state isn't part of the 100ms status poll, so refresh it here while
    // the screen is open — keeps connection/enable state current.
    const poll = setInterval(() => robotClient.getAuxState().catch(() => {}), 1500);
    return () => { unsub(); clearInterval(poll); };
  }, []);

  const device = deviceId ? (auxDevices.find(d => d.deviceId === deviceId) ?? null) : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      <SubPageHeader
        title={device ? device.deviceName : "Aux Stepper"}
        subtitle={
          device
            ? `${device.deviceId}${device.portName ? ` · ${device.portName}` : ""} · ${device.connected ? "Connected" : "Offline"}`
            : "Device not found"
        }
      />
      <ScrollView
        contentContainerStyle={[{ paddingTop: 24, paddingBottom: 40, gap: 24 }, wide.content]}
        showsVerticalScrollIndicator={false}
      >
        {device ? (
          <AuxDeviceDetail device={device} />
        ) : (
          <View style={styles.emptyState}>
            <Gauge size={22} color="#d1d5db" />
            <Text style={styles.emptyTitle}>Device Not Found</Text>
            <Text style={styles.emptyBody}>
              Make sure your aux stepper device is connected to the controller.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.8,
    color: "#6b7280", marginBottom: 6, paddingHorizontal: 16,
  },
  sectionBody: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },

  axisRow: {
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
  axisIndexBadge: {
    width: 36, height: 22,
    borderRadius: 5,
    backgroundColor: "#ede9fe",
    justifyContent: "center",
    alignItems: "center",
  },
  axisIndexText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: "#7c3aed" },

  jogRow:       { flexDirection: "row", gap: 8 },
  axisConfigBtn: { padding: 4, marginRight: 2 },

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
  cfgSegActive:     { backgroundColor: "#7c3aed", borderColor: "#7c3aed" },
  cfgSegText:       { fontSize: 12, fontWeight: "600", color: "#6b7280" },
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

  emptyState: { marginTop: 20, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#6b7280" },
  emptyBody:  { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 32, lineHeight: 20 },
});
