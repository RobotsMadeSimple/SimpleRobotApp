import { JogButton } from "@/src/components/ui/JogButton";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { FirmwareChip, ios, IORow } from "@/src/components/ui/io/ioShared";
import { useIsWide } from "@/src/components/ui/responsive";
import { useIoDevices } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  AuxAxisChannelState,
  AuxDeviceState,
  auxStepsPerUnit,
  auxUnitLabel,
  deviceSupports,
} from "@/src/models/robotModels";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Gauge,
  Pencil,
  Settings2,
  Square,
} from "lucide-react-native";
import { auxRoleMeta } from "@/src/components/ui/io/auxRoles";
import { useKeyboardHeight } from "@/src/platform/keyboard";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";

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
// Ceiling on any step rate we ask of the Uno. Its software step loop tops out around 10 kHz;
// above that the firmware's velocity bookkeeping runs ahead of the pulses it can actually emit,
// so a soft-stop computes a braking distance for a speed the motor never reached and the axis
// keeps stepping long after release.
const AUX_MAX_STEP_HZ  = 10000;
const clampStepHz = (hz: number) => Math.max(1, Math.min(AUX_MAX_STEP_HZ, Math.round(hz)));

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
  velocity = AUX_JOG_VELOCITY,
  accel    = AUX_JOG_ACCEL,
  decel    = AUX_JOG_DECEL,
  label,
  icon,
}: {
  deviceId: string;
  axisIndex: number;
  direction: 1 | -1;
  /** Jog speed magnitude (steps/s). Direction is applied from `direction`. */
  velocity?: number;
  /** Ramp (steps/s²) while held. */
  accel?: number;
  /** Braking rate (steps/s²) on release. Must suit `velocity`: braking distance is v²/2d. */
  decel?: number;
  /** Override the default ± label (e.g. "Open" / "Close"). */
  label?: string;
  /** Override the default chevron. */
  icon?: ReactNode;
}) {
  const startJog = () =>
    robotClient.jogAux({
      deviceId,
      axis:     axisIndex,
      velocity: clampStepHz(velocity) * direction,
      accel,
    });

  const stopJog = () =>
    robotClient.jogAux({ deviceId, axis: axisIndex, velocity: 0, decel });

  return (
    <JogButton
      label={label ?? (direction === -1 ? "−" : "+")}
      icon={
        icon ?? (direction === -1
          ? <ChevronLeft  size={26} color={AUX_TINT} />
          : <ChevronRight size={26} color={AUX_TINT} />)
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
  const kb        = useKeyboardHeight(); // lift the sheet clear of the keyboard (Modals aren't resized)

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
      <View style={[styles.modalBackdrop, { paddingBottom: kb }]}>
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


// ── Gripper ───────────────────────────────────────────────────────────────────
// Open / Close are hold-to-jog: the jaws travel open/closed while the button is
// held and stop on release (at the gripper's configured open/close speed, braking at
// the gripper's accel so the stop distance matches the speed). The gap slider picks
// a target gap: the thumb follows the finger, and the jaws move once, on release.
// Controller MoveAux is relative, so the move is the delta from the tracked gap. The
// configured gap limits still drive programs and the Set-Position re-reference.

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

// Type an exact gap to drive the jaws to — the tap target is the slider's mm readout.
function GripperGapModal({ lo, hi, currentMm, onMove, onClose }: {
  lo: number;
  hi: number;
  currentMm: number;
  onMove: (mm: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(currentMm.toFixed(1));
  const n     = parseFloat(value);
  const valid = isFinite(n) && n >= lo && n <= hi;
  const kb    = useKeyboardHeight(); // lift the sheet clear of the keyboard (Modals aren't resized)
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { paddingBottom: kb }]}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>Move to Gap</Text>
              <InfoTip text="Drives the jaws to this exact gap at the gripper's configured open/close speed." />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <FormRow label={`Gap (mm, ${lo.toFixed(0)}–${hi.toFixed(0)})`}>
            <Input
              value={value}
              onChangeText={setValue}
              placeholder={currentMm.toFixed(1)}
              keyboardType="decimal-pad"
              returnKeyType="done"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={() => { if (valid) { onMove(n); onClose(); } }}
            />
          </FormRow>
          <View style={styles.setPosBtnRow}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.setPosBtn} />
            <Button
              label="Move"
              disabled={!valid}
              onPress={() => { onMove(n); onClose(); }}
              style={[styles.setPosBtn, { backgroundColor: AUX_TINT }]}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Drag-to-position slider for the gripper gap. The thumb follows the tracked jaw gap
// when idle and the finger while dragging; it reports the chosen mm value once, on release.
// Tapping the mm readout opens the exact-gap entry.
function GripperSlider({ lo, hi, trackedMm, tint, onEnd, onPressValue }: {
  lo: number;
  hi: number;
  trackedMm: number;
  tint: string;
  onEnd: (mm: number) => void;
  onPressValue: () => void;
}) {
  const [barW, setBarW]       = useState(1);
  const [dragFrac, setDragFrac] = useState<number | null>(null);
  // Last fraction, kept on the UI thread so onFinalize can report it without a JS ref
  // (reads/writes stay off the render path, which the react-compiler lint requires).
  const lastFrac = useSharedValue(0);

  const span     = hi - lo;
  const idleFrac = span > 0 ? Math.max(0, Math.min(1, (trackedMm - lo) / span)) : 0;
  const frac     = dragFrac ?? idleFrac;
  const toMm     = (f: number) => lo + Math.max(0, Math.min(1, f)) * span;

  const update   = (f: number) => setDragFrac(f);
  const finishAt = (f: number) => { setDragFrac(null); onEnd(toMm(f)); };

  const pan = Gesture.Pan()
    .onBegin(e  => { "worklet"; const f = Math.max(0, Math.min(1, e.x / barW)); lastFrac.value = f; runOnJS(update)(f); })
    .onUpdate(e => { "worklet"; const f = Math.max(0, Math.min(1, e.x / barW)); lastFrac.value = f; runOnJS(update)(f); })
    .onFinalize(() => { "worklet"; runOnJS(finishAt)(lastFrac.value); });

  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>GAP</Text>
        <TouchableOpacity onPress={onPressValue} hitSlop={8} activeOpacity={0.6} style={styles.sliderValueBtn}
          accessibilityRole="button" accessibilityLabel="Move to an exact gap">
          <Text style={[styles.sliderValue, { color: tint }]}>{toMm(frac).toFixed(1)} mm</Text>
          <Pencil size={12} color={tint} />
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={pan}>
        <View style={styles.sliderHit} onLayout={e => setBarW(e.nativeEvent.layout.width)}>
          <View style={styles.sliderTrack}>
            <View style={[styles.sliderFill, { width: `${frac * 100}%`, backgroundColor: tint }]} />
          </View>
          <View style={[styles.sliderThumb, { left: `${frac * 100}%`, borderColor: tint }]} />
        </View>
      </GestureDetector>
      <View style={styles.sliderEnds}>
        <Text style={styles.sliderEnd}>Closed · {lo.toFixed(0)}</Text>
        <Text style={styles.sliderEnd}>Open · {hi.toFixed(0)}</Text>
      </View>
    </View>
  );
}

function GripperControls({ device, axis }: { device: AuxDeviceState; axis: AuxAxisChannelState }) {
  const g = gripperGeom(axis);
  const [gapModal, setGapModal] = useState(false);

  if (!g.ok) {
    return (
      <Text style={styles.needsConfig} numberOfLines={2}>
        Set the jaw gap limits in configuration (gear icon) to enable the gripper controls.
      </Text>
    );
  }

  const lo = Math.min(g.open, g.closed);
  const hi = Math.max(g.open, g.closed);

  // Hold-to-jog speed (steps/s) per direction, from the gripper's configured open/close
  // speed; accel falls back to the generic jog ramp when none is set. Open jogs toward the
  // wider gap (positive velocity — StartAuxContinuous applies InvertDirection), Close narrower.
  // The release brakes at the same rate it ramped: a jog at the gripper's speed with the
  // generic (gentle) jog decel would coast for v²/2d steps — metres of travel at high speed.
  const jogVelOpen  = clampStepHz(g.openVel  * g.spm);
  const jogVelClose = clampStepHz(g.closeVel * g.spm);
  const jogAccel    = g.accel > 0 ? Math.max(1, Math.round(g.accel * g.spm)) : AUX_JOG_ACCEL;
  const jogDecel    = g.accel > 0 ? jogAccel : AUX_JOG_DECEL;

  // One relative move from the tracked gap to the gap chosen on the slider.
  const driveToGap = (mm: number) => {
    const clamped = Math.max(lo, Math.min(hi, mm));
    const delta = Math.round((clamped - axis.position / g.spm) * g.spm);
    if (delta === 0) return;
    const opening    = delta > 0;
    const velSteps   = clampStepHz((opening ? g.openVel : g.closeVel) * g.spm);
    const accelSteps = g.accel > 0 ? Math.max(1, Math.round(g.accel * g.spm)) : undefined;
    robotClient.moveAux(device.deviceId, axis.axisIndex, delta, velSteps, accelSteps, accelSteps);
  };

  return (
    <View style={styles.gripperControls}>
      <View style={styles.jogRow}>
        <AuxJogButton
          deviceId={device.deviceId}
          axisIndex={axis.axisIndex}
          direction={-1}
          velocity={jogVelClose}
          accel={jogAccel}
          decel={jogDecel}
          label="Close"
        />
        <AuxJogButton
          deviceId={device.deviceId}
          axisIndex={axis.axisIndex}
          direction={1}
          velocity={jogVelOpen}
          accel={jogAccel}
          decel={jogDecel}
          label="Open"
        />
      </View>
      <GripperSlider
        lo={lo}
        hi={hi}
        trackedMm={axis.position / g.spm}
        tint={AUX_TINT}
        onEnd={driveToGap}
        onPressValue={() => setGapModal(true)}
      />
      {gapModal && (
        <GripperGapModal
          lo={lo}
          hi={hi}
          currentMm={axis.position / g.spm}
          onMove={driveToGap}
          onClose={() => setGapModal(false)}
        />
      )}
    </View>
  );
}

// ── AuxDeviceDetail ───────────────────────────────────────────────────────────

function AuxDeviceDetail({ device, isWide }: { device: AuxDeviceState; isWide: boolean }) {
  const router = useRouter();
  const [setPosAxis, setSetPosAxis] = useState<AuxAxisChannelState | null>(null);

  // The Uno's spare-pin digital IO rides the shared IO-device stream under this device's id.
  const ioDevice = useIoDevices().find(d => d.id === device.deviceId);
  const ioPins   = ioDevice?.pins ?? [];
  // A board whose firmware reports its capabilities but lacks `io` can't do pin IO at all;
  // legacy firmware (no capability report) is assumed able, as before.
  const ioSupported = deviceSupports(device, "io");
  const configureIo = () =>
    router.push({ pathname: "/(tabs)/io/configure", params: { deviceId: device.deviceId, kind: "aux" } });

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
        {device.axes.length === 0 ? (
          <Card padded={false}>
            <Text style={ios.emptyCard}>No axes configured.</Text>
          </Card>
        ) : (
          <View style={isWide ? styles.axisGrid : styles.axisStack}>
            {device.axes.map(axis => {
              const meta      = auxRoleMeta(axis.role);
              const RoleIcon  = meta.icon;
              const hasRole   = !!axis.role && axis.role !== "Generic";
              const roleLabel = hasRole ? meta.label : "Generic";
              // Each axis is its own self-contained card: an icon + identity header,
              // then its role-specific controls below. Reads as an independent piece.
              const card = (
                <Card padded={false}>
                  <View style={styles.axisHeader}>
                    <View style={styles.roleIcon}>
                      <RoleIcon size={20} color={AUX_TINT} />
                    </View>
                    <View style={styles.axisHeaderInfo}>
                      <Text style={styles.axisName} numberOfLines={1}>
                        {axis.name || `Axis ${axis.axisIndex}`}
                      </Text>
                      <Text style={styles.axisSub} numberOfLines={1}>
                        {`${roleLabel}  ·  ${posLabel(axis)}`}
                      </Text>
                    </View>
                    <AnimatedPressable
                      style={styles.axisConfigBtn}
                      onPress={() => setSetPosAxis(axis)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Set position"
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
                  </View>
                  <Divider inset />
                  <View style={styles.axisControls}>
                    {renderAxisControls(axis)}
                  </View>
                </Card>
              );
              return isWide
                ? <View key={axis.axisIndex} style={styles.axisGridItem}>{card}</View>
                : <React.Fragment key={axis.axisIndex}>{card}</React.Fragment>;
            })}
          </View>
        )}
      </View>

      <View style={{ gap: spacing.md }}>
        <SectionHeader
          title="IO Pins"
          right={ioSupported ? (
            <AnimatedPressable style={styles.ioConfigLink} onPress={configureIo} hitSlop={8}>
              <Settings2 size={15} color={AUX_TINT} />
              <Text style={styles.ioConfigText}>Configure</Text>
            </AnimatedPressable>
          ) : undefined}
        />
        {!ioSupported ? (
          <Card>
            <Text style={styles.ioEmpty}>
              This board&apos;s firmware has no IO-pin support — flash AuxStepperDriver 1.1.0 or newer.
            </Text>
          </Card>
        ) : ioPins.length === 0 ? (
          <Card>
            <Text style={styles.ioEmpty}>
              Configure the Uno&apos;s spare pins (D9–D11, A0–A5) as inputs or outputs to add digital IO to this device.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            {ioPins.map((pin, i) => (
              <React.Fragment key={pin.pin}>
                <IORow
                  label={pin.name || `Pin ${pin.pin}`}
                  sublabel={`${device.deviceName} · D${pin.pin}`}
                  type={pin.type}
                  value={pin.value}
                  onToggle={pin.type === "Output"
                    ? () => robotClient.setIoOutput(device.deviceId, pin.pin, !pin.value)
                    : undefined}
                />
                {i < ioPins.length - 1 && <Divider inset />}
              </React.Fragment>
            ))}
          </Card>
        )}
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
              <FirmwareChip device={device} />
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
  jogRow:        { flexDirection: "row", gap: spacing.sm },
  axisConfigBtn: { padding: spacing.xs, marginLeft: 2 },

  // ── Per-axis card: icon + identity header, then its controls below ──────────
  axisStack:       { gap: spacing.md },
  axisHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm + 2,
  },
  axisHeaderInfo: { flex: 1, minWidth: 0 },
  axisName: { ...type.body, fontWeight: "700", color: colors.text },
  axisSub:  { ...type.caption, color: colors.textMuted },
  axisControls: { padding: spacing.md, gap: spacing.sm },

  // Role icon tile on each axis card (what the motor drives, at a glance).
  roleIcon: {
    width: 38, height: 38,
    borderRadius: radii.sm,
    justifyContent: "center", alignItems: "center",
    backgroundColor: AUX_TINT_SOFT,
  },

  // Gripper controls: Open/Close jog row + live gap slider.
  gripperControls: { gap: spacing.md },
  needsConfig: { ...type.caption, color: colors.textFaint, lineHeight: 16 },

  // ── Gripper gap slider (live drag-to-position) ──────────────────────────────
  sliderWrap:   { gap: 4 },
  sliderHeader: { flexDirection: "row", alignItems: "center" },
  sliderLabel:  { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.5 },
  sliderValueBtn: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
  sliderValue:  { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  sliderHit:    { height: 40, justifyContent: "center" },
  sliderTrack:  { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  sliderFill:   { height: 6, borderRadius: 3 },
  sliderThumb: {
    position: "absolute",
    top: (40 - 24) / 2,
    width: 24, height: 24, borderRadius: 12,
    marginLeft: -12,
    backgroundColor: colors.surface,
    borderWidth: 3,
  },
  sliderEnds: { flexDirection: "row", justifyContent: "space-between" },
  sliderEnd:  { fontSize: 11, color: colors.textFaint },

  // ── IO Pins section ─────────────────────────────────────────────────────────
  ioConfigLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  ioConfigText: { fontSize: 13, fontWeight: "700", color: AUX_TINT },
  ioEmpty:      { ...type.caption, color: colors.textMuted, lineHeight: 17 },

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
