import {
  accents,
  Button,
  buttonTextColor,
  Card,
  Chip,
  ChipGroup,
  colors,
  Divider,
  Input,
  InfoTip,
  ListRow,
  PageHeader,
  radii,
  Screen,
  SectionHeader,
  SegmentedControl,
  shadows,
  spacing,
  type,
} from "@/src/components/ui/kit";
import { useIsWide } from "@/src/components/ui/responsive";
import { appAlert } from "@/src/components/ui/AppAlert";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  Gauge,
  Home,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  Ruler,
  ShieldAlert,
  Zap,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

type RobotConfig = {
  robotType: string;
  // ASTRO homing
  homingSpeed: number;
  j1HomeOffsetDeg: number;
  verticalHomePosition: number;
  horizontalHomePosition: number;
  verticalHomingDirection: number;
  horizontalHomingDirection: number;
  j1HomingDirection: number;
  j4HomeOffsetDeg: number;
  // Motor directions (shared)
  m1Direction: number;
  m2Direction: number;
  m3Direction: number;
  m4Direction: number;
  // Jog speeds
  jogSlowSpeed:   number;
  jogNormalSpeed: number;
  jogFastSpeed:   number;
  // ASTRO motor config (steps/rev + gear ratio per motor)
  astroStepsPerRevM1: number;
  astroStepsPerRevM2: number;
  astroStepsPerRevM3: number;
  astroStepsPerRevM4: number;
  astroGearRatioM1: number;
  astroGearRatioM2: number;
  astroGearRatioM3: number;
  astroGearRatioM4: number;
  // ASTRO joint gearing (drivetrain reduction used by the kinematics)
  astroJoint1GearRatio: number;
  astroJoint4GearRatio: number;
  astroCoreXyPulleyPcdMm: number;
  // CNC4Axis motor config
  cncStepsPerRevX:  number;
  cncStepsPerRevY:  number;
  cncStepsPerRevZ:  number;
  cncStepsPerRevRZ: number;
  cncMmPerRevX:     number;
  cncMmPerRevY:     number;
  cncMmPerRevZ:     number;
  cncDegPerRevRZ:   number;
  // CNC4Axis homing
  cncXHomePosition:   number;
  cncYHomePosition:   number;
  cncZHomePosition:   number;
  cncRzHomePosition:  number;
  cncXHomingDirection: number;
  cncYHomingDirection: number;
  cncZHomingDirection: number;
  // Joint soft limits — null means the bound is unset (not enforced)
  jointLimitsEnabled: boolean;
  joint1Min: number | null;
  joint1Max: number | null;
  joint2Min: number | null;
  joint2Max: number | null;
  joint3Min: number | null;
  joint3Max: number | null;
  joint4Min: number | null;
  joint4Max: number | null;
};

type EditingField = {
  label: string;
  type: "number" | "direction" | "homing" | "cncAxis" | "astroMotor" | "jointLimit";
  numKey?: keyof RobotConfig;
  numText: string;
  unit?: string;
  placeholder?: string;
  /** Overrides the default "OFFSET (unit)/VALUE" caption in the number editor. */
  editLabel?: string;
  dirKey?: keyof RobotConfig;
  dirValue: number;
  // cncAxis only
  cncStepsKey?: keyof RobotConfig;
  cncStepsText?: string;
  cncMeasureKey?: keyof RobotConfig;
  cncMeasureText?: string;
  cncIsRotary?: boolean;
  // astroMotor only (steps/rev + gear ratio)
  astroStepsKey?: keyof RobotConfig;
  astroStepsText?: string;
  astroGearKey?: keyof RobotConfig;
  astroGearText?: string;
  defaultSteps?: number;
  defaultGear?: number;
  // jointLimit only
  minKey?: keyof RobotConfig;
  minText?: string;
  maxKey?: keyof RobotConfig;
  maxText?: string;
};

// ── Config row ────────────────────────────────────────────────────────────────
//
// Flat kit ListRow (icon tile + label + value/right) for use inside a Card,
// with the trailing Divider baked in so call sites don't need to manage it.

