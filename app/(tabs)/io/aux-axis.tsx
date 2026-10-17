import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import {
  accents,
  Button,
  Card,
  Chip,
  ChipGroup,
  colors,
  FormRow,
  Input,
  InfoTip,
  PageHeader,
  radii,
  Screen,
  SectionHeader,
  SegmentedControl,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { AuxAxisChannelState, AuxDeviceState } from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { AUX_ROLES, auxRoleMeta } from "@/src/components/ui/io/auxRoles";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Cog, Sparkles } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

const AUX_TINT      = accents.purple;
const AUX_TINT_SOFT = accents.purpleSoft;

// ── Role presets ────────────────────────────────────────────────────────────
// Characteristics seeded from CAD (see cad-monkey). A preset fills the motion +
// role fields so a known tool "just works"; everything stays editable afterwards.
// Flagged values the CAD couldn't confirm are called out in `note`.

type GripperPreset = {
  label: string;
  axisType: "Linear";
  mmPerRev: number;      // jaw-GAP mm per motor rev
  gearRatio: number;
  stepsPerRev: number;
  gripperOpenMm: number;
  gripperClosedMm: number;
  openTimeSec: number;   // time for a full open stroke
  closeTimeSec: number;  // time for a full close stroke
  accel: number;         // gap mm/s²
  overTravelMm: number;  // re-seat travel past each hard stop on a full Open/Close
  note: string;
};

const GRIPPER_PRESETS: GripperPreset[] = [
  {
    label: "Servo Gripper",
    axisType: "Linear",
    mmPerRev: 80,        // GT2 20T direct on shaft: 40 mm/rev per finger -> 80 mm/rev of gap
    gearRatio: 1,
    stepsPerRev: 3200,   // 1/16 microstepping -> 40 steps per mm of gap
    gripperOpenMm: 62.64,
    gripperClosedMm: 22.36,
    openTimeSec: 0.7,    // ~40 mm stroke -> ~58 mm/s
    closeTimeSec: 0.9,   // a touch gentler closing onto a part
    accel: 400,
    overTravelMm: 2,     // seat firmly against each stop so the gap stays referenced
    note: "Rack-and-pinion gripper (GT2 20T direct on a NEMA 17). Gap and travel are from CAD; the open/close times and accel are starting points — tune to taste. Jog direction depends on motor wiring: flip 'Invert direction' if Open/Close are reversed.",
  },
];

type ConveyorPreset = {
  label: string;
  axisType: "Linear";
  mmPerRev: number;      // belt travel mm per motor rev
  gearRatio: number;
  stepsPerRev: number;
  actionVelocity: number; // belt mm/s
  note: string;
};

const CONVEYOR_PRESETS: ConveyorPreset[] = [
  {
    label: "Simple Conveyor",
    axisType: "Linear",
    mmPerRev: 113,       // ~pi x 36mm roller OD (bare roller)
    gearRatio: 1,
    stepsPerRev: 3200,
    actionVelocity: 50,
    note: "Ø36 mm drive roller. Drive ratio (assumed 1:1 direct) and motor size are estimates from the print files — verify against your build and adjust mm/rev if the belt speed is off.",
  },
];

