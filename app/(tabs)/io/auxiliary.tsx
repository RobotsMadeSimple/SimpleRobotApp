import { JogButton } from "@/src/components/ui/JogButton";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { ios } from "@/src/components/ui/io/ioShared";
import { useIsWide } from "@/src/components/ui/responsive";
import { robotClient } from "@/src/services/RobotConnectService";
import { AuxAxisChannelState, AuxDeviceState, auxStepsPerUnit, auxUnitLabel } from "@/src/models/robotModels";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Gauge,
  Settings2,
  Square,
} from "lucide-react-native";
import { auxRoleMeta } from "@/src/components/ui/io/auxRoles";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { ReactNode, useEffect, useState } from "react";
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
  colors,
  Divider,
  EmptyState,
  FormRow,
  InfoTip,
  Input,
  PageHeader,
  radii,
  Screen,
  SectionHeader,
  shadows,
  spacing,
  StatTile,
  StatusPill,
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

// ── Action helpers ────────────────────────────────────────────────────────────

/** The configured action distance converted to motor steps.
 *  Physical (typed) axes convert distance→steps via auxStepsPerUnit; untyped
 *  axes treat actionDistance as raw steps. */
function actionSteps(axis: AuxAxisChannelState): number {
  const spu = auxStepsPerUnit(axis);
  return axis.axisType && spu > 0
    ? Math.round((axis.actionDistance || 0) * spu)
    : Math.round(axis.actionDistance || 0);
}

// ── AuxActionButton ───────────────────────────────────────────────────────────
// Tap (one-shot) companion to AuxJogButton — used for role actions like gripper
// Open/Close, conveyor Run/Stop and rotary indexing.

