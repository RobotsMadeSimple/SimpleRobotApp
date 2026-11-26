import { JogButton } from "@/src/components/ui/JogButton";
import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { DeviceStatusBar, FirmwareChip, ios, IORow } from "@/src/components/ui/io/ioShared";
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
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Gauge,
  House,
  Pencil,
  RefreshCw,
  Settings2,
  Square,
} from "lucide-react-native";
import { auxRoleMeta } from "@/src/components/ui/io/auxRoles";
import { useKeyboardHeight } from "@/src/platform/keyboard";
import { useLocalSearchParams } from "expo-router";
import { usePushOnce } from "@/src/hooks/usePushOnce";
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
  buttonTextColor,
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
  StatusPill,
  spacing,
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
// Identity only (the role icon tiles): interactive controls use the app accent, so the
// colour of a control always means "you can press this" (display-design §1.2).
const AUX_TINT       = accents.purple;
const AUX_TINT_SOFT  = accents.purpleSoft;

/** Height of every axis control (jog / action buttons): above the 44 px touch minimum. */
const CONTROL_H = 52;

// ── AxisReadout ───────────────────────────────────────────────────────────────
// The axis's live value as the card's content: small uppercase label, large tabular value,
// lighter unit at its baseline (display-design §3.1). `right` holds an optional inline action.

function AxisReadout({ label, value, unit, right }: {
  label: string;
  value: string;
  unit?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.readout}>
      <View style={styles.readoutMain}>
        <Text style={styles.readoutLabel}>{label}</Text>
        <View style={styles.readoutValueRow}>
          <Text style={styles.readoutValue} numberOfLines={1}>{value}</Text>
          {!!unit && <Text style={styles.readoutUnit}>{unit}</Text>}
        </View>
      </View>
      {right}
    </View>
  );
}

// ── OverviewStat ──────────────────────────────────────────────────────────────
// A compact label-over-value pair inside the device overview card.

function OverviewStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.overviewStat}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <View style={styles.readoutValueRow}>
        <Text style={styles.overviewValue}>{value}</Text>
        {!!unit && <Text style={styles.readoutUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

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

  // Tonal hold-to-jog button that shares the row's width: accent text on the soft accent
  // fill (interactive, never the page's one filled primary), firming to an accent border
  // while held.
  return (
    <JogButton
      label={label ?? (direction === -1 ? "Jog −" : "Jog +")}
      icon={
        icon ?? (direction === -1
          ? <ChevronLeft  size={22} color={colors.accent} />
          : <ChevronRight size={22} color={colors.accent} />)
      }
      iconPosition={direction === -1 ? "left" : "right"}
      onStart={startJog}
      onStop={stopJog}
      size={CONTROL_H}
      fill
      labelSize={15}
      color={colors.accent}
      restBg={colors.accentSoft}
      restBorder={colors.accentSoft}
      activeBg={colors.accentSoft}
      activeColor={colors.accent}
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

/** The configured action velocity as motor steps/s. actionVelocity is in the axis unit/s
 *  (mm/s Linear, deg/s Rotary — as the aux-axis settings label it); untyped axes treat it as
 *  raw steps/s. Unset falls back to 800 steps/s. */
function actionStepsPerSec(axis: AuxAxisChannelState): number {
  if (!(axis.actionVelocity > 0)) return 800;
  const spu = auxStepsPerUnit(axis);
  return axis.axisType && spu > 0
    ? Math.max(1, Math.round(axis.actionVelocity * spu))
    : Math.round(axis.actionVelocity);
}

// ── AuxActionButton ───────────────────────────────────────────────────────────
// Tap (one-shot) companion to AuxJogButton — used for role actions like gripper
// Open/Close, conveyor Run/Stop and rotary indexing.

function AuxActionButton({
  label,
  icon,
  onPress,
  tone = "default",
  disabled = false,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  // Same footprint as the jog buttons (row-filling, CONTROL_H tall). Tonal accent for
  // actions; Stop is soft red — clear, one tap, never a big filled block.
  const danger = tone === "danger";
  return (
    <AnimatedPressable
      style={[styles.actionBtn, danger ? styles.actionBtnDanger : styles.actionBtnTonal]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <View style={[styles.actionBtnContent, disabled && styles.actionBtnDisabled]}>
        {icon}
        <Text style={[styles.actionBtnText, { color: danger ? colors.danger : colors.accent }]} numberOfLines={1}>
          {label}
        </Text>
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
              style={styles.setPosBtn}
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
              style={styles.setPosBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Drag-to-position slider for the gripper gap. The thumb follows the tracked jaw gap
// when idle and the finger while dragging; it reports the chosen mm value once, on release.
// The gap readout lives in the axis card's readout row (GripperControls); `onDrag` feeds it
// the target under the finger while dragging (null when released).
function GripperSlider({ lo, hi, trackedMm, tint, onEnd, onDrag }: {
  lo: number;
  hi: number;
  trackedMm: number;
  tint: string;
  onEnd: (mm: number) => void;
  onDrag: (mm: number | null) => void;
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

  const update   = (f: number) => { setDragFrac(f); onDrag(toMm(f)); };
  const finishAt = (f: number) => { setDragFrac(null); onDrag(null); onEnd(toMm(f)); };

  const pan = Gesture.Pan()
    .onBegin(e  => { "worklet"; const f = Math.max(0, Math.min(1, e.x / barW)); lastFrac.value = f; runOnJS(update)(f); })
    .onUpdate(e => { "worklet"; const f = Math.max(0, Math.min(1, e.x / barW)); lastFrac.value = f; runOnJS(update)(f); })
    .onFinalize(() => { "worklet"; runOnJS(finishAt)(lastFrac.value); });

  return (
    <View style={styles.sliderWrap}>
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
  const [dragMm, setDragMm]     = useState<number | null>(null);

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

  const trackedMm = axis.position / g.spm;

  return (
    <View style={styles.gripperControls}>
      <AxisReadout
        label={dragMm != null ? "Gap · target" : "Gap"}
        value={(dragMm ?? trackedMm).toFixed(1)}
        unit="mm"
        right={
          <Button
            label="Exact gap"
            variant="ghost"
            size="md"
            style={styles.exactGapBtn}
            icon={<Pencil size={14} color={buttonTextColor("ghost")} />}
            onPress={() => setGapModal(true)}
          />
        }
      />
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
        trackedMm={trackedMm}
        tint={colors.accent}
        onEnd={driveToGap}
        onDrag={setDragMm}
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

// ── Silo ──────────────────────────────────────────────────────────────────────
// A stack of identical parts on a platform this axis lifts (controller docs/aux-silo.md). The
// controller owns the count and the homed flag; the buttons send SiloAction, which acks once the
// motion has finished. An older controller doesn't report siloCount and rejects the command —
// the card then says so instead of failing silently.

type SiloActionName = "Home" | "Present" | "Refill" | "SetCount";

/** A rejected SiloAction as one readable line. */
function siloErrorText(e: unknown): string {
  const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Silo action failed";
  if (/unknown command|not supported|unsupported/i.test(msg)) return "This controller doesn't support silo actions yet — update it.";
  if (/siloNotHomed/i.test(msg)) return "Home the silo first.";
  if (/siloEmpty/i.test(msg)) return "The silo is empty — refill it.";
  if (/siloTimeout/i.test(msg)) return "The silo move did not finish in time.";
  if (/siloStopped/i.test(msg)) return "The silo move was stopped before it finished — home it again.";
  return msg;
}

// Type the number of parts now in the silo (no motion).
function SiloSetCountModal({ capacity, current, onSet, onClose }: {
  capacity: number;
  current: number;
  onSet: (count: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(current));
  const n     = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && (capacity <= 0 || n <= capacity);
  const kb    = useKeyboardHeight(); // lift the sheet clear of the keyboard (Modals aren't resized)
  const submit = () => { if (valid) { onSet(n); onClose(); } };
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalBackdrop, { paddingBottom: kb }]}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>Set Part Count</Text>
              <InfoTip text="Tells the controller how many parts are in the silo now, without moving the platform. Use it after loading or removing parts by hand." />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <FormRow label={capacity > 0 ? `Parts in the silo (0–${capacity})` : "Parts in the silo"}>
            <Input
              value={value}
              onChangeText={setValue}
              placeholder={String(current)}
              keyboardType="number-pad"
              returnKeyType="done"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={submit}
            />
          </FormRow>
          <View style={styles.setPosBtnRow}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.setPosBtn} />
            <Button label="Set count" disabled={!valid} onPress={submit} style={styles.setPosBtn} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SiloControls({ device, axis }: { device: AuxDeviceState; axis: AuxAxisChannelState }) {
  const [busy, setBusy]           = useState<SiloActionName | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [countModal, setCountModal] = useState(false);

  // Older controllers don't report the silo fields at all.
  const reported = axis.siloCount != null || axis.siloHomed != null;
  const count    = axis.siloCount ?? 0;
  const capacity = axis.siloCapacity ?? 0;
  const homed    = axis.siloHomed === true;
  const configured = (axis.siloPitchMm ?? 0) > 0 && capacity > 0 && auxStepsPerUnit(axis) > 0;

  const run = async (action: SiloActionName, n?: number) => {
    setBusy(action);
    setError(null);
    try {
      await robotClient.siloAction(device.deviceId, axis.axisIndex, action, n);
    } catch (e) {
      setError(siloErrorText(e));
    } finally {
      setBusy(null);
      robotClient.getAuxState().catch(() => {});
    }
  };

  const label = (action: SiloActionName, idle: string, working: string) => (busy === action ? working : idle);

  return (
    <View style={styles.gripperControls}>
      <AxisReadout
        label="Parts"
        value={reported ? String(count) : "—"}
        unit={capacity > 0 ? `of ${capacity}` : undefined}
        right={
          <View style={styles.siloRight}>
            {reported && (
              <StatusPill label={homed ? "Homed" : "Not homed"} tone={homed ? "success" : "warning"} dot />
            )}
            <Button
              label="Set count"
              variant="ghost"
              size="md"
              style={styles.exactGapBtn}
              icon={<Pencil size={14} color={buttonTextColor("ghost")} />}
              onPress={() => setCountModal(true)}
              disabled={busy != null}
            />
          </View>
        }
      />
      <View style={styles.jogRow}>
        <AuxActionButton
          label={label("Home", "Home", "Homing…")}
          icon={<House size={16} color={colors.accent} />}
          onPress={() => run("Home")}
          disabled={busy != null}
        />
        <AuxActionButton
          label={label("Present", "Present next", "Lifting…")}
          icon={<ArrowUpFromLine size={16} color={colors.accent} />}
          onPress={() => run("Present")}
          disabled={busy != null || (reported && (!homed || count < 1))}
        />
        <AuxActionButton
          label={label("Refill", "Refill", "Refilling…")}
          icon={<RefreshCw size={16} color={colors.accent} />}
          onPress={() => run("Refill")}
          disabled={busy != null}
        />
      </View>
      {error ? (
        <Text style={styles.siloError} numberOfLines={2}>{error}</Text>
      ) : !configured ? (
        <Text style={styles.needsConfig} numberOfLines={2}>
          Set the part pitch, capacity and mm per rev in configuration (gear icon) before homing.
        </Text>
      ) : reported && !homed ? (
        <Text style={styles.needsConfig} numberOfLines={2}>Home the silo before presenting a part.</Text>
      ) : null}
      {countModal && (
        <SiloSetCountModal
          capacity={capacity}
          current={count}
          onSet={n => run("SetCount", n)}
          onClose={() => setCountModal(false)}
        />
      )}
    </View>
  );
}

// ── AuxDeviceDetail ───────────────────────────────────────────────────────────

function AuxDeviceDetail({ device, isWide }: { device: AuxDeviceState; isWide: boolean }) {
  const pushOnce = usePushOnce();
  const [setPosAxis, setSetPosAxis] = useState<AuxAxisChannelState | null>(null);

  // The Uno's spare-pin digital IO rides the shared IO-device stream under this device's id.
  const ioDevice = useIoDevices().find(d => d.id === device.deviceId);
  const ioPins   = ioDevice?.pins ?? [];
  // A board whose firmware reports its capabilities but lacks `io` can't do pin IO at all;
  // legacy firmware (no capability report) is assumed able, as before.
  const ioSupported = deviceSupports(device, "io");
  const configureIo = () =>
    pushOnce({ pathname: "/(tabs)/io/configure", params: { deviceId: device.deviceId, kind: "aux" } });

  // Position readout in the axis's configured unit (raw steps when untyped), as value + unit
  // so the unit can sit lighter beside the number.
  const posParts = (axis: AuxAxisChannelState): { value: string; unit: string } => {
    const spu = auxStepsPerUnit(axis);
    if (axis.axisType && spu > 0) {
      return { value: (axis.position / spu).toFixed(2), unit: auxUnitLabel(axis) };
    }
    return { value: String(axis.position ?? 0), unit: "steps" };
  };

  // Card body per role: the live readout, then the role's controls in a full-width row.
  // Gripper owns its readout (it tracks the slider's drag target).
  const renderAxisControls = (axis: AuxAxisChannelState) => {
    const axisIndex = axis.axisIndex;
    const vel       = actionStepsPerSec(axis);   // steps/s — JogAux/MoveAux velocities are in steps
    const steps     = actionSteps(axis);
    const pos       = posParts(axis);
    const readout   = <AxisReadout label="Position" value={pos.value} unit={pos.unit} />;

    switch (axis.role) {
      case "Gripper":
        return <GripperControls device={device} axis={axis} />;
      case "Silo":
        return <SiloControls device={device} axis={axis} />;
      case "Conveyor":
        return (
          <>
            {readout}
            <View style={styles.jogRow}>
              <AuxActionButton
                label="Reverse"
                icon={<ChevronLeft size={20} color={colors.accent} />}
                onPress={() => robotClient.jogAux({ deviceId: device.deviceId, axis: axisIndex, velocity: -vel })}
              />
              <AuxActionButton
                label="Stop"
                tone="danger"
                icon={<Square size={14} color={colors.danger} />}
                onPress={() => robotClient.stopAux(device.deviceId, axisIndex)}
              />
              <AuxActionButton
                label="Forward"
                icon={<ChevronRight size={20} color={colors.accent} />}
                onPress={() => robotClient.jogAux({ deviceId: device.deviceId, axis: axisIndex, velocity: vel })}
              />
            </View>
          </>
        );
      case "RotaryTable":
        return (
          <>
            {readout}
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
          </>
        );
      default: // Generic and unconfigured ("") — hold-to-jog.
        return (
          <>
            {readout}
            <View style={styles.jogRow}>
              <AuxJogButton deviceId={device.deviceId} axisIndex={axisIndex} direction={-1} />
              <AuxJogButton deviceId={device.deviceId} axisIndex={axisIndex} direction={1} />
            </View>
          </>
        );
    }
  };

  const configuredAxes = device.axes.filter(a => !!a.axisType).length;

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

      {/* Device overview: the one device-wide control (motor drivers) plus the axis summary,
          in a single card — replaces a stat row that repeated the switch's state. */}
      <Card padded={false}>
        <View style={[styles.overview, isWide && styles.overviewWide]}>
          <View style={[styles.overviewMotor, isWide && styles.overviewMotorWide]}>
            <View style={styles.readoutMain}>
              <View style={styles.overviewLabelRow}>
                <Text style={styles.readoutLabel}>Motor drivers</Text>
                <InfoTip size={12} text="Enabling motor drivers powers the stepper output for every axis on this device. Axes won't move while disabled, and the switch is locked out until the device is connected." />
              </View>
              <Text style={styles.overviewValue}>{shownEnabled ? "Enabled" : "Disabled"}</Text>
              <Text style={styles.overviewMeta} numberOfLines={2}>
                {device.connected ? "Powers every axis on this device" : "Connect the device to change"}
              </Text>
            </View>
            <Switch
              value={shownEnabled}
              onValueChange={toggleEnable}
              disabled={!device.connected}
              trackColor={{ false: colors.border, true: colors.accentFaded }}
              thumbColor={shownEnabled ? colors.accent : colors.surface}
              accessibilityLabel="Motor drivers"
            />
          </View>
          <Divider vertical={isWide} style={isWide ? styles.overviewVDivider : styles.overviewHDivider} />
          <View style={styles.overviewStats}>
            <OverviewStat label="Axes" value={String(device.axes.length)} />
            <OverviewStat label="Configured" value={String(configuredAxes)} unit={`of ${device.axes.length}`} />
          </View>
        </View>
      </Card>

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
              const subLabel  = axis.axisType ? roleLabel : `${roleLabel} · not configured`;
              // Each axis is its own self-contained card: an identity header (role tile, name,
              // role; set-position + configure as quiet icon buttons), then its live readout
              // and controls. In the wide grid, cards in a row share a height and the controls
              // sit on the bottom edge, so rows line up.
              const card = (
                <Card padded={false} style={isWide && styles.axisCardWide}>
                  <View style={styles.axisHeader}>
                    <View style={styles.roleIcon}>
                      <RoleIcon size={18} color={AUX_TINT} />
                    </View>
                    <View style={styles.axisHeaderInfo}>
                      <Text style={styles.axisName} numberOfLines={1}>
                        {axis.name || `Axis ${axis.axisIndex}`}
                      </Text>
                      <Text style={styles.axisSub} numberOfLines={1}>{subLabel}</Text>
                    </View>
                    <Button
                      label="Set position"
                      variant="ghost"
                      size="md"
                      iconOnly
                      icon={<Crosshair size={18} color={colors.textMuted} />}
                      onPress={() => setSetPosAxis(axis)}
                    />
                    <Button
                      label="Configure axis"
                      variant="ghost"
                      size="md"
                      iconOnly
                      icon={<Settings2 size={18} color={colors.textMuted} />}
                      onPress={() => pushOnce({ pathname: "/io/aux-axis", params: { deviceId: device.deviceId, axis: String(axis.axisIndex) } })}
                    />
                  </View>
                  <Divider style={styles.axisDivider} />
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
            <AnimatedPressable style={styles.ioConfigLink} onPress={configureIo} hitSlop={8} accessibilityRole="button">
              <Settings2 size={15} color={colors.accent} />
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title={device ? device.deviceName : "Aux Stepper"}
        subtitle={device ? "External stepper driver" : "Device not found"}
      />
      <Screen>
        {device ? (
          <>
            <DeviceStatusBar connected={device.connected} chips={<FirmwareChip device={device} />} />
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

  // ── Readouts: small uppercase label, large tabular value, lighter unit ──────
  readout:         { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  readoutMain:     { flex: 1, minWidth: 0, gap: 2 },
  readoutLabel:    type.sectionLabel,
  readoutValueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  readoutValue: {
    fontSize: 26, lineHeight: 32, fontWeight: "600", color: colors.text,
    fontVariant: ["tabular-nums"], letterSpacing: -0.3,
  },
  readoutUnit: { fontSize: 13, color: colors.textFaint, fontWeight: "500" },

  // ── Device overview card: motor drivers + axis summary ──────────────────────
  overview:          { padding: spacing.lg },
  overviewWide:      { flexDirection: "row", alignItems: "center" },
  overviewMotor:     { flexDirection: "row", alignItems: "center", gap: spacing.md },
  overviewMotorWide: { flex: 1 },
  overviewLabelRow:  { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  overviewValue: {
    fontSize: 22, lineHeight: 28, fontWeight: "600", color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  overviewMeta:      { ...type.subtitle, color: colors.textMuted },
  overviewHDivider:  { marginVertical: spacing.md },
  overviewVDivider:  { marginHorizontal: spacing.xl },
  overviewStats:     { flexDirection: "row", gap: spacing.xl },
  overviewStat:      { gap: 2, minWidth: 88 },

  // ── Per-axis card: identity header, then readout + controls ─────────────────
  axisStack:       { gap: spacing.md },
  axisCardWide:    { flex: 1 },
  axisHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
    gap: 0,
  },
  axisHeaderInfo: { flex: 1, minWidth: 0, marginLeft: spacing.sm },
  axisName: type.title,
  axisSub:  { ...type.subtitle, color: colors.textMuted, marginTop: 1 },
  axisDivider: { marginVertical: 0 },
  // Fills the card in the wide grid; space-between keeps the controls on the bottom edge.
  axisControls: { flex: 1, padding: spacing.lg, gap: spacing.md, justifyContent: "space-between" },

  // Role icon tile on each axis card (what the motor drives, at a glance) — the device-type
  // purple is identity, not interaction.
  roleIcon: {
    width: 36, height: 36,
    borderRadius: radii.sm,
    justifyContent: "center", alignItems: "center",
    backgroundColor: AUX_TINT_SOFT,
  },

  // Gripper controls: Open/Close jog row + live gap slider.
  gripperControls: { gap: spacing.md },
  // Ghost button pulled to the card's padding edge so its text lines up with the controls.
  exactGapBtn:     { marginRight: -spacing.lg + spacing.xs },
  needsConfig: { ...type.caption, color: colors.textFaint, lineHeight: 16 },
  siloRight:   { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  siloError:   { ...type.caption, color: colors.danger, lineHeight: 16 },

  // ── Gripper gap slider (live drag-to-position) ──────────────────────────────
  sliderWrap:   { gap: 0 },
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
  sliderEnd:  { fontSize: 12, color: colors.textFaint, fontVariant: ["tabular-nums"] },

  // ── IO Pins section ─────────────────────────────────────────────────────────
  ioConfigLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  ioConfigText: { fontSize: 13, fontWeight: "600", color: colors.accent },
  ioEmpty:      { ...type.body, color: colors.textMuted, lineHeight: 20 },

  reRefHint:    { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  reRefDivider: { marginVertical: spacing.md },

  // Tap action buttons (conveyor / rotary) — same row-filling footprint as the jog buttons.
  actionBtn: {
    flex: 1, height: CONTROL_H,
    borderWidth: 1.5,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  actionBtnTonal:   { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft },
  actionBtnDanger:  { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  actionBtnContent: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtnText:    { fontSize: 14, fontWeight: "600" },
  actionBtnDisabled: { opacity: 0.45 },

  setPosBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  setPosBtn:    { flex: 1 },

  // Wide: axes grid — 2 columns of small cards instead of one long list.
  axisGrid:     { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  axisGridItem: { flexBasis: "48%", flexGrow: 1, minWidth: 300 },

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