function ConfigRow({
  icon,
  tileBg,
  label,
  value,
  last = false,
  onPress,
  right,
}: {
  icon: React.ReactNode;
  tileBg?: string;
  label: string;
  value?: string;
  last?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <>
      <ListRow
        card={false}
        icon={icon}
        iconColor={tileBg}
        title={label}
        chevron={false}
        onPress={onPress}
        right={right ?? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      />
      {!last && <Divider inset />}
    </>
  );
}

// ── Direction toggle ───────────────────────────────────────────────────────────

function DirectionToggle({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <SegmentedControl
      options={[{ label: "−", value: "-1" }, { label: "+", value: "1" }]}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      style={styles.dirToggleRow}
    />
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConfigureRobot() {
  const [config, setConfig] = useState<RobotConfig | null>(null);
  const [editing, setEditing] = useState<EditingField | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState<null | "motorSetup" | "all">(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    robotClient.getRobotConfig().then(setConfig).catch(() => {});
  }, []);

  // Reset to defaults on the controller, then re-pull the resulting config so the
  // page reflects exactly what was applied. "all" is refused while moving/homing.
  async function resetConfig(section: "motorSetup" | "all") {
    setResetting(true);
    try {
      await robotClient.resetRobotConfig(section);
      const fresh = await robotClient.getRobotConfig();
      setConfig(fresh);
      setConfirmReset(null);
    } catch (e) {
      setConfirmReset(null);
      appAlert("Couldn't reset", String(e ?? "Reset failed"), [{ text: "OK" }]);
    } finally {
      setResetting(false);
    }
  }

  const isCNC = config?.robotType === "CNC4Axis";

  async function toggleJointLimits() {
    if (!config) return;
    const next = !config.jointLimitsEnabled;
    setConfig({ ...config, jointLimitsEnabled: next });
    try { await robotClient.setRobotConfig({ jointLimitsEnabled: next }); } catch {}
  }

  async function saveField() {
    if (!editing || !config) return;
    setSaving(true);
    try {
      const patch: any = {};
      if ((editing.type === "number" || editing.type === "homing") && editing.numKey)
        patch[editing.numKey] = parseFloat(editing.numText);
      if ((editing.type === "direction" || editing.type === "homing") && editing.dirKey)
        patch[editing.dirKey] = editing.dirValue;
      if (editing.type === "cncAxis") {
        if (editing.cncStepsKey)   patch[editing.cncStepsKey]   = parseInt(editing.cncStepsText  ?? "1600") || 1600;
        if (editing.cncMeasureKey) patch[editing.cncMeasureKey] = parseFloat(editing.cncMeasureText ?? "5") || 5;
      }
      if (editing.type === "astroMotor") {
        if (editing.astroStepsKey) patch[editing.astroStepsKey] = parseInt(editing.astroStepsText ?? "") || (editing.defaultSteps ?? 1600);
        // Gear ratio must be > 0 (0/blank falls back to the default; the controller also guards this).
        if (editing.astroGearKey)  patch[editing.astroGearKey]  = parseFloat(editing.astroGearText ?? "") || (editing.defaultGear ?? 1);
      }
      if (editing.type === "jointLimit") {
        // Blank (or unparseable) clears the bound — send null so it becomes unset.
        const parseBound = (t?: string) => {
          const s = (t ?? "").trim();
          if (s === "") return null;
          const n = parseFloat(s);
          return Number.isFinite(n) ? n : null;
        };
        if (editing.minKey) patch[editing.minKey] = parseBound(editing.minText);
        if (editing.maxKey) patch[editing.maxKey] = parseBound(editing.maxText);
      }
      await robotClient.setRobotConfig(patch);
      setConfig({ ...config, ...patch });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function dirLabel(v: number) {
    return v === 1 ? "+" : "−";
  }

  const motorRows: { key: keyof RobotConfig; label: string }[] = isCNC
    ? [
        { key: "m1Direction", label: "M1 — X Axis" },
        { key: "m2Direction", label: "M2 — Y Axis" },
        { key: "m3Direction", label: "M3 — Z Axis" },
        { key: "m4Direction", label: "M4 — RZ Spindle" },
      ]
    : [
        { key: "m1Direction", label: "M1 — J1 Rotation" },
        { key: "m2Direction", label: "M2 — CoreXY A" },
        { key: "m3Direction", label: "M3 — CoreXY B" },
        { key: "m4Direction", label: "M4 — J4 Rotation" },
      ];

  // ASTRO per-motor step resolution + gear ratio. Defaults mirror the controller
  // (M1–M3 = 1600 spr, M4 = 400 spr, all gear 1:1).
  const astroMotorRows: { label: string; stepsKey: keyof RobotConfig; gearKey: keyof RobotConfig; defSteps: number; defGear: number }[] = [
    { label: "M1 — J1 Rotation", stepsKey: "astroStepsPerRevM1", gearKey: "astroGearRatioM1", defSteps: 1600, defGear: 1 },
    { label: "M2 — CoreXY A",    stepsKey: "astroStepsPerRevM2", gearKey: "astroGearRatioM2", defSteps: 1600, defGear: 1 },
    { label: "M3 — CoreXY B",    stepsKey: "astroStepsPerRevM3", gearKey: "astroGearRatioM3", defSteps: 1600, defGear: 1 },
    { label: "M4 — J4 Rotation", stepsKey: "astroStepsPerRevM4", gearKey: "astroGearRatioM4", defSteps: 400,  defGear: 1 },
  ];

  const isWide = useIsWide();

  const motionSection = (
    <>
        {/* ── Motor Directions ── */}
        <SectionHeader
          title="Motor Directions"
          icon={Zap}
          right={<InfoTip text="Flips a motor's electrical direction in software. Use it if commanding '+' moves that axis the wrong way — it only changes which sign counts as forward, not how far or which axis moves. Changes here take effect on the connected controller as soon as you save, so double-check values before saving." />}
        />
        <Card padded={false}>
          {motorRows.map(({ key, label }, idx) => (
            <ConfigRow
              key={key}
              icon={<Zap size={16} color={colors.warning} />}
              tileBg={colors.warningSoft}
              label={label}
              value={config ? dirLabel(config[key] as number) : "—"}
              last={idx === motorRows.length - 1}
              onPress={config ? () => setEditing({
                label,
                type: "direction",
                dirKey: key,
                dirValue: config[key] as number,
                numText: "",
              }) : undefined}
            />
          ))}
        </Card>

        {/* ── Homing — ASTRO ── */}
        {!isCNC && (
          <>
            <SectionHeader
              title="Homing"
              icon={Home}
              right={<InfoTip text="Used only during the homing cycle: how fast each axis drives toward its home switch, which direction it drives to find that switch, and the position or angle assigned once it gets there." />}
            />
            <Card padded={false}>
              <ConfigRow
                icon={<Home size={16} color={accents.purple} />}
                tileBg={accents.purpleSoft}
                label="Homing Speed"
                value={config ? `${config.homingSpeed} u/s` : "—"}
                onPress={config ? () => setEditing({
                  label: "Homing Speed", type: "number",
                  numKey: "homingSpeed", numText: String(config.homingSpeed),
                  unit: "u/s", placeholder: "20", dirValue: 1,
                }) : undefined}
              />
              <ConfigRow
                icon={<RotateCcw size={16} color={accents.cyan} />}
                tileBg={accents.cyanSoft}
                label="J1 Homing"
                value={config ? `${config.j1HomeOffsetDeg}° · ${dirLabel(config.j1HomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "J1 Homing", type: "homing",
                  numKey: "j1HomeOffsetDeg", numText: String(config.j1HomeOffsetDeg),
                  unit: "°", placeholder: "-17",
                  dirKey: "j1HomingDirection", dirValue: config.j1HomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveVertical size={16} color={colors.success} />}
                tileBg={colors.successSoft}
                label="Vertical Homing"
                value={config ? `${config.verticalHomePosition} mm · ${dirLabel(config.verticalHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "Vertical Homing", type: "homing",
                  numKey: "verticalHomePosition", numText: String(config.verticalHomePosition),
                  unit: "mm", placeholder: "445",
                  dirKey: "verticalHomingDirection", dirValue: config.verticalHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveHorizontal size={16} color={accents.orange} />}
                tileBg={accents.orangeSoft}
                label="Horizontal Homing"
                value={config ? `${config.horizontalHomePosition} mm · ${dirLabel(config.horizontalHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "Horizontal Homing", type: "homing",
                  numKey: "horizontalHomePosition", numText: String(config.horizontalHomePosition),
                  unit: "mm", placeholder: "413",
                  dirKey: "horizontalHomingDirection", dirValue: config.horizontalHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<RotateCcw size={16} color={accents.purple} />}
                tileBg={accents.purpleSoft}
                label="J4 Home Offset"
                value={config ? `${config.j4HomeOffsetDeg}°` : "—"}
                last
                onPress={config ? () => setEditing({
                  label: "J4 Home Offset", type: "number",
                  numKey: "j4HomeOffsetDeg", numText: String(config.j4HomeOffsetDeg),
                  unit: "°", placeholder: "0", dirValue: 1,
                }) : undefined}
              />
            </Card>

            {/* ── Motor Setup (ASTRO) ── */}
            <SectionHeader
              title="Motor Setup"
              icon={Gauge}
              right={<InfoTip text="Microstep resolution (steps per motor revolution) and gear ratio (motor turns per output turn) for each motor — used to convert motion into step pulses. Match them to your driver's microstepping and any joint gearing. Defaults: M1–M3 1600 spr, M4 400 spr, all 1:1." />}
            />
            <Card padded={false}>
              {astroMotorRows.map(({ label, stepsKey, gearKey, defSteps, defGear }) => (
                <ConfigRow
                  key={stepsKey}
                  icon={<Gauge size={16} color={accents.purple} />}
                  tileBg={accents.purpleSoft}
                  label={label}
                  value={config ? `${config[stepsKey] ?? defSteps} spr · ${config[gearKey] ?? defGear}:1` : "—"}
                  onPress={config ? () => setEditing({
                    label, type: "astroMotor", numText: "", dirValue: 1,
                    astroStepsKey: stepsKey, astroStepsText: String(config[stepsKey] ?? defSteps),
                    astroGearKey: gearKey,   astroGearText:  String(config[gearKey] ?? defGear),
                    defaultSteps: defSteps,  defaultGear:    defGear,
                  }) : undefined}
                />
              ))}
              <ConfigRow
                icon={<RotateCcw size={16} color={colors.textMuted} />}
                tileBg={colors.background}
                label="Reset Motor Setup"
                value="Defaults"
                last
                onPress={config && !resetting ? () => setConfirmReset("motorSetup") : undefined}
              />
            </Card>

            {/* ── Joint Gearing (ASTRO) ── */}
            <SectionHeader
              title="Joint Gearing"
              icon={RotateCcw}
              right={<InfoTip text="Drivetrain reduction the kinematics uses to turn joint motion into motor motion — separate from the per-motor gear above. J1/J4 are gear ratios (motor turns per joint turn); CoreXY is the belt pulley pitch diameter (linear travel per motor rev = π · PCD). Defaults: J1 4:1, J4 10:1, CoreXY 19.099 mm." />}
            />
            <Card padded={false}>
              <ConfigRow
                icon={<RotateCcw size={16} color={accents.cyan} />}
                tileBg={accents.cyanSoft}
                label="J1 — Base Rotation"
                value={config ? `${config.astroJoint1GearRatio}:1` : "—"}
                onPress={config ? () => setEditing({
                  label: "J1 Gear Ratio", type: "number",
                  numKey: "astroJoint1GearRatio", numText: String(config.astroJoint1GearRatio),
                  editLabel: "GEAR RATIO (motor : joint)", placeholder: "4", dirValue: 1,
                }) : undefined}
              />
              <ConfigRow
                icon={<RotateCcw size={16} color={accents.purple} />}
                tileBg={accents.purpleSoft}
                label="J4 — EOAT Rotation"
                value={config ? `${config.astroJoint4GearRatio}:1` : "—"}
                onPress={config ? () => setEditing({
                  label: "J4 Gear Ratio", type: "number",
                  numKey: "astroJoint4GearRatio", numText: String(config.astroJoint4GearRatio),
                  editLabel: "GEAR RATIO (motor : joint)", placeholder: "10", dirValue: 1,
                }) : undefined}
              />
              <ConfigRow
                icon={<Ruler size={16} color={colors.success} />}
                tileBg={colors.successSoft}
                label="CoreXY Pulley PCD"
                value={config ? `${config.astroCoreXyPulleyPcdMm} mm` : "—"}
                last
                onPress={config ? () => setEditing({
                  label: "CoreXY Pulley PCD", type: "number",
                  numKey: "astroCoreXyPulleyPcdMm", numText: String(config.astroCoreXyPulleyPcdMm),
                  unit: "mm", editLabel: "PULLEY PITCH DIAMETER (mm)", placeholder: "19.099", dirValue: 1,
                }) : undefined}
              />
            </Card>
          </>
        )}

        {/* ── Homing — CNC4Axis ── */}
        {isCNC && (
          <>
            <SectionHeader
              title="Homing"
              icon={Home}
              right={<InfoTip text="Used only during the homing cycle: how fast each axis drives toward its home switch, which direction it drives to find that switch, and the position or angle assigned once it gets there." />}
            />
            <Card padded={false}>
              <ConfigRow
                icon={<Home size={16} color={accents.purple} />}
                tileBg={accents.purpleSoft}
                label="Homing Speed"
                value={config ? `${config.homingSpeed} u/s` : "—"}
                onPress={config ? () => setEditing({
                  label: "Homing Speed", type: "number",
                  numKey: "homingSpeed", numText: String(config.homingSpeed),
                  unit: "u/s", placeholder: "20", dirValue: 1,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveHorizontal size={16} color={colors.success} />}
                tileBg={colors.successSoft}
                label="X Home Position"
                value={config ? `${config.cncXHomePosition} mm · ${dirLabel(config.cncXHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "X Home Position", type: "homing",
                  numKey: "cncXHomePosition", numText: String(config.cncXHomePosition),
                  unit: "mm", placeholder: "0",
                  dirKey: "cncXHomingDirection", dirValue: config.cncXHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveHorizontal size={16} color={accents.orange} />}
                tileBg={accents.orangeSoft}
                label="Y Home Position"
                value={config ? `${config.cncYHomePosition} mm · ${dirLabel(config.cncYHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "Y Home Position", type: "homing",
                  numKey: "cncYHomePosition", numText: String(config.cncYHomePosition),
                  unit: "mm", placeholder: "0",
                  dirKey: "cncYHomingDirection", dirValue: config.cncYHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<MoveVertical size={16} color={accents.cyan} />}
                tileBg={accents.cyanSoft}
                label="Z Home Position"
                value={config ? `${config.cncZHomePosition} mm · ${dirLabel(config.cncZHomingDirection)}` : "—"}
                onPress={config ? () => setEditing({
                  label: "Z Home Position", type: "homing",
                  numKey: "cncZHomePosition", numText: String(config.cncZHomePosition),
                  unit: "mm", placeholder: "0",
                  dirKey: "cncZHomingDirection", dirValue: config.cncZHomingDirection,
                }) : undefined}
              />
              <ConfigRow
                icon={<RotateCcw size={16} color={accents.purple} />}
                tileBg={accents.purpleSoft}
                label="RZ Home Angle"
                value={config ? `${config.cncRzHomePosition}°` : "—"}
                last
                onPress={config ? () => setEditing({
                  label: "RZ Home Angle", type: "number",
                  numKey: "cncRzHomePosition", numText: String(config.cncRzHomePosition),
                  unit: "°", placeholder: "0", dirValue: 1,
                }) : undefined}
              />
            </Card>

            {/* ── Motor Setup (CNC only) ── */}
            <SectionHeader
              title="Motor Setup"
              icon={Gauge}
              right={<InfoTip text="Steps per motor revolution and how far one revolution moves the axis (mm) or spindle (degrees) — used to convert motion commands into step pulses. Match these to your driver's microstepping and leadscrew or pulley." />}
            />
            <Card padded={false}>
              {([
                { label: "X Axis",    stepsKey: "cncStepsPerRevX"  as const, measureKey: "cncMmPerRevX"   as const, isRotary: false },
                { label: "Y Axis",    stepsKey: "cncStepsPerRevY"  as const, measureKey: "cncMmPerRevY"   as const, isRotary: false },
                { label: "Z Axis",    stepsKey: "cncStepsPerRevZ"  as const, measureKey: "cncMmPerRevZ"   as const, isRotary: false },
                { label: "RZ Spindle",stepsKey: "cncStepsPerRevRZ" as const, measureKey: "cncDegPerRevRZ" as const, isRotary: true  },
              ] as { label: string; stepsKey: keyof RobotConfig; measureKey: keyof RobotConfig; isRotary: boolean }[]).map(({ label, stepsKey, measureKey, isRotary }, idx, arr) => (
                <ConfigRow
                  key={stepsKey}
                  icon={<Gauge size={16} color={accents.purple} />}
                  tileBg={accents.purpleSoft}
                  label={label}
                  value={config ? `${config[stepsKey]} spr · ${config[measureKey]} ${isRotary ? "°/rev" : "mm/rev"}` : "—"}
                  onPress={config ? () => setEditing({
                    label, type: "cncAxis",
                    numText: "", dirValue: 1,
                    cncStepsKey:   stepsKey,
                    cncStepsText:  String(config[stepsKey]),
                    cncMeasureKey: measureKey,
                    cncMeasureText: String(config[measureKey]),
                    cncIsRotary: isRotary,
                  }) : undefined}
                />
              ))}
              <ConfigRow
                icon={<RotateCcw size={16} color={colors.textMuted} />}
                tileBg={colors.background}
                label="Reset Motor Setup"
                value="Defaults"
                last
                onPress={config && !resetting ? () => setConfirmReset("motorSetup") : undefined}
              />
            </Card>
          </>
        )}
    </>
  );

  const tuningSection = (
    <>
        {/* ── Jog Speeds ── */}
        <SectionHeader
          title="Jogging"
          icon={Gauge}
          right={<InfoTip text="Speeds used by the Slow / Normal / Fast toggle on the Jog & Teach screen." />}
        />
        <Card padded={false}>
          {([
            { key: "jogSlowSpeed"   as const, label: "Slow Speed"   },
            { key: "jogNormalSpeed" as const, label: "Normal Speed" },
            { key: "jogFastSpeed"   as const, label: "Fast Speed"   },
          ] as { key: keyof RobotConfig; label: string }[]).map(({ key, label }, idx, arr) => (
            <ConfigRow
              key={key}
              icon={<Gauge size={16} color={colors.success} />}
              tileBg={colors.successSoft}
              label={label}
              value={config ? `${config[key]} u/s` : "—"}
              last={idx === arr.length - 1}
              onPress={config ? () => setEditing({
                label, type: "number",
                numKey: key, numText: String(config[key]),
                unit: "u/s", placeholder: "100", dirValue: 1,
              }) : undefined}
            />
          ))}
        </Card>

        {/* ── Joint Limits ── */}
        <SectionHeader
          title="Joint Limits"
          icon={ShieldAlert}
          right={<InfoTip text="When Soft Limits is on, the controller faults and stops motion if a joint would move past its Min or Max below. Leave a bound blank to leave that side unenforced." />}
        />
        <Card padded={false}>
          <ConfigRow
            icon={<ShieldAlert size={16} color={config?.jointLimitsEnabled ? colors.success : colors.textFaint} />}
            tileBg={config?.jointLimitsEnabled ? colors.successSoft : colors.background}
            label="Soft Limits"
            right={
              <Switch
                value={!!config?.jointLimitsEnabled}
                onValueChange={toggleJointLimits}
                disabled={!config}
                trackColor={{ true: colors.success, false: colors.borderStrong }}
                thumbColor={colors.surface}
              />
            }
          />
          {((isCNC
            ? [
                { label: "X — Linear",  minKey: "joint1Min" as const, maxKey: "joint1Max" as const, unit: "mm" },
                { label: "Y — Linear",  minKey: "joint2Min" as const, maxKey: "joint2Max" as const, unit: "mm" },
                { label: "Z — Linear",  minKey: "joint3Min" as const, maxKey: "joint3Max" as const, unit: "mm" },
                { label: "RZ — Rotary", minKey: "joint4Min" as const, maxKey: "joint4Max" as const, unit: "°"  },
              ]
            : [
                { label: "J1 — Base Rotation", minKey: "joint1Min" as const, maxKey: "joint1Max" as const, unit: "°"  },
                { label: "J2 — Radial Reach",  minKey: "joint2Min" as const, maxKey: "joint2Max" as const, unit: "mm" },
                { label: "J3 — Vertical",      minKey: "joint3Min" as const, maxKey: "joint3Max" as const, unit: "mm" },
                { label: "J4 — EOAT Rotation", minKey: "joint4Min" as const, maxKey: "joint4Max" as const, unit: "°"  },
              ]) as { label: string; minKey: keyof RobotConfig; maxKey: keyof RobotConfig; unit: string }[])
            .map(({ label, minKey, maxKey, unit }, idx, arr) => (
              <ConfigRow
                key={minKey}
                icon={<Ruler size={16} color={accents.cyan} />}
                tileBg={accents.cyanSoft}
                label={label}
                value={config
                  ? (config[minKey] == null && config[maxKey] == null
                      ? "Not set"
                      : `${config[minKey] ?? "—"} … ${config[maxKey] ?? "—"} ${unit}`)
                  : "—"}
                last={idx === arr.length - 1}
                onPress={config ? () => setEditing({
                  label, type: "jointLimit",
                  numText: "", dirValue: 1, unit,
                  minKey, minText: config[minKey] == null ? "" : String(config[minKey]),
                  maxKey, maxText: config[maxKey] == null ? "" : String(config[maxKey]),
                }) : undefined}
              />
            ))}
        </Card>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="Configure" subtitle="Homing offsets, speeds and motion settings" />
      <Screen>
        {isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideCol}>{motionSection}</View>
            <View style={styles.wideCol}>{tuningSection}</View>
          </View>
        ) : (
          <>
            {motionSection}
            {tuningSection}
          </>
        )}

        {/* ── Reset all to defaults ── */}
        <View style={styles.resetAllWrap}>
          <Button
            label={resetting ? "Resetting…" : "Reset All Settings to Defaults"}
            variant="destructive"
            icon={<RotateCcw size={16} color={buttonTextColor("destructive")} />}
            onPress={() => setConfirmReset("all")}
            disabled={!config || resetting}
          />
          <Text style={styles.resetAllHint}>
            Restores homing, motor setup, jog speeds and joint limits to defaults. Robot type and device toggles are kept.
          </Text>
        </View>

        {/* ── Reset confirmation ── */}
        <Modal
          visible={confirmReset !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmReset(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {confirmReset === "all" ? "Reset all settings?" : "Reset motor setup?"}
              </Text>
              <Text style={styles.confirmBody}>
                {confirmReset === "all"
                  ? "Homing offsets, motor setup, jog speeds and joint limits will be restored to defaults. Robot type and device toggles are kept. This can't be undone."
                  : "Steps per revolution and gear ratios will be restored to their default values. This can't be undone."}
              </Text>
              <View style={styles.modalButtons}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setConfirmReset(null)}
                  disabled={resetting}
                  style={styles.modalBtn}
                />
                <Button
                  label={resetting ? "Resetting…" : "Reset"}
                  variant="destructive"
                  onPress={() => confirmReset && resetConfig(confirmReset)}
                  disabled={resetting}
                  style={styles.modalBtn}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* ── Edit modal ── */}
        <Modal
          visible={editing !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setEditing(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{editing?.label}</Text>

              {(editing?.type === "number" || editing?.type === "homing") && (
                <>
                  <Text style={styles.editLabel}>
                    {editing.editLabel ?? (editing.unit ? `OFFSET (${editing.unit})` : "VALUE")}
                  </Text>
                  <Input
                    style={styles.editInput}
                    value={editing.numText}
                    onChangeText={v => setEditing(e => e ? { ...e, numText: v } : e)}
                    keyboardType="numeric"
                    placeholder={editing.placeholder ?? "0"}
                    autoFocus={editing.type === "number"}
                  />
                </>
              )}

              {(editing?.type === "direction" || editing?.type === "homing") && (
                <>
                  <Text style={styles.editLabel}>DIRECTION</Text>
                  <DirectionToggle
                    value={editing.dirValue}
                    onChange={v => setEditing(e => e ? { ...e, dirValue: v } : e)}
                  />
                </>
              )}

              {editing?.type === "jointLimit" && (
                <>
                  <Text style={styles.editLabel}>MINIMUM {editing.unit ? `(${editing.unit})` : ""}</Text>
                  <Input
                    style={styles.editInput}
                    value={editing.minText}
                    onChangeText={v => setEditing(e => e ? { ...e, minText: v } : e)}
                    keyboardType="numbers-and-punctuation"
                    placeholder="Unset"
                    autoFocus
                  />
                  <Text style={styles.editLabel}>MAXIMUM {editing.unit ? `(${editing.unit})` : ""}</Text>
                  <Input
                    style={styles.editInput}
                    value={editing.maxText}
                    onChangeText={v => setEditing(e => e ? { ...e, maxText: v } : e)}
                    keyboardType="numbers-and-punctuation"
                    placeholder="Unset"
                  />
                  <Text style={styles.limitHint}>Leave a field blank to disable that bound.</Text>
                </>
              )}

              {editing?.type === "cncAxis" && (
                <>
                  <Text style={styles.editLabel}>STEPS PER REVOLUTION</Text>
                  <ChipGroup style={styles.presetRow}>
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
                        selected={editing.cncStepsText === String(steps)}
                        onPress={() => setEditing(e => e ? { ...e, cncStepsText: String(steps) } : e)}
                        tint={[accents.purple, accents.purpleSoft]}
                      />
                    ))}
                  </ChipGroup>
                  <Input
                    style={styles.editInput}
                    value={editing.cncStepsText ?? ""}
                    onChangeText={v => setEditing(e => e ? { ...e, cncStepsText: v } : e)}
                    keyboardType="numeric"
                    placeholder="Custom"
                  />
                  <Text style={[styles.editLabel, { marginTop: spacing.sm }]}>
                    {editing.cncIsRotary ? "DEG PER REVOLUTION" : "MM PER REVOLUTION"}
                  </Text>
                  <Input
                    style={styles.editInput}
                    value={editing.cncMeasureText ?? ""}
                    onChangeText={v => setEditing(e => e ? { ...e, cncMeasureText: v } : e)}
                    keyboardType="decimal-pad"
                    placeholder={editing.cncIsRotary ? "360" : "5"}
                  />
                </>
              )}

              {editing?.type === "astroMotor" && (
                <>
                  <Text style={styles.editLabel}>STEPS PER REVOLUTION</Text>
                  <ChipGroup style={styles.presetRow}>
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
                        selected={editing.astroStepsText === String(steps)}
                        onPress={() => setEditing(e => e ? { ...e, astroStepsText: String(steps) } : e)}
                        tint={[accents.purple, accents.purpleSoft]}
                      />
                    ))}
                  </ChipGroup>
                  <Input
                    style={styles.editInput}
                    value={editing.astroStepsText ?? ""}
                    onChangeText={v => setEditing(e => e ? { ...e, astroStepsText: v } : e)}
                    keyboardType="numeric"
                    placeholder={String(editing.defaultSteps ?? 1600)}
                  />
                  <Text style={[styles.editLabel, { marginTop: spacing.sm }]}>GEAR RATIO (motor : output)</Text>
                  <Input
                    style={styles.editInput}
                    value={editing.astroGearText ?? ""}
                    onChangeText={v => setEditing(e => e ? { ...e, astroGearText: v } : e)}
                    keyboardType="decimal-pad"
                    placeholder={String(editing.defaultGear ?? 1)}
                  />
                  <Text style={styles.limitHint}>
                    Default: {editing.defaultSteps} steps/rev · {editing.defaultGear}:1
                  </Text>
                </>
              )}

              <View style={styles.modalButtons}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setEditing(null)}
                  style={styles.modalBtn}
                />
                <Button
                  label={saving ? "Saving…" : "Save"}
                  variant="primary"
                  onPress={saveField}
                  disabled={saving}
                  style={styles.modalBtn}
                />
              </View>
            </View>
          </View>
        </Modal>
      </Screen>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  rowValue: {
    ...type.body,
    color: colors.textMuted,
    maxWidth: "45%",
    textAlign: "right",
  },

  // ── Wide two-column layout ──────────────────────────────────────────────────
  // Motor directions/homing/motor-setup on the left, jog speeds and joint
  // limits on the right — turns the long single-column scroll into two.
  wideRow: {
    flexDirection: "row",
    gap: spacing.lg,
    alignItems: "flex-start",
  },
  wideCol: { flex: 1, gap: spacing.md },

  // ── Reset-all footer ─────────────────────────────────────────────────────────
  resetAllWrap: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  resetAllHint: {
    ...type.caption,
    textAlign: "center",
  },

  // ── Modal ──────────────────────────────────────────────────────────────────
  confirmBody: {
    ...type.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl - 4,
    width: 300,
    ...shadows.raised,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  editLabel: {
    ...type.sectionLabel,
    marginBottom: spacing.xs,
  },
  editInput: {
    marginBottom: spacing.md,
  },
  limitHint: {
    ...type.caption,
    marginTop: -4,
    marginBottom: spacing.md,
  },

  // ── Direction toggle ───────────────────────────────────────────────────────
  dirToggleRow: {
    marginBottom: spacing.md,
  },
  presetRow: {
    marginBottom: spacing.sm,
  },

  // ── Modal buttons ──────────────────────────────────────────────────────────
  modalButtons: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.xs,
  },
  modalBtn: {
    flex: 1,
  },
});
