import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import { JogButton } from "@/src/components/ui/JogButton";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
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
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  accents,
  Button,
  Card,
  Chip,
  ChipGroup,
  colors,
  Divider,
  EmptyState,
  FormRow,
  Input,
  radii,
  Screen,
  SectionHeader,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";

// ── Jog constants ─────────────────────────────────────────────────────────────

const AUX_JOG_VELOCITY = 800;
const AUX_JOG_ACCEL    = 3200;
const AUX_JOG_DECEL    = 5000;

// Aux Stepper Axis device-type tint (matches the purple used for this device
// type on the IO index page's icon tile), via the kit's purple accent family.
const AUX_TINT       = accents.purple;
const AUX_TINT_SOFT  = accents.purpleSoft;
const AUX_TINT_TRACK = "#c4b5fd"; // lighter purple for the motor-enable switch track — no kit token for this shade

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
          ? <ChevronLeft  size={26} color={AUX_TINT} />
          : <ChevronRight size={26} color={AUX_TINT} />
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

          <FormRow label="Name">
            <Input
              value={name}
              onChangeText={setName}
              placeholder={`Axis ${axis.axisIndex}`}
              returnKeyType="done"
            />
          </FormRow>

          <FormRow label="Type" style={styles.fieldGap}>
            <SegmentedControl options={typeOptions} value={axisType} onChange={setAxisType} />
          </FormRow>

          <FormRow label="Steps per revolution" style={styles.fieldGap}>
            <ChipGroup style={styles.stepChipsRow}>
              {([
                { label: "Full",  steps: 200  },
                { label: "1/2",   steps: 400  },
                { label: "1/4",   steps: 800  },
                { label: "1/8",   steps: 1600 },
                { label: "1/16",  steps: 3200 },
              ] as const).map(({ label, steps }) => (
                <Chip
                  key={steps}
                  label={`${label} · ${steps}`}
                  selected={stepsPerRev === String(steps)}
                  onPress={() => setStepsPerRev(String(steps))}
                  tint={[accents.purple, accents.purpleSoft]}
                />
              ))}
            </ChipGroup>
            <Input
              value={stepsPerRev}
              onChangeText={setStepsPerRev}
              placeholder="Custom"
              keyboardType="numeric"
              returnKeyType="done"
              style={styles.customStepsInput}
            />
          </FormRow>

          <FormRow label="Gear ratio" style={styles.fieldGap}>
            <Input
              value={gearRatio}
              onChangeText={setGearRatio}
              placeholder="1"
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </FormRow>

          {axisType === "Linear" && (
            <FormRow label="mm per output revolution" style={styles.fieldGap}>
              <Input
                value={mmPerRev}
                onChangeText={setMmPerRev}
                placeholder="0"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </FormRow>
          )}

          <FormRow label="Invert direction" inline style={styles.fieldGap}>
            <Switch
              value={invertDir}
              onValueChange={setInvertDir}
              trackColor={{ false: colors.border, true: AUX_TINT }}
            />
          </FormRow>

          <Button
            label={saving ? "Saving…" : "Save"}
            loading={saving}
            onPress={save}
            style={[styles.saveBtn, { backgroundColor: AUX_TINT }]}
          />
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
        <SectionHeader title="Motor Drivers" />
        <Card>
          <FormRow label="Motor Drivers" hint={shownEnabled ? "Enabled" : "Disabled"} inline>
            <Switch
              value={shownEnabled}
              onValueChange={toggleEnable}
              disabled={!device.connected}
              trackColor={{ false: colors.border, true: AUX_TINT_TRACK }}
              thumbColor={shownEnabled ? AUX_TINT : colors.textFaint}
            />
          </FormRow>
        </Card>
      </View>

      <View>
        <SectionHeader title="Axes" />
        <Card padded={false}>
          {device.axes.map((axis, i) => {
            const unitLabel = auxUnitLabel(axis);
            return (
              <React.Fragment key={axis.axisIndex}>
                <View style={styles.axisRow}>
                  <View style={styles.axisIndexBadge}>
                    <Text style={styles.axisIndexText}>{axis.axisIndex}</Text>
                  </View>
                  <View style={ios.rowInfo}>
                    <Text style={ios.rowLabel} numberOfLines={1}>
                      {axis.name || `Axis ${axis.axisIndex}`}
                    </Text>
                    <Text style={ios.rowSub}>{axis.axisType ? unitLabel : "Hold to jog"}</Text>
                  </View>
                  <AnimatedPressable
                    style={styles.axisConfigBtn}
                    onPress={() => setConfigAxis(axis)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Settings2 size={16} color={colors.textFaint} />
                  </AnimatedPressable>
                  <View style={styles.jogRow}>
                    <AuxJogButton deviceId={device.deviceId} axisIndex={axis.axisIndex} direction={-1} />
                    <AuxJogButton deviceId={device.deviceId} axisIndex={axis.axisIndex} direction={1} />
                  </View>
                </View>
                {i < device.axes.length - 1 && <Divider inset />}
              </React.Fragment>
            );
          })}
          {device.axes.length === 0 && (
            <Text style={ios.emptyCard}>No axes configured.</Text>
          )}
        </Card>
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SubPageHeader
        title={device ? device.deviceName : "Aux Stepper"}
        subtitle={
          device
            ? `${device.deviceId}${device.portName ? ` · ${device.portName}` : ""} · ${device.connected ? "Connected" : "Offline"}`
            : "Device not found"
        }
      />
      <Screen>
        {device ? (
          <AuxDeviceDetail device={device} />
        ) : (
          <EmptyState
            icon={<Gauge size={28} color={colors.textFaint} />}
            title="Device Not Found"
            subtitle="Make sure your aux stepper device is connected to the controller."
          />
        )}
      </Screen>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  axisRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
    gap: spacing.sm + 2,
  },
  axisIndexBadge: {
    width: 36, height: 22,
    borderRadius: radii.sm - 4,
    backgroundColor: AUX_TINT_SOFT,
    justifyContent: "center",
    alignItems: "center",
  },
  axisIndexText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, color: AUX_TINT },

  jogRow:        { flexDirection: "row", gap: spacing.sm },
  axisConfigBtn: { padding: spacing.xs, marginRight: 2 },

  modalBackdrop: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.xl - 4, paddingBottom: spacing.xxl + 4,
    ...shadows.raised,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: spacing.lg,
  },
  modalTitle:     type.title,
  modalCloseBtn:  { padding: spacing.xs },
  modalCloseText: { fontSize: 18, color: colors.textMuted },

  fieldGap: { marginTop: spacing.md + 2 },

  stepChipsRow: { marginBottom: spacing.sm },
  customStepsInput: { marginTop: spacing.xs },

  saveBtn: { marginTop: spacing.lg },
});
