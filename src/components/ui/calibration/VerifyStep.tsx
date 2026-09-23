import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ArrowUpToLine, Check, OctagonX } from "lucide-react-native";

import { appAlert } from "@/src/components/ui/AppAlert";
import { Button, buttonTextColor, Card, colors, PositionReadout } from "@/src/components/ui/kit";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { CalibrationDot, CalibrationRobotPoint, CalibrationSession } from "@/src/models/robotModels";
import { CalibrationProblem } from "./calibrationErrors";
import { cs } from "./calibrationStyles";
import { dotLabel } from "./DetectStep";
import { DotImage } from "./DotImage";
import { Notice } from "./Notice";
import { useJogSpeeds } from "./useJogSpeeds";

/** Clearance above the predicted point for the verification move. */
const APPROACH_MM = 20;

type Props = {
  session: CalibrationSession;
  imageUri: string | null;
  saved: boolean;
  /** Tool the calibration was taught with. */
  calibrationTool: string;
  predicting: boolean;
  problem: CalibrationProblem | null;
  predict: (u: number, v: number) => Promise<CalibrationRobotPoint | undefined>;
  onBack: () => void;
  onDone: () => void;
};

/** Step 5 — tap any dot, see where the calibration puts it, optionally move above it. */
export function VerifyStep({
  session, imageUri, saved, calibrationTool, predicting, problem, predict, onBack, onDone,
}: Props) {
  const status = useRobotStatus();
  const jogSpeeds = useJogSpeeds();
  const [selected, setSelected]     = useState<CalibrationDot | null>(null);
  const [predicted, setPredicted]   = useState<CalibrationRobotPoint | null>(null);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    setPredicted(null);
    predict(selected.u, selected.v).then(p => { if (live && p) setPredicted(p); });
    return () => { live = false; };
  }, [selected, predict]);

  const tool = status.activeTool || "None";
  const toolMismatch = (calibrationTool || "None") !== tool;

  const confirmMove = () => {
    if (!predicted || !selected) return;
    const target = { x: predicted.x, y: predicted.y, z: predicted.z + APPROACH_MM, rz: status.rz };
    appAlert(
      "Move above dot?",
      `MoveL to X ${target.x.toFixed(2)}, Y ${target.y.toFixed(2)}, Z ${target.z.toFixed(2)} ` +
      `(${APPROACH_MM} mm above ${dotLabel(selected)}) at the Slow jog speed with tool "${tool}". ` +
      "Make sure the path is clear.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Move", onPress: () => { robotClient.moveL(target, jogSpeeds?.Slow).catch(() => {}); } },
      ],
    );
  };

  return (
    <View style={cs.step}>
      {!saved && (
        <Notice tone="warning" title="Not saved">
          This is a preview of the solved session. Go back to Solve and save it to use it in programs.
        </Notice>
      )}
      {problem && <Notice tone="danger" title={problem.title}>{problem.detail}</Notice>}

      <DotImage
        uri={imageUri}
        imageWidth={session.imageWidth}
        imageHeight={session.imageHeight}
        dots={session.dots}
        selectedIndex={selected?.index ?? null}
        onSelect={setSelected}
      />

      <Card style={cs.cardGap}>
        <View style={cs.rowBetween}>
          <Text style={cs.label}>Predicted robot position</Text>
          {predicting && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <Text style={cs.strong}>{selected ? dotLabel(selected) : "Tap any dot on the image"}</Text>
        {predicted && (
          <PositionReadout
            card={false}
            axes={[
              { label: "X", value: predicted.x, unit: "mm" },
              { label: "Y", value: predicted.y, unit: "mm" },
              { label: "Z", value: predicted.z, unit: "mm" },
            ]}
          />
        )}
        {toolMismatch && (
          <Notice tone="warning" title="Different tool active">
            {`Calibrated with "${calibrationTool || "None"}", but "${tool}" is active now — a move would place that tool's tip instead.`}
          </Notice>
        )}
        <Button
          label={`Move ${APPROACH_MM} mm above dot`}
          variant="secondary"
          icon={<ArrowUpToLine size={16} color={buttonTextColor("secondary")} />}
          disabled={!predicted || status.moving}
          onPress={confirmMove}
        />
        {status.moving && (
          <Button
            label="STOP"
            variant="destructive"
            icon={<OctagonX size={16} color={buttonTextColor("destructive")} />}
            onPress={() => { robotClient.hardStop().catch(() => {}); }}
          />
        )}
        <Text style={cs.caption}>
          Then jog down (Teach step) to check the tip lands on the dot center.
        </Text>
      </Card>

      <View style={cs.buttons}>
        <Button label="Back" variant="secondary" onPress={onBack} style={cs.grow} />
        <Button
          label="Done"
          icon={<Check size={16} color={buttonTextColor("primary")} />}
          onPress={onDone}
          style={cs.grow}
        />
      </View>
    </View>
  );
}
