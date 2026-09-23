import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";

import { Button, buttonTextColor, Card, colors, SegmentedControl, StatusPill } from "@/src/components/ui/kit";
import { CameraLiveFeed } from "@/src/components/vision/CameraLiveFeed";
import { CalibrationDot, CalibrationSession } from "@/src/models/robotModels";
import { CalibrationProblem } from "./calibrationErrors";
import { cs } from "./calibrationStyles";
import { DotImage } from "./DotImage";
import { Notice } from "./Notice";
import { Requirement, StepFooter } from "./StepRequirements";

type Props = {
  cameraId: string;
  session: CalibrationSession | null;
  imageUri: string | null;
  selected: CalibrationDot | null;
  onSelect: (dot: CalibrationDot) => void;
  taughtIndices: ReadonlySet<number>;
  detecting: boolean;
  problem: CalibrationProblem | null;
  onRedetect: () => void;
  onBack: () => void;
  onNext: () => void;
};

export const dotLabel = (d: CalibrationDot) => `Dot #${d.index} (${d.i}, ${d.j})`;

/** Step 2 — the annotated frame, grid summary, warnings and Re-detect. */
export function DetectStep({
  cameraId, session, imageUri, selected, onSelect, taughtIndices, detecting, problem, onRedetect, onBack, onNext,
}: Props) {
  // After a detection the user can flip between the frozen, annotated frame and the
  // live camera to re-position the sheet before pressing Re-detect.
  const [view, setView] = useState<"detected" | "live">("detected");
  const showLive = !session || view === "live";

  const redetect = (
    <Button
      label={detecting ? "Detecting…" : session ? "Re-detect" : "Detect"}
      variant="secondary"
      size="sm"
      loading={detecting}
      icon={<RefreshCw size={14} color={buttonTextColor("secondary")} />}
      onPress={onRedetect}
    />
  );

  return (
    <View style={cs.step}>
      {problem && <Notice tone="danger" title={problem.title} action={redetect}>{problem.detail}</Notice>}

      {session && (
        <SegmentedControl
          options={[{ label: "Detected frame", value: "detected" }, { label: "Live camera", value: "live" }]}
          value={view}
          onChange={setView}
        />
      )}

      {showLive && (
        <Card style={cs.cardGap}>
          <CameraLiveFeed cameraId={cameraId} />
          <Text style={cs.caption}>
            {session
              ? "Live view. Adjust the sheet or the camera, then press Re-detect to grab a new frame."
              : "Live view. Lay the sheet flat, fully inside the frame and evenly lit, then press Detect."}
          </Text>
          {detecting && (
            <View style={cs.row}>
              <ActivityIndicator color={colors.accent} />
              <Text style={cs.body}>Grabbing a frame and fitting the dot grid…</Text>
            </View>
          )}
        </Card>
      )}

      {session && !showLive && (
        <DotImage
          uri={imageUri}
          imageWidth={session.imageWidth}
          imageHeight={session.imageHeight}
          dots={session.dots}
          selectedIndex={selected?.index ?? null}
          taughtIndices={taughtIndices}
          onSelect={onSelect}
        />
      )}

      {session && (
        <>

          <Card style={cs.cardGap}>
            <View style={cs.rowBetween}>
              <Text style={cs.label}>Grid</Text>
              {redetect}
            </View>
            <View style={cs.buttons}>
              <StatusPill tone="accent" label={`${session.gridRows} × ${session.gridCols}`} />
              <StatusPill tone="neutral" label={`${session.dots.length} dots`} />
              <StatusPill
                tone={session.gridRmsPx > 1.5 ? "warning" : "success"}
                label={`RMS ${session.gridRmsPx.toFixed(2)} px`}
              />
            </View>
            <Text style={cs.body}>
              {selected ? `${dotLabel(selected)} selected.` : "Tap a dot to check its number and grid index."}
            </Text>
          </Card>

          {session.warnings.length > 0 && (
            <Notice tone="warning" title="Detection warnings">
              <View style={{ gap: 2 }}>
                {session.warnings.map((w, k) => <Text key={k} style={cs.body}>• {w}</Text>)}
              </View>
            </Notice>
          )}
        </>
      )}

      <StepFooter
        requirements={detectRequirements(session, detecting, problem)}
        nextLabel="Next: Teach"
        onNext={onNext}
        onBack={onBack}
        busy={detecting}
      />
    </View>
  );
}

function detectRequirements(
  session: CalibrationSession | null, detecting: boolean, problem: CalibrationProblem | null,
): Requirement[] {
  const found = !!session && session.dots.length >= 4;
  return [
    {
      key: "dots",
      label: found ? `Dot grid detected (${session!.gridRows} × ${session!.gridCols})` : "Detect the dot grid",
      met: found,
      hint: detecting ? "Detecting…"
        : problem ? "Fix what the message above says, then press Re-detect."
        : "Press Detect. The sheet must be flat, fully in view and evenly lit.",
    },
    {
      key: "rms",
      label: "Grid fit is sharp (RMS under 1.5 px)",
      met: !!session && session.gridRmsPx <= 1.5,
      optional: true,
      hint: "A blurry or curled sheet raises this. Re-detect after flattening it or refocusing the camera.",
    },
  ];
}
