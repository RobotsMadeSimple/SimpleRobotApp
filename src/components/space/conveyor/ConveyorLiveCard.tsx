import { Button, buttonTextColor, Card, colors, Input, spacing, StatusPill, type } from "@/src/components/ui/kit";
import { conveyorAuxAxis, conveyorStepsPerMm, mmPerSecToStepsPerSec } from "@/src/models/conveyors";
import type { AuxDeviceState, Conveyor } from "@/src/models/robotModels";
import { useConveyorStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { ChevronLeft, ChevronRight, Eraser, Plus, Square } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BeltStrip } from "./BeltStrip";
import { runConveyorCommand } from "./conveyorHooks";

/** Belt speed for the Run buttons when the axis has no action velocity set (mm/s). */
const DEFAULT_RUN_MM_S = 50;

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1}>
        {value}
        {unit ? <Text style={s.statUnit}>{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

/**
 * A saved conveyor's live state: travel, speed, the belt strip with its queued parts, counts, and
 * the manual controls (add a part, clear the queue; run/stop an aux-driven belt; set the travel of
 * a manual one). Reads its own status slice, so the ~10 Hz conveyor updates re-render only this.
 */
export function ConveyorLiveCard({ conveyor, auxDevices }: { conveyor: Conveyor; auxDevices: AuxDeviceState[] }) {
  const status = useConveyorStatus(conveyor.id);
  const [travelText, setTravelText] = useState("");

  const aux = conveyorAuxAxis(conveyor, auxDevices);
  const stepsPerMm = conveyorStepsPerMm(conveyor, aux?.axis);
  const runMmS = aux?.axis.actionVelocity && aux.axis.actionVelocity > 0 ? aux.axis.actionVelocity : DEFAULT_RUN_MM_S;
  const canRun = conveyor.source.kind === "aux" && !!aux && stepsPerMm > 0;

  const run = (dir: 1 | -1) => {
    if (!aux) return;
    const velocity = dir * mmPerSecToStepsPerSec(runMmS, stepsPerMm);
    runConveyorCommand("Run belt", () => robotClient.jogAux({ deviceId: aux.device.deviceId, axis: aux.axis.axisIndex, velocity }));
  };
  const stop = () => {
    if (!aux) return;
    runConveyorCommand("Stop belt", () => robotClient.stopAux(aux.device.deviceId, aux.axis.axisIndex));
  };
  const addPart = () => runConveyorCommand("Add part", () => robotClient.conveyorAddPart(conveyor.id, conveyor.sensor.offsetMm));
  const clearQueue = () => runConveyorCommand("Clear queue", () => robotClient.conveyorClearQueue(conveyor.id));
  const setTravel = (mm: number) => runConveyorCommand("Set travel", () => robotClient.conveyorSetTravel(conveyor.id, mm));

  const parts = status?.parts ?? [];
  const inWindow = parts.filter(p => p.x >= conveyor.window.startMm && p.x <= conveyor.window.endMm).length;

  return (
    <Card style={s.card}>
      <View style={s.headRow}>
        <Text style={type.title}>Live</Text>
        <View style={s.pills}>
          {status?.sourceOk === false && <StatusPill label="Source offline" tone="warning" dot />}
          {status?.tracking && <StatusPill label="Tracking" tone="success" dot />}
          {status
            ? <StatusPill label={status.running ? "Running" : "Stopped"} tone={status.running ? "accent" : "neutral"} dot />
            : <StatusPill label="No data" tone="neutral" />}
        </View>
      </View>

      <View style={s.stats}>
        <Stat label="Travel" value={status ? status.travelMm.toFixed(1) : "—"} unit="mm" />
        <Stat label="Speed" value={status ? status.speedMmS.toFixed(1) : "—"} unit="mm/s" />
        <Stat label="Queued" value={status ? `${parts.length}` : "—"} unit={status ? `· ${inWindow} in window` : undefined} />
        <Stat label="Picked" value={status ? `${status.picked}` : "—"} />
        <Stat label="Missed" value={status ? `${status.missed}` : "—"} />
      </View>

      <BeltStrip conveyor={conveyor} status={status} />

      {!status && (
        <Text style={s.caption}>
          The controller isn&apos;t reporting this conveyor yet. Live travel and parts appear here once it does.
        </Text>
      )}

      <View style={s.buttons}>
        <Button
          label="Add part" size="sm" variant="secondary"
          icon={<Plus size={14} color={buttonTextColor("secondary")} />}
          onPress={addPart}
        />
        <Button
          label="Clear queue" size="sm" variant="secondary"
          icon={<Eraser size={14} color={buttonTextColor("secondary")} />}
          onPress={clearQueue}
          disabled={!!status && parts.length === 0}
        />
      </View>

      {conveyor.source.kind === "aux" && (
        <View style={s.group}>
          <View style={s.buttons}>
            <Button
              label="Reverse" size="sm" variant="secondary" style={s.grow}
              icon={<ChevronLeft size={16} color={buttonTextColor("secondary")} />}
              onPress={() => run(-1)} disabled={!canRun}
            />
            <Button
              label="Stop" size="sm" variant="dangerSoft" style={s.grow}
              icon={<Square size={12} color={buttonTextColor("dangerSoft")} />}
              onPress={stop} disabled={!aux}
            />
            <Button
              label="Forward" size="sm" variant="secondary" style={s.grow}
              icon={<ChevronRight size={16} color={buttonTextColor("secondary")} />}
              onPress={() => run(1)} disabled={!canRun}
            />
          </View>
          <Text style={s.caption}>
            {!aux
              ? "The selected aux axis isn't connected."
              : stepsPerMm > 0
                ? `Runs at ${runMmS} mm/s (the axis's action velocity) · ${stepsPerMm.toFixed(2)} steps/mm.`
                : "Set the axis to Linear with its mm per rev (or a mm/step override here) to run it by speed."}
          </Text>
        </View>
      )}

      {conveyor.source.kind === "manual" && (
        <View style={s.group}>
          <View style={s.buttons}>
            <Input
              value={travelText}
              onChangeText={setTravelText}
              placeholder="Travel (mm)"
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              style={s.travelInput}
              accessibilityLabel="Travel (mm)"
            />
            <Button
              label="Set travel" size="sm" variant="secondary"
              disabled={!isFinite(parseFloat(travelText))}
              onPress={() => { const v = parseFloat(travelText); if (isFinite(v)) setTravel(v); }}
            />
            <Button
              label="+50 mm" size="sm" variant="ghost"
              onPress={() => setTravel((status?.travelMm ?? 0) + 50)}
            />
          </View>
          <Text style={s.caption}>A manual conveyor only moves when its travel is set — handy for trying a program without a belt.</Text>
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  card: { gap: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  pills: { flexDirection: "row", gap: spacing.xs },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: {
    flexGrow: 1, flexBasis: 96, minWidth: 0,
    backgroundColor: colors.surfaceMuted, borderRadius: 9,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm,
  },
  statLabel: { ...type.caption, fontWeight: "600" },
  statValue: { ...type.mono, fontSize: 15, color: colors.text, marginTop: 2 },
  statUnit: { ...type.caption },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  group: { gap: spacing.xs + 2 },
  grow: { flexGrow: 1 },
  caption: { ...type.caption, fontSize: 12 },
  travelInput: { width: 120 },
});
