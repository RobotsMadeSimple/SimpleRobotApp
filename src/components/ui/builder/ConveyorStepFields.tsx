import React, { useEffect } from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { colors } from "@/src/components/ui/kit";
import { ProgramStep, ProgramVariable } from "@/src/models/robotModels";
import { useConveyors, useConveyorsSupported } from "@/src/providers/RobotProvider";
import { ExpressionInput } from "./NumericInputs";
import { ms } from "./builderStyles";

export const CONVEYOR_STEP_TYPES = new Set<string>(["ConveyorTrack", "ConveyorEndTracking", "ConveyorAddPart", "ConveyorClearQueue"]);

/**
 * Fields of the four conveyor-tracking steps (controller docs/conveyor-tracking.md). The conveyor
 * is linked by its stable id; End Tracking may leave it unset (= whichever conveyor is tracking).
 */
export function ConveyorStepFields({
  draft, set, setExpr, variables, contextVariables,
}: {
  draft: ProgramStep;
  set: (p: Partial<ProgramStep>) => void;
  setExpr: (key: string, expr: string | undefined) => void;
  variables?: ProgramVariable[];
  contextVariables?: ProgramVariable[];
}) {
  const conveyors = useConveyors();
  const supported = useConveyorsSupported();
  const optional = draft.type === "ConveyorEndTracking";

  // A new step on a cell with conveyors starts on the first one (End Tracking stays "tracked").
  const needsDefault = !optional && !draft.conveyorId && conveyors.length > 0;
  const firstId = conveyors[0]?.id;
  useEffect(() => {
    if (needsDefault && firstId) set({ conveyorId: firstId });
  }, [needsDefault, firstId]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = !!draft.conveyorId && conveyors.length > 0 && !conveyors.some(c => c.id === draft.conveyorId);
  const rows: { id: string | undefined; label: string; desc?: string }[] = [
    ...(optional ? [{ id: undefined, label: "The tracked conveyor", desc: "Whichever conveyor is tracking a part" }] : []),
    ...conveyors.map(c => ({ id: c.id, label: c.name || c.id, desc: `Window ${c.window.startMm}–${c.window.endMm} mm` })),
    ...(missing ? [{ id: draft.conveyorId, label: "⚠ Missing conveyor", desc: "It was deleted — pick another" }] : []),
  ];

  const hint = {
    ConveyorTrack: "Picks the oldest queued part inside the conveyor's window and starts following it: later moves are taught relative to the part and ride along with the belt until End Tracking.",
    ConveyorEndTracking: "Stops following the part. The robot stays where it is and later moves are normal again.",
    ConveyorAddPart: "Adds a part to the queue by hand — e.g. where a vision step found it — instead of a sensor.",
    ConveyorClearQueue: "Drops every part queued on the conveyor.",
  }[draft.type as "ConveyorTrack"] ?? "";

  return (
    <>
      <Text style={ms.hintText}>{hint}</Text>

      <Text style={[ms.fieldLabel, { marginTop: 12 }]}>CONVEYOR</Text>
      {rows.length === 0 ? (
        <Text style={[ms.emptyHint, { marginTop: 4 }]}>
          {supported === false
            ? "This controller doesn't have conveyor tracking yet."
            : "No conveyors yet — add one under Space › Conveyors."}
        </Text>
      ) : rows.map((r, i) => {
        const active = (draft.conveyorId ?? undefined) === r.id;
        return (
          <TouchableOpacity key={r.id ?? "tracked"}
            style={[ms.row, i < rows.length - 1 && ms.rowBorder, active && ms.rowActive]}
            onPress={() => set({ conveyorId: r.id })} activeOpacity={0.7}
            accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <View style={[ms.radioRing, active && ms.radioRingActive]}>
              {active && <View style={ms.radioDot} />}
            </View>
            <View style={ms.rowText}>
              <Text style={[ms.rowLabel, active && ms.rowLabelActive]} numberOfLines={1}>{r.label}</Text>
              {r.desc ? <Text style={ms.rowDesc} numberOfLines={1}>{r.desc}</Text> : null}
            </View>
          </TouchableOpacity>
        );
      })}
      {conveyors.length === 0 && supported !== false && (
        <TouchableOpacity onPress={() => router.navigate("/space/conveyors")} activeOpacity={0.7}>
          <Text style={[ms.hintText, { color: colors.accent, fontWeight: "600" }]}>Open Conveyors</Text>
        </TouchableOpacity>
      )}

      {draft.type === "ConveyorTrack" && (
        <>
          <View style={[ms.switchRow, { marginTop: 14 }]}>
            <Text style={ms.switchLabel}>Wait for a part</Text>
            <Switch
              value={draft.trackWait !== false}
              onValueChange={v => set({ trackWait: v, trackTimeoutMs: v ? draft.trackTimeoutMs : undefined })}
              trackColor={{ false: colors.border, true: colors.accent }}
            />
          </View>
          <Text style={ms.hintText}>
            {draft.trackWait !== false
              ? "Waits until a part enters the window."
              : "Fails with conveyorTimeout at once when no part is in the window."}
          </Text>
          {draft.trackWait !== false && (
            <>
              <Text style={[ms.fieldLabel, { marginTop: 14 }]}>TIMEOUT  (ms, blank = wait forever)</Text>
              <TextInput
                style={ms.input}
                value={draft.trackTimeoutMs != null ? String(draft.trackTimeoutMs) : ""}
                onChangeText={t => set({ trackTimeoutMs: t ? (parseInt(t) || undefined) : undefined })}
                keyboardType="numeric" placeholder="No limit" placeholderTextColor={colors.textFaint}
                returnKeyType="done" selectTextOnFocus accessibilityLabel="Track timeout (ms)"
              />
              <Text style={ms.hintText}>On timeout the step fails with conveyorTimeout — catch it with a Try.</Text>
            </>
          )}
        </>
      )}

      {draft.type === "ConveyorEndTracking" && (
        <View style={[ms.switchRow, { marginTop: 14 }]}>
          <Text style={ms.switchLabel}>Count as released (not picked)</Text>
          <Switch
            value={draft.conveyorRelease === true}
            onValueChange={v => set({ conveyorRelease: v || undefined })}
            trackColor={{ false: colors.border, true: colors.accent }}
          />
        </View>
      )}

      {draft.type === "ConveyorAddPart" && (
        <>
          <Text style={[ms.fieldLabel, { marginTop: 14 }]}>PART POSITION  (mm along the belt)</Text>
          <ExpressionInput style={ms.input} fieldKey="partOffsetMm"
            value={draft.partOffsetMm} expressions={draft.expressions}
            onChangeValue={v => set({ partOffsetMm: v })} onChangeExpr={setExpr}
            placeholder="0" label="Part position (mm)" variables={variables} contextVariables={contextVariables} />
          <Text style={ms.hintText}>The part&apos;s X in the conveyor frame right now; the controller follows it from there as the belt moves.</Text>
        </>
      )}
    </>
  );
}
