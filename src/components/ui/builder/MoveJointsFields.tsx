import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Crosshair } from "lucide-react-native";
import type { ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { useConnected, useRobotStatus } from "@/src/providers/RobotProvider";
import { Button, buttonTextColor, colors, spacing } from "@/src/components/ui/kit";
import { ms } from "./builderStyles";
import { ExpressionInput } from "./NumericInputs";

type JointKey = "j1" | "j2" | "j3" | "j4";

/** The four joints in the controller's joint-limit order, labelled for the robot type. */
function jointRows(robotType: string | undefined): { key: JointKey; label: string; unit: string }[] {
  if (robotType === "CNC4Axis") {
    return [
      { key: "j1", label: "X",  unit: "mm" },
      { key: "j2", label: "Y",  unit: "mm" },
      { key: "j3", label: "Z",  unit: "mm" },
      { key: "j4", label: "RZ", unit: "°" },
    ];
  }
  return [
    { key: "j1", label: "J1  ·  base rotation", unit: "°" },
    { key: "j2", label: "J2  ·  radial reach",  unit: "mm" },
    { key: "j3", label: "J3  ·  vertical",      unit: "mm" },
    { key: "j4", label: "J4  ·  tool rotation", unit: "°" },
  ];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000 || 0;   // || 0: no -0

const PROFILE_CHOICES: { value: ProgramStep["motionProfile"]; label: string }[] = [
  { value: undefined,   label: "Robot setting" },
  { value: "trapezoid", label: "Trapezoid" },
  { value: "scurve",    label: "S-curve" },
];

/**
 * A move's own speed profile: the robot's Motion profile setting (unset), the trapezoid, or the
 * jerk-limited S-curve. Shared by every move step that has `motionProfile`.
 */
export function MotionProfileField({ value, onChange }: {
  value: ProgramStep["motionProfile"];
  onChange: (v: ProgramStep["motionProfile"]) => void;
}) {
  return (
    <View style={[ms.modRow, { flexDirection: "column", alignItems: "stretch" }]}>
      <Text style={ms.subRowLabel}>Motion Profile</Text>
      <View style={ms.segRow}>
        {PROFILE_CHOICES.map(c => {
          const active = (value ?? undefined) === c.value;
          return (
            <TouchableOpacity key={c.label} style={[ms.seg, active && ms.segActive, { flex: 1 }]}
              onPress={() => onChange(c.value)} activeOpacity={0.8}
              accessibilityRole="button" accessibilityState={{ selected: active }}
              accessibilityLabel={`Motion profile: ${c.label}`}>
              <Text style={[ms.segText, active && ms.segTextActive]} numberOfLines={1}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={ms.hintText}>
        {value === "scurve"
          ? "Jerk-limited: the acceleration ramps up and down for a smoother start and stop (the move takes a little longer)."
          : value === "trapezoid"
          ? "Constant-acceleration ramps, whatever the robot's setting."
          : "Uses the robot's Motion profile setting (Robot → Config)."}
      </Text>
    </View>
  );
}

function fmt(v: number | undefined): string {
  // A readout a hair below zero would print "-0.00".
  return typeof v === "number" && Number.isFinite(v) ? (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) : "—";
}

/**
 * Move to Joints: the four joint targets (each a number or an expression, empty = keep the joint
 * where it is), the live joint readout beside each, and "Use current joints" to fill all four
 * from where the robot is now. The optional joints value ($home[0], jointsOf(…)) is rendered by
 * the caller from the step catalog and passed in as `jointsValueField`.
 */
export function MoveJointsFields({
  draft, set, setExpr, variables, contextVariables, jointsValueField,
}: {
  draft: ProgramStep;
  set: (patch: Partial<ProgramStep>) => void;
  setExpr: (key: string, expr: string | undefined) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
  jointsValueField?: React.ReactNode;
}) {
  const status    = useRobotStatus();
  const connected = useConnected();
  const rows      = jointRows(status.robotType);
  const live: Record<JointKey, number> = {
    j1: status.joint1Angle, j2: status.joint2X, j3: status.joint2Z, j4: status.joint4Angle,
  };

  function useCurrent() {
    // All four become literals at the live readout; their expressions go, so the value shown is the one used.
    for (const r of rows) setExpr(r.key, undefined);
    set({ j1: round3(live.j1), j2: round3(live.j2), j3: round3(live.j3), j4: round3(live.j4) });
  }

  const hasValue = !!draft.jointsExpr?.trim();
  return (
    <View>
      {jointsValueField}

      <Text style={[ms.hintText, { marginTop: spacing.md }]}>
        No inverse kinematics: each joint goes straight to its value. A joint left empty keeps its
        current value{hasValue ? "; a joint set here overrides the joints value above" : ""}.
      </Text>

      <Text style={[ms.fieldLabel, { marginTop: spacing.sm }]}>JOINT TARGETS</Text>
      {rows.map(r => (
        <View key={r.key} style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={ms.subRowLabel}>{r.label}  <Text style={{ color: colors.textFaint, fontWeight: "400" }}>({r.unit})</Text></Text>
            <Text style={{ fontSize: 12, color: colors.textFaint }}>now {fmt(live[r.key])}</Text>
          </View>
          <ExpressionInput
            style={ms.input}
            fieldKey={r.key}
            label={r.label}
            value={draft[r.key]}
            expressions={draft.expressions}
            onChangeValue={v => set({ [r.key]: v } as Partial<ProgramStep>)}
            onChangeExpr={setExpr}
            variables={variables}
            contextVariables={contextVariables}
            allowUndefined
            placeholder={hasValue ? "from the joints value" : "keep current"}
          />
        </View>
      ))}

      <Button
        label="Use current joints"
        variant="secondary"
        size="sm"
        icon={<Crosshair size={14} color={buttonTextColor("secondary")} />}
        disabled={!connected}
        onPress={useCurrent}
        style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
      />
      <Text style={ms.hintText}>
        {connected
          ? "Fills all four joints with where the robot is now."
          : "Connect to a robot to copy its current joints."}
      </Text>
    </View>
  );
}