function AuxActionButton({
  label,
  icon,
  onPress,
  tone = "default",
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  const tint = tone === "danger" ? colors.danger : AUX_TINT;
  return (
    <AnimatedPressable style={[styles.actionBtn, { borderColor: tint }]} onPress={onPress}>
      <View style={styles.actionBtnContent}>
        {icon}
        <Text style={[styles.actionBtnText, { color: tint }]} numberOfLines={1}>{label}</Text>
      </View>
    </AnimatedPressable>
  );
}

// ── AuxSetPositionModal ─────────────────────────────────────────────────────────
// Type a position (in the axis unit, or raw steps when untyped) to set, or zero.

function AuxSetPositionModal({
  deviceId,
  axis,
  onClose,
}: {
  deviceId: string;
  axis: AuxAxisChannelState;
  onClose: () => void;
}) {
  const unitLabel = auxUnitLabel(axis);
  const spu       = auxStepsPerUnit(axis);
  const [value, setValue] = useState("");

  const g         = gripperGeom(axis);
  const isGripper = axis.role === "Gripper" && g.ok;

  const toSteps = (v: string): number => {
    const n = parseFloat(v);
    if (!isFinite(n)) return 0;
    return axis.axisType && spu > 0 ? Math.round(n * spu) : Math.round(n);
  };

  const apply = async (steps: number) => {
    await robotClient.setAuxPosition(deviceId, axis.axisIndex, steps);
    await robotClient.getAuxState().catch(() => {});
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>Set Axis {axis.axisIndex} Position</Text>
              <InfoTip text="Sets the stored position for this axis without moving the motor. Zero re-references the current physical position as the origin." />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {isGripper && (
            <>
              <Text style={styles.reRefHint}>
                Lost steps? Drive the jaws to a known end-stop, then re-reference the position:
              </Text>
              <View style={styles.setPosBtnRow}>
                <Button
                  label={`At full open (${g.open.toFixed(0)} mm)`}
                  variant="secondary"
                  onPress={() => apply(Math.round(g.open * g.spm))}
                  style={styles.setPosBtn}
                />
                <Button
                  label={`At full closed (${g.closed.toFixed(0)} mm)`}
                  variant="secondary"
                  onPress={() => apply(Math.round(g.closed * g.spm))}
                  style={styles.setPosBtn}
                />
              </View>
              <Divider style={styles.reRefDivider} />
            </>
          )}

          <FormRow label={`Position (${axis.axisType ? unitLabel : "steps"})`}>
            <Input
              value={value}
              onChangeText={setValue}
              placeholder="0"
              keyboardType="numeric"
              returnKeyType="done"
            />
          </FormRow>

          <View style={styles.setPosBtnRow}>
            <Button
              label="Zero"
              variant="secondary"
              onPress={() => apply(0)}
              style={styles.setPosBtn}
            />
            <Button
              label="Set"
              onPress={() => apply(toSteps(value))}
              style={[styles.setPosBtn, { backgroundColor: AUX_TINT }]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}


// ── GripperControls ─────────────────────────────────────────────────────────
// Open / Close drive the jaws to the configured gap limits; "grip to X" drives to
// an absolute gap in between. All are absolute moves computed from the axis's
// dead-reckoned position (controller MoveAux is relative, so we send the delta).

function gripperGeom(axis: AuxAxisChannelState) {
  const spm    = auxStepsPerUnit(axis);            // steps per mm of jaw gap
  const open   = axis.gripperOpenMm   || 0;
  const closed = axis.gripperClosedMm || 0;
  const stroke = Math.abs(open - closed);
  // Per-direction speed (mm/s) derived from the full-stroke time; fall back to
  // actionVelocity, then a gentle default. Accel 0 = let the move use its default.
  const fallbackVel = (axis.actionVelocity || 0) > 0 ? axis.actionVelocity : 20;
  const openVel  = (axis.gripperOpenTimeSec  || 0) > 0 && stroke > 0 ? stroke / axis.gripperOpenTimeSec  : fallbackVel;
  const closeVel = (axis.gripperCloseTimeSec || 0) > 0 && stroke > 0 ? stroke / axis.gripperCloseTimeSec : fallbackVel;
  const accel     = axis.gripperAccel || 0;
  const overTravel = axis.gripperOverTravelMm || 0;
  return { spm, open, closed, stroke, openVel, closeVel, accel, overTravel, ok: spm > 0 && open !== closed };
}

function GripperControls({ device, axis }: { device: AuxDeviceState; axis: AuxAxisChannelState }) {
  const [target, setTarget] = useState("");
  const g = gripperGeom(axis);

  if (!g.ok) {
    return (
      <Text style={styles.needsConfig} numberOfLines={2}>
        Set the jaw gap limits in configuration (gear icon) to enable Open / Close.
      </Text>
    );
  }

  const lo = Math.min(g.open, g.closed);
  const hi = Math.max(g.open, g.closed);

  // toLimit = a full Open/Close that seats against a hard stop (vs a Grip to an in-between gap).
  const gripTo = (mm: number, toLimit = false) => {
    const clamped = Math.max(lo, Math.min(hi, mm));
    const curMm   = axis.position / g.spm;
    // Which way we head: toward the wider gap for Open, the narrower for Close; a Grip follows
    // the target vs the current position. Direction picks the speed and the over-travel sign.
    const opening = toLimit ? clamped >= hi : clamped > curMm;
    let   delta   = Math.round((clamped - curMm) * g.spm);
    // Over-travel a full Open/Close into the stop so the controller re-references there (it clamps
    // the tracked position to the gap limits). A Grip stops exactly on its gap, so never over-travels.
    if (toLimit && g.overTravel > 0) delta += (opening ? 1 : -1) * Math.round(g.overTravel * g.spm);
    if (delta === 0) return;
    const velSteps   = Math.max(1, Math.round((opening ? g.openVel : g.closeVel) * g.spm));
    const accelSteps = g.accel > 0 ? Math.max(1, Math.round(g.accel * g.spm)) : undefined;
    robotClient.moveAux(device.deviceId, axis.axisIndex, delta, velSteps, accelSteps, accelSteps);
  };

  return (
    <View style={styles.gripperControls}>
      <View style={styles.jogRow}>
        <AuxActionButton label="Open"  onPress={() => gripTo(g.open, true)} />
        <AuxActionButton label="Close" onPress={() => gripTo(g.closed, true)} />
      </View>
      <View style={styles.gripToRow}>
        <Input
          value={target}
          onChangeText={setTarget}
          placeholder={`${lo.toFixed(0)}–${hi.toFixed(0)}`}
          keyboardType="decimal-pad"
          returnKeyType="go"
          onSubmitEditing={() => { const n = parseFloat(target); if (isFinite(n)) gripTo(n); }}
          style={styles.gripToInput}
        />
        <Text style={styles.gripToUnit}>mm</Text>
        <AuxActionButton
          label="Grip"
          onPress={() => { const n = parseFloat(target); if (isFinite(n)) gripTo(n); }}
        />
      </View>
    </View>
  );
}

// ── AuxDeviceDetail ───────────────────────────────────────────────────────────

function AuxDeviceDetail({ device, isWide }: { device: AuxDeviceState; isWide: boolean }) {
  const router = useRouter();
  const [setPosAxis, setSetPosAxis] = useState<AuxAxisChannelState | null>(null);

  // Role-specific action controls that replace the default ± jog buttons.
  const renderAxisControls = (axis: AuxAxisChannelState) => {
    const axisIndex = axis.axisIndex;
    const vel       = axis.actionVelocity || 800;
    const steps     = actionSteps(axis);

    switch (axis.role) {
      case "Gripper":
        return <GripperControls device={device} axis={axis} />;
      case "Conveyor":
        return (
          <View style={styles.jogRow}>
            <AuxActionButton
              label="Run"
              icon={<ChevronLeft size={20} color={AUX_TINT} />}
              onPress={() => robotClient.jogAux({ deviceId: device.deviceId, axis: axisIndex, velocity: -vel })}
            />
            <AuxActionButton
              label="Stop"
              tone="danger"
              icon={<Square size={16} color={colors.danger} />}
              onPress={() => robotClient.stopAux(device.deviceId, axisIndex)}
            />
            <AuxActionButton
              label="Run"
              icon={<ChevronRight size={20} color={AUX_TINT} />}
              onPress={() => robotClient.jogAux({ deviceId: device.deviceId, axis: axisIndex, velocity: vel })}
            />
          </View>
        );
      case "RotaryTable":
        return (
          <View style={styles.jogRow}>
            <AuxActionButton
              label="Index −"
              onPress={() => robotClient.moveAux(device.deviceId, axisIndex, -steps, vel)}
            />
            <AuxActionButton
              label="Index +"
              onPress={() => robotClient.moveAux(device.deviceId, axisIndex, steps, vel)}
            />
          </View>
        );
      default: // Generic and unconfigured ("") — hold-to-jog.
        return (
          <View style={styles.jogRow}>
            <AuxJogButton deviceId={device.deviceId} axisIndex={axisIndex} direction={-1} />
            <AuxJogButton deviceId={device.deviceId} axisIndex={axisIndex} direction={1} />
          </View>
        );
    }
  };

  // Position readout in the axis's configured unit (raw steps when untyped).
  const posLabel = (axis: AuxAxisChannelState): string => {
    const spu = auxStepsPerUnit(axis);
    if (axis.axisType && spu > 0) {
      return `${(axis.position / spu).toFixed(2)} ${auxUnitLabel(axis)}`;
    }
    return `${axis.position ?? 0} steps`;
  };

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
      {setPosAxis && (
        <AuxSetPositionModal
          deviceId={device.deviceId}
          axis={setPosAxis}
          onClose={() => setSetPosAxis(null)}
        />
      )}

      <View style={{ gap: spacing.md }}>
        <SectionHeader
          title="Motor Drivers"
          right={<InfoTip text="Enabling motor drivers powers the stepper output for every axis on this device. Axes won't move while disabled, and the switch is locked out until the device is connected." />}
        />
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

      <View style={{ gap: spacing.md }}>
        <SectionHeader
          title="Axes"
          right={<InfoTip text="Each axis is an independent stepper channel. Hold the arrows to jog; tap the gear to set its axis type, steps per revolution, gear ratio, and direction." />}
        />
        {(() => {
          const axisRows = device.axes.map((axis, i) => {
            const meta      = auxRoleMeta(axis.role);
            const RoleIcon  = meta.icon;
            const hasRole   = !!axis.role && axis.role !== "Generic";
            const roleLabel = hasRole ? meta.label : null;
            const row = (
              <View style={styles.axisRow}>
                <View style={styles.axisIndexBadge}>
                  <Text style={styles.axisIndexText}>{axis.axisIndex}</Text>
                </View>
                <View style={[styles.roleIcon, hasRole && styles.roleIconOn]}>
                  <RoleIcon size={18} color={hasRole ? AUX_TINT : colors.textFaint} />
                </View>
                <View style={ios.rowInfo}>
                  <Text style={ios.rowLabel} numberOfLines={1}>
                    {axis.name || `Axis ${axis.axisIndex}`}
                  </Text>
                  <Text style={ios.rowSub} numberOfLines={1}>
                    {roleLabel ? `${roleLabel}  ·  ${posLabel(axis)}` : posLabel(axis)}
                  </Text>
                </View>
                <AnimatedPressable
                  style={styles.axisConfigBtn}
                  onPress={() => setSetPosAxis(axis)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Crosshair size={16} color={colors.textFaint} />
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.axisConfigBtn}
                  onPress={() => router.push({ pathname: "/io/aux-axis", params: { deviceId: device.deviceId, axis: String(axis.axisIndex) } })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Settings2 size={16} color={colors.textFaint} />
                </AnimatedPressable>
                {renderAxisControls(axis)}
              </View>
            );
            // Wide: each axis gets its own card in a 2-column grid instead of
            // one long stacked list. Narrow: unchanged flat rows in one Card.
            if (isWide) {
              return (
                <View key={axis.axisIndex} style={styles.axisGridItem}>
                  <Card padded={false}>{row}</Card>
                </View>
              );
            }
            return (
              <React.Fragment key={axis.axisIndex}>
                {row}
                {i < device.axes.length - 1 && <Divider inset />}
              </React.Fragment>
            );
          });

          if (device.axes.length === 0) {
            return (
              <Card padded={false}>
                <Text style={ios.emptyCard}>No axes configured.</Text>
              </Card>
            );
          }
          return isWide
            ? <View style={styles.axisGrid}>{axisRows}</View>
            : <Card padded={false}>{axisRows}</Card>;
        })()}
      </View>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuxPage() {
  const { deviceId } = useLocalSearchParams<{ deviceId?: string }>();
  const [auxDevices, setAuxDevices] = useState<AuxDeviceState[]>([]);
  const isWide = useIsWide();

  useEffect(() => {
    robotClient.getAuxState().catch(() => {});
    const unsub = robotClient.onAuxAxis(devices => setAuxDevices(devices));
    // Aux state isn't part of the 100ms status poll, so refresh it here while the
    // screen is open. Poll quickly (250ms) so the live position readout tracks a
    // jog or move smoothly instead of jumping in coarse steps; the screen is only
    // mounted while the user is actively working with the aux device.
    const poll = setInterval(() => robotClient.getAuxState().catch(() => {}), 250);
    return () => { unsub(); clearInterval(poll); };
  }, []);

  const device = deviceId ? (auxDevices.find(d => d.deviceId === deviceId) ?? null) : null;
  const configuredAxes = device?.axes.filter(a => !!a.axisType).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title={device ? device.deviceName : "Aux Stepper"}
        subtitle={device ? "External stepper driver" : "Device not found"}
        right={
          device ? (
            <View style={styles.headerActions}>
              <StatusPill
                label={device.connected ? "Connected" : "Offline"}
                tone={device.connected ? "success" : "danger"}
                dot
              />
            </View>
          ) : undefined
        }
      />
      <Screen>
        {device ? (
          <>
            <View style={styles.statRow}>
              <StatTile label="Axes" value={device.axes.length} icon={Gauge}
                        tint={[AUX_TINT, AUX_TINT_SOFT]} style={styles.statTile} />
              <StatTile label="Configured" value={`${configuredAxes}/${device.axes.length}`}
                        style={styles.statTile} />
              <StatTile label="Motors" value={device.motorEnabled ? "Enabled" : "Disabled"}
                        tint={device.motorEnabled ? [colors.success, colors.successSoft] : undefined}
                        style={styles.statTile} />
            </View>
            <AuxDeviceDetail device={device} isWide={isWide} />
          </>
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

  // Role icon badge on each axis row (what the motor drives, at a glance).
  roleIcon: {
    width: 30, height: 30,
    borderRadius: radii.sm - 2,
    justifyContent: "center", alignItems: "center",
    backgroundColor: colors.surfaceMuted,
  },
  roleIconOn: { backgroundColor: AUX_TINT_SOFT },

  // Gripper controls: Open/Close row + grip-to-distance row.
  gripperControls: { gap: spacing.sm },
  gripToRow:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  gripToInput: { width: 70 },
  gripToUnit:  { ...type.caption, color: colors.textFaint, marginLeft: -2 },
  needsConfig: { ...type.caption, color: colors.textFaint, maxWidth: 150, lineHeight: 15 },

  reRefHint:    { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  reRefDivider: { marginVertical: spacing.md },

  // Tap action buttons (gripper / conveyor / rotary) — sized to match the 64px jog buttons.
  actionBtn: {
    minWidth: 64, height: 64,
    borderWidth: 1.5,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  actionBtnContent: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtnText:    { fontSize: 13, fontWeight: "700" },

  setPosBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  setPosBtn:    { flex: 1 },

  // Wide: axes grid — 2 columns of small cards instead of one long list.
  axisGrid:     { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  axisGridItem: { flexBasis: "48%", flexGrow: 1, minWidth: 320 },

  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statRow:       { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statTile:      { flex: 1, minWidth: 130 },

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
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  modalTitle:     type.title,
  modalCloseBtn:  { padding: spacing.xs },
  modalCloseText: { fontSize: 18, color: colors.textMuted },

  fieldGap: { marginTop: spacing.md + 2 },

  stepChipsRow: { marginBottom: spacing.sm },
  customStepsInput: { marginTop: spacing.xs },

  saveBtn: { marginTop: spacing.lg },
});
