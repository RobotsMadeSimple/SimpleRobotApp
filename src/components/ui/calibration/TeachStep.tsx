import { useState } from "react";
import { Text, View } from "react-native";
import { Crosshair, Undo2 } from "lucide-react-native";

import JogPad from "@/src/components/ui/JogPad";
import { Button, buttonTextColor, Card, Chip, ChipGroup, Input, PositionReadout } from "@/src/components/ui/kit";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { CalibrationDot, CalibrationSession, CalibrationTaughtDot } from "@/src/models/robotModels";
import { CalibrationProblem } from "./calibrationErrors";
import { cs } from "./calibrationStyles";
import { dotLabel } from "./DetectStep";
import { DotImage } from "./DotImage";
import { Notice } from "./Notice";
import { TaughtList } from "./TaughtList";
import { useJogSpeeds } from "./useJogSpeeds";

// Compact version of the jog page's speed chips: fine steps for landing on a dot,
// Slow/Normal for getting there.
const SPEEDS = ["0.1mm", "1mm", "10mm", "Slow", "Normal"];

type Props = {
  session: CalibrationSession;
  imageUri: string | null;
  selected: CalibrationDot | null;
  onSelect: (dot: CalibrationDot) => void;
  taught: CalibrationTaughtDot[];
  busy: boolean;
  problem: CalibrationProblem | null;
  onTeach: (dotIndex: number) => void;
  onUnteach: (dotIndex: number) => void;
  onBack: () => void;
  onNext: () => void;
};

/** Step 3 — select a dot, jog the tip onto it, Teach; repeat for 2–3 dots. */
export function TeachStep({
  session, imageUri, selected, onSelect, taught, busy, problem, onTeach, onUnteach, onBack, onNext,
}: Props) {
  // Side-by-side only on desktop widths: the jog pad is ~400 px wide and would not fit a split-screen pane.
  const isWide = usePaneLayout() === "desktop";
  const status = useRobotStatus();
  const jogSpeeds = useJogSpeeds();
  const [speed, setSpeed] = useState("1mm");
  const [pick, setPick]   = useState("");

  const taughtIndices = new Set(taught.map(t => t.dotIndex));
  const selectedTaught = selected ? taughtIndices.has(selected.index) : false;
  const tool = status.activeTool || "None";

  const pickByNumber = (text: string) => {
    setPick(text);
    const n = Number(text.trim());
    const dot = text.trim() !== "" && Number.isInteger(n) ? session.dots.find(d => d.index === n) : undefined;
    if (dot) onSelect(dot);
  };
  const selectByIndex = (dotIndex: number) => {
    const dot = session.dots.find(d => d.index === dotIndex);
    if (dot) onSelect(dot);
  };

  const taughtList = <TaughtList taught={taught} busy={busy} onUnteach={onUnteach} onSelect={selectByIndex} />;

  // Phones: image + Teach, then the jog pad, then the list. Desktop: list under the image, jog pad beside.
  const imagePane = (
    <View style={[cs.pane, isWide && cs.paneWide]}>
      <DotImage
        uri={imageUri}
        imageWidth={session.imageWidth}
        imageHeight={session.imageHeight}
        dots={session.dots}
        selectedIndex={selected?.index ?? null}
        taughtIndices={taughtIndices}
        onSelect={onSelect}
        maxHeight={isWide ? 380 : 260}
      />
      <Card style={cs.cardGap}>
        <View style={cs.rowBetween}>
          <View style={cs.grow}>
            <Text style={cs.label}>Selected</Text>
            <Text style={cs.strong}>{selected ? dotLabel(selected) : "Tap a dot on the image"}</Text>
          </View>
          <Input
            value={pick}
            onChangeText={pickByNumber}
            placeholder="Dot #"
            keyboardType="number-pad"
            returnKeyType="done"
            style={{ width: 84 }}
          />
        </View>
        <View style={cs.buttons}>
          <Button
            label={selectedTaught ? "Re-teach" : "Teach"}
            icon={<Crosshair size={16} color={buttonTextColor("primary")} />}
            disabled={!selected}
            loading={busy}
            onPress={() => selected && onTeach(selected.index)}
            style={cs.grow}
          />
          {selectedTaught && (
            <Button
              label="Unteach"
              variant="dangerSoft"
              icon={<Undo2 size={16} color={buttonTextColor("dangerSoft")} />}
              disabled={busy}
              onPress={() => selected && onUnteach(selected.index)}
              style={cs.grow}
            />
          )}
        </View>
      </Card>
      {isWide && taughtList}
    </View>
  );

  const jogPane = (
    <View style={[cs.pane, isWide && cs.paneWide]}>
      <Card style={cs.cardGap}>
        <View style={cs.rowBetween}>
          <Text style={cs.label}>Tool</Text>
          <Text style={cs.strong}>{tool}</Text>
        </View>
        {tool === "None" && (
          <Notice tone="warning" title="No active tool">
            The flange position is being taught, not a tool tip. Go back to Setup and pick the tool that touches the sheet.
          </Notice>
        )}
        <PositionReadout
          card={false}
          axes={[
            { label: "X", value: status.x, unit: "mm" },
            { label: "Y", value: status.y, unit: "mm" },
            { label: "Z", value: status.z, unit: "mm" },
          ]}
        />
      </Card>
      <Card style={[cs.cardGap, { alignItems: "center" }]}>
        <ChipGroup>
          {SPEEDS.map(s => <Chip key={s} label={s} selected={speed === s} onPress={() => setSpeed(s)} />)}
        </ChipGroup>
        <JogPad jogMode="XYZ" selectedSpeed={speed} speedOverrides={jogSpeeds} />
        <Text style={cs.caption}>Steps move once per tap; Slow/Normal jog while held.</Text>
      </Card>
    </View>
  );

  return (
    <View style={cs.step}>
      {problem && <Notice tone="danger" title={problem.title}>{problem.detail}</Notice>}
      <View style={[cs.panes, isWide && cs.panesWide]}>
        {imagePane}
        {jogPane}
        {!isWide && taughtList}
      </View>
      <View style={cs.buttons}>
        <Button label="Back" variant="secondary" onPress={onBack} style={cs.grow} />
        <Button label="Next: Solve" onPress={onNext} disabled={taught.length < 2} style={cs.grow} />
      </View>
    </View>
  );
}
