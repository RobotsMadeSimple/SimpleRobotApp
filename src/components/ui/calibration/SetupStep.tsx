import { Text, View } from "react-native";
import { ScanSearch } from "lucide-react-native";

import { Button, buttonTextColor, Card, Chip, ChipGroup, FormRow, Input, SegmentedControl, StatusPill } from "@/src/components/ui/kit";
import { relativeTime } from "@/src/components/ui/builder/RevisionsSheet";
import { CameraCalibration, CameraState, Tool } from "@/src/models/robotModels";
import { cs } from "./calibrationStyles";
import { Notice } from "./Notice";

export type DotPolarity = "dark" | "light";

type Props = {
  camera: CameraState | undefined;
  existing: CameraCalibration | null;
  pitch: string;
  onPitchChange: (v: string) => void;
  polarity: DotPolarity;
  onPolarityChange: (v: DotPolarity) => void;
  tools: Tool[];
  activeTool: string;
  onToolChange: (name: string) => void;
  detecting: boolean;
  onDetect: () => void;
};

export const parsePitch = (text: string) => {
  const n = Number(text.replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Step 1 — camera, dot pitch, dot polarity and the tool that will touch the sheet. */
export function SetupStep({
  camera, existing, pitch, onPitchChange, polarity, onPolarityChange,
  tools, activeTool, onToolChange, detecting, onDetect,
}: Props) {
  const pitchMm = parsePitch(pitch);
  const tool = activeTool || "None";

  return (
    <View style={cs.step}>
      <Card style={cs.cardGap}>
        <View style={cs.rowBetween}>
          <View style={cs.grow}>
            <Text style={cs.strong}>{camera?.name ?? "Camera"}</Text>
            <Text style={cs.caption}>
              {camera ? `Device ${camera.deviceIndex} · ${camera.width}×${camera.height}` : "Loading…"}
            </Text>
          </View>
          <StatusPill
            label={camera?.connected ? "Connected" : "Offline"}
            tone={camera?.connected ? "success" : "danger"}
            dot
          />
        </View>
        {existing && (
          <Text style={cs.body}>
            Calibrated {relativeTime(existing.calibratedUnixMs)} with a {existing.dotPitchMm} mm pitch
            ({existing.taughtRmsMm.toFixed(2)} mm RMS). Saving a new calibration replaces it.
          </Text>
        )}
      </Card>

      <Card style={cs.cardGap}>
        <FormRow label="Dot pitch (mm)" hint="Center-to-center distance between neighbouring dots — the same in both directions. Measure the printed sheet; printers often scale.">
          <Input
            value={pitch}
            onChangeText={onPitchChange}
            placeholder="20"
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
        </FormRow>
        <FormRow label="Dots">
          <SegmentedControl
            options={[{ label: "Dark on white", value: "dark" }, { label: "Light on dark", value: "light" }]}
            value={polarity}
            onChange={onPolarityChange}
          />
        </FormRow>
      </Card>

      <Card style={cs.cardGap}>
        <Text style={cs.label}>Active tool</Text>
        <Text style={cs.body}>
          Use the tool that will touch the sheet and select it as the active tool first — the
          taught positions are that tool's tip.
        </Text>
        <ChipGroup>
          {["None", ...tools.map(t => t.name)].map(name => (
            <Chip key={name} label={name} selected={tool === name} onPress={() => onToolChange(name)} />
          ))}
        </ChipGroup>
        {tool === "None" && (
          <Notice tone="warning" title="No tool selected">
            Without a tool the robot flange is taught, not the tip. Pick the tool that will touch the dots.
          </Notice>
        )}
      </Card>

      <Notice tone="info">
        Lay the dot sheet flat on the work plane, fully inside the camera view, with even light.
      </Notice>

      <Button
        label={detecting ? "Detecting…" : "Detect dots"}
        icon={<ScanSearch size={16} color={buttonTextColor("primary")} />}
        loading={detecting}
        disabled={!pitchMm || !camera}
        onPress={onDetect}
      />
    </View>
  );
}
