import JogPad from "@/src/components/ui/JogPad";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { useJogSpeeds } from "@/src/components/ui/calibration/useJogSpeeds";
import { WizardStepper } from "@/src/components/ui/calibration/WizardStepper";
import {
  Button, buttonTextColor, Card, Chip, ChipGroup, colors, Divider, FormRow, Input, PositionReadout, radii, RadioRow,
  shadows, spacing, type,
} from "@/src/components/ui/kit";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { useKeyboardStableCard } from "@/src/platform/keyboard";
import { conveyorAuxAxis, conveyorStepsPerMm, mmPerSecToStepsPerSec } from "@/src/models/conveyors";
import type { AuxDeviceState, Conveyor, ConveyorCalibration, ConveyorSample } from "@/src/models/robotModels";
import { useConveyorStatus, useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { Check, ChevronLeft, ChevronRight, Crosshair, Square, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BeltStrip } from "./BeltStrip";
import { conveyorErrorText } from "./conveyorHooks";

type StepKey = "a" | "b" | "sensor" | "window" | "review";
const STEP_LABELS: Record<StepKey, string> = { a: "Mark A", b: "Mark B", sensor: "Sensor", window: "Window", review: "Review" };

/** Jog speeds offered while landing the tip on a mark (as the camera calibration's teach step). */
const SPEEDS = ["0.1mm", "1mm", "10mm", "Slow", "Normal"];
/** Window length the wizard proposes after the sensor offset (doc § Calibration). */
const DEFAULT_WINDOW_MM = 300;
const DEFAULT_RUN_MM_S = 50;

export type ConveyorCalibrationResult = Pick<Conveyor, "frame" | "scale" | "window"> & { sensorOffsetMm: number };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The conveyor being calibrated (saved — the commands go by its id). */
  conveyor: Conveyor;
  auxDevices: AuxDeviceState[];
  /** Apply + save the result. Resolves true when saved (the wizard then closes). */
  onSave: (result: ConveyorCalibrationResult) => Promise<boolean>;
  /** Open on this step (dev/audit hook; normally the first). */
  initialStep?: StepKey;
};

/**
 * Conveyor calibration, one step at a time in a modal (controller docs/conveyor-tracking.md
 * § Calibration): sample a belt mark (A), run the belt and sample the same mark again (B, optional
 * C) → the controller proposes the frame and scale; optionally sample a part the sensor latched →
 * the sensor offset; then the pick window. The proposal is shown before anything is saved.
 */
