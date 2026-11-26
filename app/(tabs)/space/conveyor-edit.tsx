import { EditorCard, FieldGroup, FieldHint, FieldLabel, SectionHeading } from "@/src/components/space/EditorCard";
import { LocalInput } from "@/src/components/space/OffsetFields";
import { ConveyorCalibrateWizard, type ConveyorCalibrationResult } from "@/src/components/space/conveyor/ConveyorCalibrateWizard";
import { NumField, NumGrid, PickList, type PickOption } from "@/src/components/space/conveyor/ConveyorFields";
import { ConveyorLiveCard } from "@/src/components/space/conveyor/ConveyorLiveCard";
import { conveyorErrorText, useAuxDevices } from "@/src/components/space/conveyor/conveyorHooks";
import { appAlert } from "@/src/components/ui/AppAlert";
import { Button, buttonTextColor, Chip, ChipGroup, colors, FormRow, HintBanner, PageHeader, Screen, SegmentedControl, spacing } from "@/src/components/ui/kit";
import { newConveyor } from "@/src/models/conveyors";
import type { Conveyor, ConveyorSensorKind, ConveyorSourceKind } from "@/src/models/robotModels";
import { useConveyors, useConveyorsSupported, useIoDevices } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { router, useLocalSearchParams } from "expo-router";
import { Crosshair } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, View } from "react-native";

const SOURCE_OPTIONS: { label: string; value: ConveyorSourceKind }[] = [
  { label: "Aux axis", value: "aux" },
  { label: "Timed", value: "timed" },
  { label: "Manual", value: "manual" },
];
const SENSOR_OPTIONS: { label: string; value: ConveyorSensorKind }[] = [
  { label: "None", value: "none" },
  { label: "Aux latch", value: "auxPin" },
  { label: "IO input", value: "io" },
  { label: "STB input", value: "stb" },
];
const OUTPUT_CARDS = [
  { label: "STB", value: "stb" },
  { label: "Relay", value: "relay" },
  { label: "IO device", value: "io" },
] as const;

function nextName(list: Conveyor[]) {
  let n = list.length + 1;
  while (list.some(c => c.name === `Conveyor ${n}`)) n++;
  return `Conveyor ${n}`;
}

/**
 * Conveyor editor — where the belt's travel comes from, its frame, sensor and pick window, plus
 * (once saved) its live state and the calibration wizard. Route param `id` edits that conveyor
 * (by its stable id); none creates one. `calibrate=<step>` opens the wizard on that step.
 */