// ── Preset wizard ─────────────────────────────────────────────────────────────
// Sparkle trigger on each role card opens this chooser; picking a preset fills the
// motion + role fields. Everything stays editable afterwards.
function PresetSheet({ visible, onClose, title, presets, onPick }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  presets: { label: string; note?: string }[];
  onPick: (index: number) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {presets.map((p, i) => (
        <AnimatedPressable
          key={p.label}
          style={styles.presetOption}
          onPress={() => { onPick(i); onClose(); }}
        >
          <Sparkles size={18} color={AUX_TINT} />
          <View style={{ flex: 1 }}>
            <Text style={styles.presetOptLabel}>{p.label}</Text>
            {p.note ? <Text style={styles.presetOptNote}>{p.note}</Text> : null}
          </View>
        </AnimatedPressable>
      ))}
    </BottomSheet>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuxAxisConfigPage() {
  const router = useRouter();
  const { deviceId, axis } = useLocalSearchParams<{ deviceId?: string; axis?: string }>();
  const axisIndex = axis != null ? parseInt(axis, 10) : 0;

  const [device, setDevice] = useState<AuxDeviceState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);

  // Form state (initialised once from the loaded axis).
  const [name,        setName]        = useState("");
  const [axisType,    setAxisType]    = useState("");
  const [stepsPerRev, setStepsPerRev] = useState("1600");
  const [gearRatio,   setGearRatio]   = useState("1");
  const [mmPerRev,    setMmPerRev]    = useState("0");
  const [invertDir,   setInvertDir]   = useState(false);
  const [role,        setRole]        = useState("Generic");
  const [actionDist,  setActionDist]  = useState("0");
  const [actionVel,   setActionVel]   = useState("0");
  const [openMm,      setOpenMm]      = useState("0");
  const [closedMm,    setClosedMm]    = useState("0");
  const [openTime,    setOpenTime]    = useState("0");
  const [closeTime,   setCloseTime]   = useState("0");
  const [gripAccel,   setGripAccel]   = useState("0");
  const [overTravel,  setOverTravel]  = useState("0");

  useEffect(() => {
    robotClient.getAuxState().catch(() => {});
    const unsub = robotClient.onAuxAxis(devices => {
      const d = deviceId ? devices.find(x => x.deviceId === deviceId) ?? null : null;
      setDevice(d);
    });
    return () => { unsub(); };
  }, [deviceId]);

  const axisState: AuxAxisChannelState | undefined = device?.axes.find(a => a.axisIndex === axisIndex);

  // Initialise the form once, when the axis first arrives.
  useEffect(() => {
    if (loaded || !axisState) return;
    setName(axisState.name);
    setAxisType(axisState.axisType || "");
    setStepsPerRev(String(axisState.stepsPerRev || 1600));
    setGearRatio(String(axisState.gearRatio ?? 1));
    setMmPerRev(String(axisState.mmPerRev ?? 0));
    setInvertDir(axisState.invertDirection ?? false);
    setRole(axisState.role || "Generic");
    setActionDist(String(axisState.actionDistance ?? 0));
    setActionVel(String(axisState.actionVelocity ?? 0));
    setOpenMm(String(axisState.gripperOpenMm ?? 0));
    setClosedMm(String(axisState.gripperClosedMm ?? 0));
    setOpenTime(String(axisState.gripperOpenTimeSec ?? 0));
    setCloseTime(String(axisState.gripperCloseTimeSec ?? 0));
    setGripAccel(String(axisState.gripperAccel ?? 0));
    setOverTravel(String(axisState.gripperOverTravelMm ?? 0));
    setLoaded(true);
  }, [axisState, loaded]);

  const applyGripperPreset = (p: GripperPreset) => {
    setAxisType(p.axisType);
    setMmPerRev(String(p.mmPerRev));
    setGearRatio(String(p.gearRatio));
    setStepsPerRev(String(p.stepsPerRev));
    setOpenMm(String(p.gripperOpenMm));
    setClosedMm(String(p.gripperClosedMm));
    setOpenTime(String(p.openTimeSec));
    setCloseTime(String(p.closeTimeSec));
    setGripAccel(String(p.accel));
    setOverTravel(String(p.overTravelMm));
  };

  const applyConveyorPreset = (p: ConveyorPreset) => {
    setAxisType(p.axisType);
    setMmPerRev(String(p.mmPerRev));
    setGearRatio(String(p.gearRatio));
    setStepsPerRev(String(p.stepsPerRev));
    setActionVel(String(p.actionVelocity));
  };

  const save = async () => {
    if (!deviceId) return;
    setSaving(true);
    await robotClient.setAuxAxisConfig({
      deviceId,
      axisIndex,
      name:            name.trim(),
      stepsPerRev:     parseInt(stepsPerRev) || 1600,
      invertDirection: invertDir,
      axisType,
      gearRatio:       parseFloat(gearRatio) || 1,
      mmPerRev:        parseFloat(mmPerRev)  || 0,
      role,
      actionDistance:  parseFloat(actionDist) || 0,
      actionVelocity:  parseFloat(actionVel)  || 0,
      gripperOpenMm:   parseFloat(openMm)   || 0,
      gripperClosedMm: parseFloat(closedMm) || 0,
      gripperOpenTimeSec:  parseFloat(openTime)  || 0,
      gripperCloseTimeSec: parseFloat(closeTime) || 0,
      gripperAccel:        parseFloat(gripAccel) || 0,
      gripperOverTravelMm: parseFloat(overTravel) || 0,
    });
    await robotClient.getAuxState().catch(() => {});
    setSaving(false);
    router.back();
  };

  const typeOptions = [
    { label: "Unconfigured", value: "" },
    { label: "Rotary (°)",   value: "Rotary" },
    { label: "Linear (mm)",  value: "Linear" },
  ];

  const unit = axisType === "Linear" ? "mm" : axisType === "Rotary" ? "°" : "steps";

  // Gripper derived speeds (stroke / time) — shown so the typed times read as a real mm/s.
  const gStroke   = Math.abs((parseFloat(openMm) || 0) - (parseFloat(closedMm) || 0));
  const gOpenVel  = parseFloat(openTime)  > 0 ? gStroke / parseFloat(openTime)  : null;
  const gCloseVel = parseFloat(closeTime) > 0 ? gStroke / parseFloat(closeTime) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader
        title={axisState ? (axisState.name || `Axis ${axisIndex}`) : `Axis ${axisIndex}`}
        subtitle={device ? `${device.deviceName} · configuration` : "Aux axis configuration"}
        crumbs={[
          { label: "IO", href: "/io" },
          { label: device?.deviceName ?? "Aux", href: deviceId ? `/io/auxiliary?deviceId=${deviceId}` : "/io/auxiliary" },
          { label: `Axis ${axisIndex}` },
        ]}
        onBack={() => router.back()}
      />
      <Screen>
        {/* ── Identity ───────────────────────────────────────────────────── */}
        <SectionHeader title="Axis" />
        <Card>
          <FormRow label="Name">
            <Input
              value={name}
              onChangeText={setName}
              placeholder={`Axis ${axisIndex}`}
              returnKeyType="done"
            />
          </FormRow>
        </Card>

        {/* ── Role (icon tiles) ──────────────────────────────────────────── */}
        <SectionHeader
          title="Role"
          style={styles.sectionGap}
          right={<InfoTip text="What this axis drives. The role picks its manual controls, its program blocks, and the settings shown below. Generic is a plain stepper with hold-to-jog." />}
        />
        <View style={styles.roleGrid}>
          {AUX_ROLES.map(r => {
            const meta     = auxRoleMeta(r);
            const Icon     = meta.icon;
            const selected = role === r;
            return (
              <AnimatedPressable
                key={r}
                style={[styles.roleTile, selected && styles.roleTileOn]}
                onPress={() => setRole(r)}
              >
                <Icon size={22} color={selected ? AUX_TINT : colors.textMuted} />
                <Text style={[styles.roleTileText, selected && { color: AUX_TINT }]}>{meta.label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {/* ── Gripper characteristics ────────────────────────────────────── */}
        {role === "Gripper" && (
          <>
            <SectionHeader
              title="Gripper"
              style={styles.sectionGap}
              right={<InfoTip text="Open and Close drive the jaws to these gap widths; a program (or the Grip control) can drive to any gap in between. If the gripper loses steps, re-reference it from the Auxiliary screen's Set-Open / Set-Closed buttons." />}
            />
            <Card>
              {GRIPPER_PRESETS.length > 0 && (
                <AnimatedPressable style={styles.presetTrigger} onPress={() => setPresetOpen(true)}>
                  <Sparkles size={16} color={AUX_TINT} />
                  <Text style={styles.presetTriggerText}>Presets</Text>
                </AnimatedPressable>
              )}
              <FormRow label="Jaw gap — fully open (mm)">
                <Input value={openMm} onChangeText={setOpenMm} placeholder="62.6" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow label="Jaw gap — fully closed (mm)" style={styles.fieldGap}>
                <Input value={closedMm} onChangeText={setClosedMm} placeholder="22.4" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow label="Opening time (s)" style={styles.fieldGap}>
                <Input value={openTime} onChangeText={setOpenTime} placeholder="0.7" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow label="Closing time (s)" style={styles.fieldGap}>
                <Input value={closeTime} onChangeText={setCloseTime} placeholder="0.9" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow label="Acceleration (mm/s²)" style={styles.fieldGap}>
                <Input value={gripAccel} onChangeText={setGripAccel} placeholder="400" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow
                label="Re-seat over-travel (mm)"
                hint="Extra travel past each hard stop on a full Open/Close so the jaws seat firmly and re-reference there. The position never reads past the gap limits, so over-driving the stop is harmless. 0 = off."
                style={styles.fieldGap}
              >
                <Input value={overTravel} onChangeText={setOverTravel} placeholder="2" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              {(gOpenVel != null || gCloseVel != null) && (
                <Text style={styles.presetNote}>
                  {`Full ${gStroke.toFixed(0)} mm stroke → `}
                  {gOpenVel  != null ? `open ${gOpenVel.toFixed(0)} mm/s` : "open —"}
                  {", "}
                  {gCloseVel != null ? `close ${gCloseVel.toFixed(0)} mm/s` : "close —"}
                  {". A program's gripper block can override the speed and accel per step."}
                </Text>
              )}
            </Card>
          </>
        )}

        {/* ── Conveyor characteristics ───────────────────────────────────── */}
        {role === "Conveyor" && (
          <>
            <SectionHeader
              title="Conveyor"
              style={styles.sectionGap}
              right={<InfoTip text="Belt travel per motor revolution converts motor speed into real belt speed. Run speed is how fast the belt moves when you tap Run." />}
            />
            <Card>
              {CONVEYOR_PRESETS.length > 0 && (
                <AnimatedPressable style={styles.presetTrigger} onPress={() => setPresetOpen(true)}>
                  <Sparkles size={16} color={AUX_TINT} />
                  <Text style={styles.presetTriggerText}>Presets</Text>
                </AnimatedPressable>
              )}
              <FormRow label="Belt travel per motor rev (mm)">
                <Input value={mmPerRev} onChangeText={setMmPerRev} placeholder="113" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow label="Run speed (mm/s)" style={styles.fieldGap}>
                <Input value={actionVel} onChangeText={setActionVel} placeholder="50" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
            </Card>
          </>
        )}

        {/* ── Rotary table characteristics ───────────────────────────────── */}
        {role === "RotaryTable" && (
          <>
            <SectionHeader title="Rotary Table" style={styles.sectionGap} />
            <Card>
              <FormRow label={`Index increment (${unit})`}>
                <Input value={actionDist} onChangeText={setActionDist} placeholder="90" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
              <FormRow label={`Index speed (${unit}/s)`} style={styles.fieldGap}>
                <Input value={actionVel} onChangeText={setActionVel} placeholder="90" keyboardType="decimal-pad" returnKeyType="done" />
              </FormRow>
            </Card>
          </>
        )}

        {/* ── Motion / mechanics ─────────────────────────────────────────── */}
        <SectionHeader
          title="Motion"
          icon={Cog}
          style={styles.sectionGap}
          right={<InfoTip text="Steps per revolution must match your stepper driver's microstepping. Gear ratio and mm/rev convert motor turns into real degrees or millimetres. A preset fills these for you." />}
        />
        <Card>
          <FormRow label="Type">
            <SegmentedControl options={typeOptions} value={axisType} onChange={setAxisType} />
          </FormRow>

          <FormRow label="Steps per revolution" style={styles.fieldGap}>
            <ChipGroup style={styles.stepChipsRow}>
              {([
                { label: "Full", steps: 200  },
                { label: "1/2",  steps: 400  },
                { label: "1/4",  steps: 800  },
                { label: "1/8",  steps: 1600 },
                { label: "1/16", steps: 3200 },
              ] as const).map(({ label, steps }) => (
                <Chip
                  key={steps}
                  label={`${label} · ${steps}`}
                  selected={stepsPerRev === String(steps)}
                  onPress={() => setStepsPerRev(String(steps))}
                  tint={[AUX_TINT, AUX_TINT_SOFT]}
                />
              ))}
            </ChipGroup>
            <Input value={stepsPerRev} onChangeText={setStepsPerRev} placeholder="Custom" keyboardType="numeric" returnKeyType="done" style={styles.customStepsInput} />
          </FormRow>

          <FormRow label="Gear ratio" style={styles.fieldGap}>
            <Input value={gearRatio} onChangeText={setGearRatio} placeholder="1" keyboardType="decimal-pad" returnKeyType="done" />
          </FormRow>

          {axisType === "Linear" && role !== "Conveyor" && (
            <FormRow label="mm per output revolution" style={styles.fieldGap}>
              <Input value={mmPerRev} onChangeText={setMmPerRev} placeholder="0" keyboardType="decimal-pad" returnKeyType="done" />
            </FormRow>
          )}

          <FormRow label="Invert direction" inline style={styles.fieldGap}>
            <Switch value={invertDir} onValueChange={setInvertDir} trackColor={{ false: colors.border, true: AUX_TINT }} />
          </FormRow>
        </Card>

        {!loaded && (
          <Text style={styles.waitingNote}>Waiting for the device… connect the controller to edit this axis.</Text>
        )}

        <Button
          label={saving ? "Saving…" : "Save"}
          loading={saving}
          onPress={save}
          disabled={!deviceId}
          style={[styles.saveBtn, { backgroundColor: AUX_TINT }]}
        />

        <PresetSheet
          visible={presetOpen}
          onClose={() => setPresetOpen(false)}
          title={role === "Conveyor" ? "Conveyor presets" : "Gripper presets"}
          presets={role === "Conveyor" ? CONVEYOR_PRESETS : GRIPPER_PRESETS}
          onPick={(i) => {
            if (role === "Conveyor") applyConveyorPreset(CONVEYOR_PRESETS[i]);
            else applyGripperPreset(GRIPPER_PRESETS[i]);
          }}
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGap: { marginTop: spacing.xl },
  fieldGap:   { marginTop: spacing.md + 2 },

  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  roleTile: {
    flexGrow: 1, flexBasis: "22%", minWidth: 80,
    alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roleTileOn: { borderColor: AUX_TINT, backgroundColor: AUX_TINT_SOFT },
  roleTileText: { ...type.caption, fontWeight: "700", color: colors.textMuted },

  presetTrigger: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start",
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radii.pill, backgroundColor: AUX_TINT_SOFT, marginBottom: spacing.md,
  },
  presetTriggerText: { ...type.caption, fontWeight: "700", color: AUX_TINT },
  presetOption: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  presetOptLabel: { ...type.body, fontWeight: "600", color: colors.text },
  presetOptNote:  { ...type.caption, color: colors.textFaint, marginTop: 2, lineHeight: 16 },
  presetNote:  { ...type.caption, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 16 },

  stepChipsRow:     { marginBottom: spacing.sm },
  customStepsInput: { marginTop: spacing.xs },

  saveBtn: { marginTop: spacing.xl },

  waitingNote: { ...type.caption, color: colors.textFaint, marginTop: spacing.lg, textAlign: "center" },
});