export function ConveyorCalibrateWizard({ visible, onClose, conveyor, auxDevices, onSave, initialStep }: Props) {
  const insets = useSafeAreaInsets();
  const wide = usePaneLayout() === "desktop";
  // The jog pad sizes its buttons to the window width; inside the modal's padding that overflows a
  // phone, so cap it by height instead (4 columns of buttons in the card's inner width, 3 rows).
  const { width: winW } = useWindowDimensions();
  const padMaxH = wide ? 360 : Math.max(150, Math.min(300, ((winW - 120) / 4) * 3 + 16));
  const robot = useRobotStatus();
  const live = useConveyorStatus(conveyor.id);
  const jogSpeeds = useJogSpeeds();
  const { scrollRef: kbScrollRef, onScroll: kbOnScroll, onCardLayout: kbOnCardLayout,
          cardStyle: kbCardStyle, contentPaddingBottom: kbPadBottom } = useKeyboardStableCard(visible);

  const steps: StepKey[] = useMemo(
    () => (conveyor.sensor.kind === "none" ? ["a", "b", "window", "review"] : ["a", "b", "sensor", "window", "review"]),
    [conveyor.sensor.kind],
  );

  const [step, setStep] = useState<StepKey>("a");
  const [samples, setSamples] = useState<ConveyorSample[]>([]);
  const [proposal, setProposal] = useState<ConveyorCalibration | null>(null);
  const [partId, setPartId] = useState<string | null>(null);
  const [sensorDone, setSensorDone] = useState(false);
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");
  const [speed, setSpeed] = useState("1mm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh start on every open (deferred, as the load-cell wizard does, for the react-compiler rule).
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setStep(initialStep && steps.includes(initialStep) ? initialStep : "a");
      setSamples([]); setProposal(null); setPartId(null); setSensorDone(false);
      setWinStart(String(conveyor.window.startMm)); setWinEnd(String(conveyor.window.endMm));
      setBusy(false); setError(null);
    }, 0);
    return () => clearTimeout(t);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const index = steps.indexOf(step);
  // How far the stepper lets you jump: each step opens once the one before it has what it needs.
  // (The sensor step is optional, so a computed frame opens everything after it.)
  const reachable = Math.max(
    proposal ? steps.length - 1 : samples[0] ? 1 : 0,
    initialStep ? steps.indexOf(initialStep) : 0,
    index,
  );

  const go = (k: StepKey) => { setError(null); setStep(k); };
  const next = () => { const n = steps[index + 1]; if (n) go(n); };
  const back = () => { const p = steps[index - 1]; if (p) go(p); };

  const saved = !!conveyor.id;
  const sensorOffset = proposal?.sensorOffsetMm ?? conveyor.sensor.offsetMm;

  // ── Commands ───────────────────────────────────────────────────────────────
  const call = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null);
    try { return await fn(); }
    catch (e) { setError(conveyorErrorText(e)); return undefined; }
    finally { setBusy(false); }
  };

  const sample = async (slot: number) => {
    const s = await call(() => robotClient.conveyorSample(conveyor.id));
    if (!s) return;
    setSamples(prev => { const n = prev.slice(0, slot); n[slot] = s; return n; });
    if (slot === 0) setProposal(null);
  };

  const calibrate = async (sensorSample?: { x: number; y: number; z: number; travelMm: number; latchTravelMm: number }) => {
    const p = await call(() => robotClient.conveyorCalibrate(
      conveyor.id, samples.map(({ x, y, z, travelMm }) => ({ x, y, z, travelMm })), sensorSample));
    if (p) setProposal(prev => (sensorSample || !prev ? p : { ...p, sensorOffsetMm: prev.sensorOffsetMm }));
    return p;
  };

  const computeFrame = async () => {
    const p = await calibrate();
    if (p) {
      // Default window: from the sensor offset, DEFAULT_WINDOW_MM long.
      const from = p.sensorOffsetMm ?? conveyor.sensor.offsetMm;
      if (conveyor.window.startMm === 0 && conveyor.window.endMm === DEFAULT_WINDOW_MM) {
        setWinStart(String(Math.round(from))); setWinEnd(String(Math.round(from + DEFAULT_WINDOW_MM)));
      }
      next();
    }
  };

  // Sensor offset: the part's latch travel follows from its reported X — x = offset + (travel − latch).
  // Nearest the sensor first: the part latched last is the one just past it.
  const parts = useMemo(() => [...(live?.parts ?? [])].sort((a, b) => a.x - b.x), [live?.parts]);
  const chosenPart = parts.find(p => p.id === partId) ?? parts[0] ?? null;
  const sampleSensor = async () => {
    if (!chosenPart) return;
    const s = await call(() => robotClient.conveyorSample(conveyor.id));
    if (!s) return;
    const latchTravelMm = chosenPart.travelAtLatch ?? s.travelMm - (chosenPart.x - conveyor.sensor.offsetMm);
    const p = await calibrate({ x: s.x, y: s.y, z: s.z, travelMm: s.travelMm, latchTravelMm });
    if (p) {
      setSensorDone(true);
      if (p.sensorOffsetMm != null) {
        setWinStart(String(Math.round(p.sensorOffsetMm))); setWinEnd(String(Math.round(p.sensorOffsetMm + DEFAULT_WINDOW_MM)));
      }
    }
  };

  // ── Belt controls (step B / sensor) ─────────────────────────────────────────
  const aux = conveyorAuxAxis(conveyor, auxDevices);
  const spm = conveyorStepsPerMm(conveyor, aux?.axis);
  const runMmS = aux?.axis.actionVelocity && aux.axis.actionVelocity > 0 ? aux.axis.actionVelocity : DEFAULT_RUN_MM_S;
  const runBelt = (dir: 1 | -1) => aux && call(() => robotClient.jogAux({
    deviceId: aux.device.deviceId, axis: aux.axis.axisIndex, velocity: dir * mmPerSecToStepsPerSec(runMmS, spm) }));
  const stopBelt = () => aux && call(() => robotClient.stopAux(aux.device.deviceId, aux.axis.axisIndex));
  const advanceManual = (mm: number) => call(() => robotClient.conveyorSetTravel(conveyor.id, (live?.travelMm ?? 0) + mm));

  const beltControls = (
    <Card style={s.cardGap}>
      <View style={s.rowBetween}>
        <Text style={s.label}>Belt</Text>
        <Text style={s.mono}>{live ? `${live.travelMm.toFixed(1)} mm · ${live.speedMmS.toFixed(1)} mm/s` : "no live data"}</Text>
      </View>
      {conveyor.source.kind === "aux" && (
        <View style={s.buttons}>
          <Button label="Forward" size="sm" variant="secondary" style={s.grow} disabled={!aux || !(spm > 0) || busy}
            icon={<ChevronRight size={16} color={buttonTextColor("secondary")} />} onPress={() => runBelt(1)} />
          <Button label="Stop" size="sm" variant="dangerSoft" style={s.grow} disabled={!aux}
            icon={<Square size={12} color={buttonTextColor("dangerSoft")} />} onPress={stopBelt} />
        </View>
      )}
      {conveyor.source.kind === "timed" && (
        <Text style={s.caption}>Switch the belt&apos;s run output on, let it carry the mark downstream, then switch it off.</Text>
      )}
      {conveyor.source.kind === "manual" && (
        <View style={s.buttons}>
          <Button label="+100 mm" size="sm" variant="secondary" onPress={() => advanceManual(100)} />
          <Button label="+250 mm" size="sm" variant="secondary" onPress={() => advanceManual(250)} />
        </View>
      )}
    </Card>
  );

  const jogPane = (
    <View style={[s.pane, wide && s.paneWide]}>
      <Card style={s.cardGap}>
        <View style={s.rowBetween}>
          <Text style={s.label}>Tool</Text>
          <Text style={type.title}>{robot.activeTool || "None"}</Text>
        </View>
        <PositionReadout card={false} axes={[
          { label: "X", value: robot.x, unit: "mm" },
          { label: "Y", value: robot.y, unit: "mm" },
          { label: "Z", value: robot.z, unit: "mm" },
        ]} />
      </Card>
      <Card style={[s.cardGap, s.center]}>
        <ChipGroup>
          {SPEEDS.map(v => <Chip key={v} label={v} selected={speed === v} onPress={() => setSpeed(v)} />)}
        </ChipGroup>
        <JogPad jogMode="XYZ" selectedSpeed={speed} speedOverrides={jogSpeeds} maxHeight={padMaxH} />
        <Text style={s.caption}>Steps move once per tap; Slow/Normal jog while held.</Text>
      </Card>
    </View>
  );

  const sampleLine = (label: string, sm: ConveyorSample | undefined) => (
    <View style={s.rowBetween}>
      <Text style={type.title}>{label}</Text>
      {sm
        ? <Text style={s.mono}>{`${sm.x.toFixed(1)}, ${sm.y.toFixed(1)}, ${sm.z.toFixed(1)} · belt ${sm.travelMm.toFixed(1)}`}</Text>
        : <Text style={s.caption}>not sampled</Text>}
    </View>
  );

  const sampleButton = (label: string, slot: number, enabled = true) => (
    <Button
      label={samples[slot] ? `Re-sample ${label}` : `Sample ${label}`}
      icon={<Crosshair size={16} color={buttonTextColor("primary")} />}
      disabled={!saved || !enabled}
      loading={busy}
      onPress={() => sample(slot)}
      style={s.grow}
    />
  );

  // ── Step bodies ─────────────────────────────────────────────────────────────
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === "a") {
    body = (
      <View style={[s.panes, wide && s.panesWide]}>
        <View style={[s.pane, wide && s.paneWide]}>
          <Text style={s.body}>
            Put a mark on the belt near the upstream end of where the robot can reach. Jog the tool tip
            exactly onto it, then take sample A. Keep the belt still while sampling.
          </Text>
          <Card style={s.cardGap}>
            {sampleLine("A", samples[0])}
            {sampleButton("A", 0)}
          </Card>
        </View>
        {jogPane}
      </View>
    );
    footer = <Button label="Next: Mark B" onPress={next} disabled={!samples[0]} style={s.grow} />;
  } else if (step === "b") {
    const moved = samples[0] && live ? live.travelMm - samples[0].travelMm : null;
    body = (
      <View style={[s.panes, wide && s.panesWide]}>
        <View style={[s.pane, wide && s.paneWide]}>
          <Text style={s.body}>
            Run the belt forward so the mark moves well downstream (the further, the better the fit),
            stop it, and jog the tip onto the same mark → sample B. A third sample further on (C) checks the fit.
          </Text>
          {beltControls}
          <Card style={s.cardGap}>
            {sampleLine("A", samples[0])}
            {sampleLine("B", samples[1])}
            {samples[1] && sampleLine("C", samples[2])}
            {moved != null && !samples[1] && <Text style={s.caption}>{`Belt moved ${moved.toFixed(1)} mm since A.`}</Text>}
            <View style={s.buttons}>
              {sampleButton("B", 1, !!samples[0])}
              {samples[1] && sampleButton("C", 2)}
            </View>
          </Card>
        </View>
        {jogPane}
      </View>
    );
    footer = (
      <>
        <Button label="Back" variant="secondary" icon={<ChevronLeft size={15} color={buttonTextColor("secondary")} />} onPress={back} />
        <Button label="Compute frame" onPress={computeFrame} loading={busy} disabled={samples.length < 2} style={s.grow} />
      </>
    );
  } else if (step === "sensor") {
    body = (
      <View style={[s.panes, wide && s.panesWide]}>
        <View style={[s.pane, wide && s.paneWide]}>
          <Text style={s.body}>
            Let a part pass the sensor so it is latched, stop the belt, then jog the tip onto the
            part&apos;s leading reference and sample. The offset is the part&apos;s X in the frame minus the belt travel since the latch.
          </Text>
          {beltControls}
          <Card padded={false}>
            {parts.length === 0 ? (
              <Text style={[s.caption, s.pad]}>No parts queued yet — run a part past the sensor.</Text>
            ) : parts.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <Divider />}
                <RadioRow
                  title={`Part ${p.id}`}
                  subtitle={`x ${p.x.toFixed(1)} mm`}
                  selected={chosenPart?.id === p.id}
                  onPress={() => setPartId(p.id)}
                  style={s.radioPad}
                />
              </View>
            ))}
          </Card>
          <Button
            label={sensorDone ? "Re-sample part" : "Sample part"}
            icon={<Crosshair size={16} color={buttonTextColor("primary")} />}
            disabled={!chosenPart || !saved}
            loading={busy}
            onPress={sampleSensor}
          />
          {sensorDone && proposal?.sensorOffsetMm != null && (
            <Notice tone="info" title={`Sensor offset ${proposal.sensorOffsetMm.toFixed(1)} mm`} />
          )}
        </View>
        {jogPane}
      </View>
    );
    footer = (
      <>
        <Button label="Back" variant="secondary" icon={<ChevronLeft size={15} color={buttonTextColor("secondary")} />} onPress={back} />
        <Button label={sensorDone ? "Next: Window" : "Skip"} variant={sensorDone ? "primary" : "secondary"} onPress={next} style={s.grow} />
      </>
    );
  } else if (step === "window") {
    const ws = parseFloat(winStart), we = parseFloat(winEnd);
    const valid = isFinite(ws) && isFinite(we) && we > ws;
    body = (
      <View style={s.pane}>
        <Text style={s.body}>
          The window is where along the belt (conveyor X, mm) the robot may track a part. A part past its end is dropped as missed.
        </Text>
        <Card style={s.cardGap}>
          <BeltStrip conveyor={{ ...conveyor, sensor: { ...conveyor.sensor, offsetMm: sensorOffset } }} status={live}
            windowOverride={valid ? { startMm: ws, endMm: we } : undefined} />
          <View style={s.buttons}>
            <FormRow label="Start (mm)" style={s.grow}>
              <Input value={winStart} onChangeText={setWinStart} keyboardType="numbers-and-punctuation" returnKeyType="next"
                selectTextOnFocus accessibilityLabel="Window start (mm)" style={type.mono} />
            </FormRow>
            <FormRow label="End (mm)" style={s.grow}>
              <Input value={winEnd} onChangeText={setWinEnd} keyboardType="numbers-and-punctuation" returnKeyType="done"
                selectTextOnFocus accessibilityLabel="Window end (mm)" style={type.mono} />
            </FormRow>
          </View>
          <View style={s.buttons}>
            <Button label={`From sensor → +${DEFAULT_WINDOW_MM}`} size="sm" variant="ghost" onPress={() => {
              setWinStart(String(Math.round(sensorOffset))); setWinEnd(String(Math.round(sensorOffset + DEFAULT_WINDOW_MM)));
            }} />
          </View>
          {!valid && <Text style={s.error}>End must be past start.</Text>}
        </Card>
      </View>
    );
    footer = (
      <>
        <Button label="Back" variant="secondary" icon={<ChevronLeft size={15} color={buttonTextColor("secondary")} />} onPress={back} />
        <Button label="Next: Review" onPress={next} disabled={!valid} style={s.grow} />
      </>
    );
  } else {
    const ws = parseFloat(winStart), we = parseFloat(winEnd);
    const residual = proposal?.residualMm ?? null;
    const rows: [string, string][] = proposal ? [
      ["Frame X", `${proposal.frame.x.toFixed(2)} mm`],
      ["Frame Y", `${proposal.frame.y.toFixed(2)} mm`],
      ["Frame Z", `${proposal.frame.z.toFixed(2)} mm`],
      ["Frame RZ", `${proposal.frame.rz.toFixed(2)}°`],
      ["Scale", proposal.scale.toFixed(4)],
      ["Residual", residual != null ? `${residual.toFixed(2)} mm` : "—"],
      ["Sensor offset", `${sensorOffset.toFixed(1)} mm${proposal.sensorOffsetMm == null ? " (unchanged)" : ""}`],
      ["Window", `${ws} → ${we} mm`],
    ] : [];
    body = (
      <View style={s.pane}>
        {!proposal ? (
          <Notice tone="warning" title="No frame yet">Sample marks A and B and compute the frame first.</Notice>
        ) : (
          <>
            <Text style={s.body}>The controller&apos;s proposal. Nothing is saved until you press Save.</Text>
            <Card padded={false}>
              {rows.map(([k, v], i) => (
                <View key={k} style={[s.tr, i > 0 && s.trBorder]}>
                  <Text style={s.th}>{k}</Text>
                  <Text style={s.td}>{v}</Text>
                </View>
              ))}
            </Card>
            {residual != null && residual > 2 && (
              <Notice tone="warning" title="The samples don't agree well">
                A residual over 2 mm usually means the tip wasn&apos;t on the same mark each time, or the belt moved while sampling. Re-sample for a better fit.
              </Notice>
            )}
          </>
        )}
      </View>
    );
    footer = (
      <>
        <Button label="Back" variant="secondary" icon={<ChevronLeft size={15} color={buttonTextColor("secondary")} />} onPress={back} />
        <Button
          label="Save calibration"
          icon={<Check size={16} color={buttonTextColor("primary")} />}
          disabled={!proposal || !(we > ws)}
          loading={busy}
          style={s.grow}
          onPress={async () => {
            if (!proposal) return;
            setBusy(true);
            const ok = await onSave({ frame: proposal.frame, scale: proposal.scale, sensorOffsetMm: sensorOffset, window: { startMm: ws, endMm: we } });
            setBusy(false);
            if (ok) onClose();
          }}
        />
      </>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          onLayout={kbOnCardLayout}
          style={[s.card, wide && s.cardWide, { marginTop: insets.top + spacing.md, marginBottom: insets.bottom + spacing.md }, kbCardStyle]}
        >
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>{`Calibrate ${conveyor.name || "conveyor"}`}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close calibration"><X size={20} color={colors.textFaint} /></Pressable>
          </View>
          <WizardStepper steps={steps.map(k => STEP_LABELS[k])} current={index} reachable={reachable} onStep={k => go(steps[k])} />
          <ScrollView
            ref={kbScrollRef}
            onScroll={kbOnScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            style={s.scroll}
            contentContainerStyle={[s.scrollContent, { paddingBottom: kbPadBottom }]}
          >
            {!saved && <Notice tone="warning" title="Save the conveyor first">Sampling needs the conveyor saved on the controller.</Notice>}
            {error && <Notice tone="danger" title="Couldn't do that">{error}</Notice>}
            {body}
          </ScrollView>
          <View style={s.footer}>{footer}</View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: "center" },
  card: {
    flex: 1, alignSelf: "stretch", marginHorizontal: spacing.md,
    backgroundColor: colors.background, borderRadius: radii.xl, overflow: "hidden",
    padding: spacing.lg, gap: spacing.md, ...shadows.raised,
  },
  cardWide: { alignSelf: "center", width: "100%", maxWidth: 980 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { ...type.pageTitle, fontSize: 17, flexShrink: 1 },
  scroll: { flexShrink: 1, minHeight: 0 },
  scrollContent: { gap: spacing.lg },
  footer: { flexDirection: "row", gap: spacing.sm, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },

  panes: { gap: spacing.lg },
  panesWide: { flexDirection: "row", alignItems: "flex-start" },
  pane: { gap: spacing.md },
  paneWide: { flex: 1, minWidth: 0 },
  cardGap: { gap: spacing.md },
  center: { alignItems: "center" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  grow: { flexGrow: 1, flexBasis: 0 },
  label: { ...type.sectionLabel },
  body: { ...type.body, lineHeight: 20 },
  caption: { ...type.caption, fontSize: 12 },
  mono: { ...type.mono, fontSize: 12 },
  error: { fontSize: 12, color: colors.danger },
  pad: { padding: spacing.md },
  radioPad: { paddingHorizontal: spacing.md + 2 },
  tr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md + 2, gap: spacing.sm },
  trBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  th: { ...type.body },
  td: { ...type.mono },
});