export default function ConveyorEditPage() {
  const { id, calibrate } = useLocalSearchParams<{ id?: string; calibrate?: string }>();
  const conveyors = useConveyors();
  const supported = useConveyorsSupported();
  const auxDevices = useAuxDevices();
  const ioDevices = useIoDevices();

  const isNew = !id || id === "new";
  const existing = isNew ? null : (conveyors.find(c => c.id === id) ?? null);

  const [draft, setDraft] = useState<Conveyor>(() => existing ?? newConveyor(nextName(conveyors)));
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(!!calibrate);

  // Re-seed when the conveyor loads after navigation or changes on the controller.
  const existingKey = existing ? JSON.stringify(existing) : "";
  const [seedKey, setSeedKey] = useState(existingKey);
  if (existingKey !== seedKey) {
    setSeedKey(existingKey);
    if (existing) setDraft(existing);
  }

  const set = (patch: Partial<Conveyor>) => setDraft(d => ({ ...d, ...patch }));
  const setSource = (patch: Partial<Conveyor["source"]>) => setDraft(d => ({ ...d, source: { ...d.source, ...patch } }));
  const setSensor = (patch: Partial<Conveyor["sensor"]>) => setDraft(d => ({ ...d, sensor: { ...d.sensor, ...patch } }));
  const setFrame = (patch: Partial<Conveyor["frame"]>) => setDraft(d => ({ ...d, frame: { ...d.frame, ...patch } }));
  const setWindow = (patch: Partial<Conveyor["window"]>) => setDraft(d => ({ ...d, window: { ...d.window, ...patch } }));

  const name = draft.name.trim();
  const nameClash = !!name && conveyors.some(c => c.name === name && c.id !== draft.id);
  const windowBad = !(draft.window.endMm > draft.window.startMm);
  const sourceBad = (draft.source.kind === "aux" && (!draft.source.deviceId || draft.source.axis == null))
    || (draft.source.kind === "timed" && (!draft.source.runOutput || !(draft.source.speedMmS > 0)));
  const canSave = !!name && !nameClash && !windowBad && !sourceBad && (isNew || !!existing) && supported !== false;

  async function save(c: Conveyor, leave: boolean): Promise<boolean> {
    setSaving(true);
    try {
      const saved = await robotClient.saveConveyor(c);
      setDraft(saved);
      if (leave) {
        if (router.canGoBack()) router.back(); else router.replace("/space/conveyors");
      } else if (isNew && saved.id) {
        router.setParams({ id: saved.id });
      }
      return true;
    } catch (e) {
      appAlert("Couldn't save the conveyor", conveyorErrorText(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const applyCalibration = (r: ConveyorCalibrationResult) =>
    save({ ...draft, frame: r.frame, scale: r.scale, window: r.window, sensor: { ...draft.sensor, offsetMm: r.sensorOffsetMm } }, false);

  const title = isNew ? "New Conveyor" : "Edit Conveyor";

  // ── Aux axis options: every axis on every aux card, conveyor-role axes first ──
  const axisOptions: PickOption[] = auxDevices
    .flatMap(d => d.axes.map(a => ({ d, a })))
    .sort((x, y) => Number(y.a.role === "Conveyor") - Number(x.a.role === "Conveyor"))
    .map(({ d, a }) => ({
      key: `${d.deviceId}|${a.axisIndex}`,
      title: `${a.name || `Axis ${a.axisIndex}`} · ${d.deviceName || d.deviceId}`,
      subtitle: a.axisType === "Linear" && a.mmPerRev > 0
        ? `Linear · ${a.mmPerRev} mm/rev${d.connected ? "" : " · offline"}`
        : `${a.axisType || "Untyped"} axis${d.connected ? "" : " · offline"}`,
      tag: a.role === "Conveyor" ? "Conveyor" : undefined,
    }));
  const axisKey = draft.source.deviceId != null && draft.source.axis != null ? `${draft.source.deviceId}|${draft.source.axis}` : null;
  if (axisKey && !axisOptions.some(o => o.key === axisKey)) {
    axisOptions.push({ key: axisKey, title: `Axis ${draft.source.axis} · ${draft.source.deviceId}`, subtitle: "Not connected" });
  }

  const auxDeviceOptions: PickOption[] = auxDevices.map(d => ({ key: d.deviceId, title: d.deviceName || d.deviceId, subtitle: d.connected ? undefined : "offline" }));
  // Sensor pins: the aux card's latch inputs (its spare-pin IO shows up as an IO device of the
  // same id), or an IO device's inputs.
  const sensorDevicePins = ioDevices.find(d => d.id === draft.sensor.deviceId)?.pins ?? [];
  const latchPins = sensorDevicePins.filter(p => p.latch || p.type === "Latch");
  const ioInputPins = sensorDevicePins.filter(p => p.type === "Input" || p.type === "Latch");

  const ioDeviceOptions: PickOption[] = ioDevices.map(d => ({ key: d.id, title: d.name || d.id, subtitle: d.connected ? undefined : "offline" }));

  // ── Sections ────────────────────────────────────────────────────────────────
  const identity = (
    <FieldGroup>
      <View>
        <FieldLabel text="Name" />
        <LocalInput value={draft.name} onChange={v => set({ name: v })} placeholder="e.g. Infeed belt" autoCapitalize="words" returnKeyType="next" />
        {nameClash && <Text style={s.error}>Another conveyor already has this name.</Text>}
      </View>
      <View>
        <FieldLabel text="Max queue" tip="Most parts held in the queue at once; the oldest is dropped when it is full." />
        <NumField value={draft.maxQueue} onChange={v => v != null && set({ maxQueue: Math.max(1, Math.round(v)) })} label="Max queue" />
      </View>
    </FieldGroup>
  );

  const runOutput = draft.source.runOutput ?? { outputCard: "stb", outputDeviceId: null, outputNumber: 1 };
  const source = (
    <FieldGroup>
      <SectionHeading title="Travel source" tip="Where the controller learns how far the belt has moved." />
      <SegmentedControl options={SOURCE_OPTIONS} value={draft.source.kind} onChange={kind => setSource({ kind })} />
      {draft.source.kind === "aux" && (
        <>
          <PickList
            options={axisOptions}
            selected={axisKey}
            onSelect={k => { const [deviceId, axis] = k.split("|"); setSource({ deviceId, axis: Number(axis) }); }}
            empty="No aux devices found. Connect an aux card under I/O."
          />
          <View>
            <FieldLabel text="mm per step override" tip="Leave blank to use the axis's Linear settings (steps/rev × gear ÷ mm/rev)." />
            <NumField value={draft.source.mmPerStep} nullable onChange={v => setSource({ mmPerStep: v })} placeholder="From the axis settings" label="mm per step override" />
          </View>
          <FieldHint>Travel is counted from the axis&apos;s steps; give the axis the Conveyor role under I/O to list it first.</FieldHint>
        </>
      )}
      {draft.source.kind === "timed" && (
        <>
          <FormRow label="Run output">
            <SegmentedControl
              size="sm"
              options={OUTPUT_CARDS}
              value={runOutput.outputCard as "stb" | "relay" | "io"}
              onChange={outputCard => setSource({ runOutput: { ...runOutput, outputCard, outputDeviceId: outputCard === "io" ? runOutput.outputDeviceId ?? ioDevices[0]?.id ?? null : null } })}
            />
          </FormRow>
          {runOutput.outputCard === "io" && (
            <PickList options={ioDeviceOptions} selected={runOutput.outputDeviceId ?? null}
              onSelect={k => setSource({ runOutput: { ...runOutput, outputDeviceId: k } })} empty="No IO devices found." />
          )}
          <View style={s.pair}>
            <View style={s.grow}>
              <FieldLabel text={runOutput.outputCard === "relay" ? "Relay" : runOutput.outputCard === "io" ? "Pin" : "Output"} />
              <NumField value={runOutput.outputNumber} onChange={v => v != null && setSource({ runOutput: { ...runOutput, outputNumber: Math.round(v) } })} label="Run output number" />
            </View>
            <View style={s.grow}>
              <FieldLabel text="Speed (mm/s)" tip="Belt speed while the output is on — measure it, or let calibration correct it through the scale." />
              <NumField value={draft.source.speedMmS} onChange={v => v != null && setSource({ speedMmS: v })} label="Belt speed (mm/s)" />
            </View>
          </View>
          <FieldHint>The belt counts as running while this output is on. Less exact than an aux axis — fine for slow belts with wide windows.</FieldHint>
        </>
      )}
      {draft.source.kind === "manual" && (
        <FieldHint>No motion source: travel only changes when it is set (from the live card or a test). Useful for trying programs without a belt.</FieldHint>
      )}
      <View>
        <FieldLabel text="Scale" tip="Multiplies the counted travel to correct belt slip or pulley error. Calibration sets it." />
        <NumField value={draft.scale} onChange={v => v != null && v > 0 && set({ scale: v })} label="Scale" />
      </View>
    </FieldGroup>
  );

  const frame = (
    <FieldGroup>
      <SectionHeading
        title="Frame"
        unit="mm / °"
        tip="Where the belt sits in robot base coordinates. +X is the direction of belt travel, Y across the belt, Z up from its surface."
        action={
          <Button
            label="Calibrate" size="sm" variant="secondary"
            icon={<Crosshair size={14} color={buttonTextColor("secondary")} />}
            disabled={!draft.id}
            onPress={() => setWizardOpen(true)}
          />
        }
      />
      <NumGrid fields={[
        { key: "x", label: "X", value: draft.frame.x, onChange: v => setFrame({ x: v }) },
        { key: "y", label: "Y", value: draft.frame.y, onChange: v => setFrame({ y: v }) },
        { key: "z", label: "Z", value: draft.frame.z, onChange: v => setFrame({ z: v }) },
        { key: "rz", label: "RZ", value: draft.frame.rz, onChange: v => setFrame({ rz: v }) },
      ]} />
      <FieldHint>{draft.id ? "Calibrate measures the frame and scale from a mark on the belt." : "Save the conveyor first, then Calibrate measures the frame from a mark on the belt."}</FieldHint>
    </FieldGroup>
  );

  const sensor = (
    <FieldGroup>
      <SectionHeading title="Part sensor" tip="Latches each part's belt position as it passes. A sensor wired to the aux card latches exactly; IO and STB inputs are polled (slow belts only for STB)." />
      <SegmentedControl size="sm" options={SENSOR_OPTIONS} value={draft.sensor.kind} onChange={kind => setSensor({ kind })} />
      {draft.sensor.kind === "auxPin" && (
        <PickList options={auxDeviceOptions} selected={draft.sensor.deviceId} onSelect={k => setSensor({ deviceId: k })} empty="No aux devices found." />
      )}
      {draft.sensor.kind === "io" && (
        <PickList options={ioDeviceOptions} selected={draft.sensor.deviceId} onSelect={k => setSensor({ deviceId: k })} empty="No IO devices found." />
      )}
      {draft.sensor.kind === "auxPin" && (
        <View>
          <FieldLabel text="Latch pin" tip="A pin configured as a Latch input on the aux card (I/O › the aux card › Configure IO). Its edges capture the belt position exactly." />
          {latchPins.length > 0 ? (
            <ChipGroup>
              {latchPins.map(p => (
                <Chip key={p.pin} label={p.name ? `${p.name} · D${p.pin}` : `D${p.pin}`} selected={draft.sensor.pin === p.pin} onPress={() => setSensor({ pin: p.pin })} />
              ))}
            </ChipGroup>
          ) : (
            <>
              <NumField value={draft.sensor.pin} nullable onChange={v => setSensor({ pin: v == null ? null : Math.round(v) })} placeholder="e.g. 2" label="Sensor pin" />
              <FieldHint>No latch pins on this card yet — configure one as a Latch input under I/O, or type its pin number.</FieldHint>
            </>
          )}
        </View>
      )}
      {draft.sensor.kind === "io" && (
        <View>
          <FieldLabel text="Pin" />
          {ioInputPins.length > 0 ? (
            <ChipGroup>
              {ioInputPins.map(p => (
                <Chip key={p.pin} label={p.name ? `${p.name} · D${p.pin}` : `D${p.pin}`} selected={draft.sensor.pin === p.pin} onPress={() => setSensor({ pin: p.pin })} />
              ))}
            </ChipGroup>
          ) : (
            <NumField value={draft.sensor.pin} nullable onChange={v => setSensor({ pin: v == null ? null : Math.round(v) })} placeholder="e.g. 2" label="Sensor pin" />
          )}
        </View>
      )}
      {draft.sensor.kind === "stb" && (
        <FormRow label="Input">
          <ChipGroup>
            {[1, 2, 3, 4].map(n => (
              <Chip key={n} label={`In ${n}`} selected={draft.sensor.input === n} onPress={() => setSensor({ input: n })} />
            ))}
          </ChipGroup>
        </FormRow>
      )}
      {draft.sensor.kind !== "none" && (
        <>
          <FormRow label="Active high" hint="On: a part reads as the input going high. Off: going low (e.g. a pulled-up switch)." inline>
            <Switch value={draft.sensor.activeHigh} onValueChange={v => setSensor({ activeHigh: v })} trackColor={{ false: colors.border, true: colors.accent }} />
          </FormRow>
          <View style={s.pair}>
            <View style={s.grow}>
              <FieldLabel text="Offset (mm)" tip="A part's X in the conveyor frame at the moment it latches. Calibration measures it." />
              <NumField value={draft.sensor.offsetMm} onChange={v => v != null && setSensor({ offsetMm: v })} label="Sensor offset (mm)" />
            </View>
            <View style={s.grow}>
              <FieldLabel text="Min spacing (mm)" tip="Re-triggers closer than this along the belt are ignored." />
              <NumField value={draft.sensor.minSpacingMm} onChange={v => v != null && setSensor({ minSpacingMm: Math.max(0, v) })} label="Minimum spacing (mm)" />
            </View>
          </View>
        </>
      )}
      {draft.sensor.kind === "none" && <FieldHint>Without a sensor, parts are added by a program (Conveyor Add Part, e.g. from a vision result) or from the live card.</FieldHint>}
    </FieldGroup>
  );

  const windowSection = (
    <FieldGroup>
      <SectionHeading title="Pick window" unit="mm along the belt" tip="Where along conveyor X the robot may track a part. A part past the end is dropped as missed." />
      <NumGrid fields={[
        { key: "start", label: "Start", value: draft.window.startMm, onChange: v => setWindow({ startMm: v }) },
        { key: "end", label: "End", value: draft.window.endMm, onChange: v => setWindow({ endMm: v }) },
      ]} />
      {windowBad && <Text style={s.error}>The end must be past the start.</Text>}
    </FieldGroup>
  );

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageHeader
        title={title}
        subtitle="A belt the robot can track moving parts on"
        crumbs={[
          { label: "Space", href: "/space" },
          { label: "Conveyors", href: "/space/conveyors" },
          { label: title },
        ]}
        backTo="/space/conveyors"
        right={<Button label="Save" size="sm" onPress={() => save(draft, true)} loading={saving} disabled={!canSave} />}
      />

      <Screen>
        {supported === false && (
          <HintBanner id="conveyors-unsupported" dismissible={false}>
            This controller doesn&apos;t have conveyor tracking yet. Update the controller to save conveyors.
          </HintBanner>
        )}
        <EditorCard
          left={[identity, source]}
          right={[frame, sensor, windowSection]}
        />
        {!!draft.id && <ConveyorLiveCard conveyor={draft} auxDevices={auxDevices} />}
      </Screen>

      <ConveyorCalibrateWizard
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
        conveyor={draft}
        auxDevices={auxDevices}
        onSave={applyCalibration}
        initialStep={calibrate === "window" || calibrate === "review" || calibrate === "b" || calibrate === "sensor" ? calibrate : undefined}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  error: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  pair: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  grow: { flexGrow: 1, flexBasis: 140 },
});
