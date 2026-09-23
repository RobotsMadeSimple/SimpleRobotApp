import { ActivityIndicator, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";

import { Button, buttonTextColor, Card, colors, StatusPill } from "@/src/components/ui/kit";
import { CalibrationDot, CalibrationSession } from "@/src/models/robotModels";
import { CalibrationProblem } from "./calibrationErrors";
import { cs } from "./calibrationStyles";
import { DotImage } from "./DotImage";
import { Notice } from "./Notice";

type Props = {
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
  session, imageUri, selected, onSelect, taughtIndices, detecting, problem, onRedetect, onBack, onNext,
}: Props) {
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

      {!session && detecting && (
        <Card style={[cs.cardGap, { alignItems: "center" }]}>
          <ActivityIndicator color={colors.accent} />
          <Text style={cs.body}>Grabbing a frame and fitting the dot grid…</Text>
        </Card>
      )}

      {session && (
        <>
          <DotImage
            uri={imageUri}
            imageWidth={session.imageWidth}
            imageHeight={session.imageHeight}
            dots={session.dots}
            selectedIndex={selected?.index ?? null}
            taughtIndices={taughtIndices}
            onSelect={onSelect}
          />

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

      <View style={cs.buttons}>
        <Button label="Back" variant="secondary" onPress={onBack} style={cs.grow} />
        <Button label="Next: Teach" onPress={onNext} disabled={!session || session.dots.length === 0} style={cs.grow} />
      </View>
    </View>
  );
}
