import { useState } from "react";
import { Text, View } from "react-native";
import { Crosshair, Save } from "lucide-react-native";

import JogPad from "@/src/components/ui/JogPad";
import { Button, buttonTextColor, Card, Chip, ChipGroup, FormRow, Input, PositionReadout, RadioRow, SegmentedControl } from "@/src/components/ui/kit";
import { usePaneLayout } from "@/src/components/ui/responsive";
import { cs } from "@/src/components/ui/calibration/calibrationStyles";
import { Notice } from "@/src/components/ui/calibration/Notice";
import { Attention, Requirement, StepFooter } from "@/src/components/ui/calibration/StepRequirements";
import { useJogSpeeds } from "@/src/components/ui/calibration/useJogSpeeds";
import { useRobotStatus } from "@/src/providers/RobotProvider";
import { Tool } from "@/src/models/robotModels";
import { CornerKey, GridFit, GridMethod, methodCorners, Pose, RowSide, sizeProblem } from "./gridFit";
import { cornerLabel, GridPreview, GridSchematic } from "./GridDiagram";

export const METHODS: { value: GridMethod; title: string; subtitle: string }[] = [
  { value: "2pt", title: "2 points — opposite corners",
    subtitle: "Quickest. Square, right-angled cells (a checkerboard). You pick which way the rows run." },
  { value: "3pt", title: "3 points — corner and both edges",
    subtitle: "Any cell size and angle: first cell, end of the first row, start of the last row." },
  { value: "4pt", title: "4 points — all four corners",
    subtitle: "Most accurate: averages out teaching error and shows how far each corner is off." },
];

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "—");

// ── Setup ─────────────────────────────────────────────────────────────────────

export function GridSetupStep({
  name, onName, nameTaken, rows, onRows, cols, onCols, method, onMethod,
  tools, activeTool, onToolChange, onNext,
}: {
  name: string; onName: (v: string) => void; nameTaken: boolean;
  rows: string; onRows: (v: string) => void;
  cols: string; onCols: (v: string) => void;
  method: GridMethod; onMethod: (m: GridMethod) => void;
  tools: Tool[]; activeTool: string; onToolChange: (name: string) => void;
  onNext: () => void;
}) {
  const r = Number(rows), c = Number(cols);
  const sizeBad = sizeProblem(method, r, c);
  const tool = activeTool || "None";
  const requirements: Requirement[] = [
    { key: "name", label: "Name the grid", met: name.trim().length > 0 },
    { key: "unique", label: "Name not used by another grid", met: !nameTaken,
      hint: "Pick another name, or open that grid and re-teach it from there." },
    { key: "size", label: sizeBad ?? `${r} rows × ${c} columns`, met: !sizeBad },
    { key: "tool", label: "A tool is active", met: tool !== "None", optional: true,
      hint: "Without a tool the flange is taught, not the tip that works the grid." },
  ];

  return (
    <View style={cs.step}>
      <Card style={cs.cardGap}>
        <FormRow label="Grid name" hint={`Its base point is saved as "${name.trim() || "<name>"} origin".`}>
          <Input value={name} onChangeText={onName} placeholder="e.g. Parts Tray" autoCapitalize="words" returnKeyType="next" />
        </FormRow>
        <View style={cs.row}>
          <FormRow label="Rows" style={cs.grow}>
            <Input value={rows} onChangeText={v => onRows(v.replace(/[^0-9]/g, ""))} placeholder="8" keyboardType="number-pad" returnKeyType="next" />
          </FormRow>
          <FormRow label="Columns" style={cs.grow}>
            <Input value={cols} onChangeText={v => onCols(v.replace(/[^0-9]/g, ""))} placeholder="8" keyboardType="number-pad" returnKeyType="done" />
          </FormRow>
        </View>
        <Text style={cs.caption}>
          Count cells, not lines: a 4 × 6 tray has 4 rows of 6. Rows run down from the first cell, columns across.
        </Text>
      </Card>

      <Card style={cs.cardGap}>
        <Text style={cs.label}>How to teach it</Text>
        {METHODS.map(m => (
          <RadioRow key={m.value} title={m.title} subtitle={m.subtitle} selected={method === m.value} onPress={() => onMethod(m.value)} />
        ))}
        {!sizeBad && (
          <GridSchematic rows={r} cols={c} corners={methodCorners(method)} size={180} />
        )}
        <Text style={cs.caption}>
          You’ll jog to the centre of each lettered cell, at the height the tool works it, and press Teach.
        </Text>
      </Card>

      <Attention show={tool === "None"} tag="Recommended">
        <Card style={cs.cardGap}>
          <Text style={cs.label}>Active tool</Text>
          <ChipGroup>
            {["None", ...tools.map(t => t.name)].map(n => (
              <Chip key={n} label={n} selected={tool === n} onPress={() => onToolChange(n)} />
            ))}
          </ChipGroup>
          {tool === "None" && (
            <Notice tone="warning" title="No tool selected">
              The flange position will be taught, not the tool tip. Pick the tool that works this grid.
            </Notice>
          )}
        </Card>
      </Attention>

      <StepFooter requirements={requirements} nextLabel="Next: Teach corner A" onNext={onNext} />
    </View>
  );
}

// ── Teach one corner ──────────────────────────────────────────────────────────

// Fine steps for landing on the cell centre, Slow/Normal for getting there (as the calibration wizard).
const SPEEDS = ["0.1mm", "1mm", "10mm", "Slow", "Normal"];

export function GridTeachCornerStep({
  corner, index, total, rows, cols, method, taught, onTeach, onBack, onNext, nextLabel,
}: {
  corner: CornerKey; index: number; total: number;
  rows: number; cols: number; method: GridMethod;
  taught: Partial<Record<CornerKey, Pose>>;
  onTeach: (corner: CornerKey, pose: Pose) => void;
  onBack: () => void; onNext: () => void; nextLabel: string;
}) {
  const isWide = usePaneLayout() === "desktop";
  const status = useRobotStatus();
  const jogSpeeds = useJogSpeeds();
  const [speed, setSpeed] = useState("1mm");
  const tool = status.activeTool || "None";
  const mine = taught[corner];

  const teach = () => onTeach(corner, { x: status.x, y: status.y, z: status.z, rx: status.rx, ry: status.ry, rz: status.rz });

  const requirements: Requirement[] = [
    { key: "taught", label: `Teach corner ${corner}`, met: !!mine,
      hint: "Jog the tool tip to the centre of the highlighted cell, then press Teach." },
  ];

  const targetPane = (
    <View style={[cs.pane, isWide && cs.paneWide]}>
      <Card style={cs.cardGap}>
        <Text style={cs.label}>Corner {index + 1} of {total}</Text>
        <Text style={cs.strong}>{cornerLabel(corner, rows, cols)}</Text>
        <GridSchematic rows={rows} cols={cols} corners={methodCorners(method)} active={corner} taught={taught} size={isWide ? 220 : 180} />
        <Attention show={!mine} tag="Jog there, then Teach">
          <View style={cs.buttons}>
            <Button
              label={mine ? "Re-teach" : "Teach"}
              icon={<Crosshair size={16} color={buttonTextColor("primary")} />}
              onPress={teach}
              style={cs.grow}
            />
          </View>
        </Attention>
        {mine && (
          <Text style={[cs.mono, { textAlign: "center" }]}>
            Taught  X {fmt(mine.x)}  Y {fmt(mine.y)}  Z {fmt(mine.z)}
          </Text>
        )}
      </Card>
    </View>
  );

  const jogPane = (
    <View style={[cs.pane, isWide && cs.paneWide]}>
      <Card style={cs.cardGap}>
        <View style={cs.rowBetween}>
          <Text style={cs.label}>Tool</Text>
          <Text style={cs.strong}>{tool}</Text>
        </View>
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
      <View style={[cs.panes, isWide && cs.panesWide]}>
        {targetPane}
        {jogPane}
      </View>
      <StepFooter requirements={requirements} nextLabel={nextLabel} onBack={onBack} onNext={onNext} />
    </View>
  );
}

// ── Review + save ─────────────────────────────────────────────────────────────

export function GridReviewStep({
  name, rows, cols, method, taught, fit, fitError, rowSide, onRowSide,
  overwritesPoint, saving, saved, saveError, onSave, onBack, onDone,
}: {
  name: string; rows: number; cols: number; method: GridMethod;
  taught: Partial<Record<CornerKey, Pose>>;
  fit: GridFit | null; fitError: string | null;
  rowSide: RowSide; onRowSide: (s: RowSide) => void;
  overwritesPoint: boolean;
  saving: boolean; saved: boolean; saveError: string | null;
  onSave: () => void; onBack: () => void; onDone: () => void;
}) {
  const squareOff = fit ? Math.abs(fit.axisAngleDeg - 90) : 0;
  const pitchDiff = fit ? Math.abs(fit.rowPitch - fit.colPitch) : 0;

  const requirements: Requirement[] = [
    { key: "fit", label: fitError ?? "Grid fits the taught corners", met: !!fit && !fitError },
    ...(method === "4pt" && fit?.maxResidualMm != null
      ? [{ key: "resid", label: `Corners within 1 mm of the fit (worst ${fmt(fit.maxResidualMm)} mm)`, met: fit.maxResidualMm <= 1, optional: true,
           hint: "A corner is off — re-teach it, or the grid isn’t a flat parallelogram." }]
      : []),
    ...(method !== "2pt" && fit && rows > 1 && cols > 1
      ? [{ key: "square", label: `Rows and columns at right angles (${fmt(fit.axisAngleDeg, 1)}°)`, met: squareOff <= 1, optional: true,
           hint: "More than 1° out of square — fine for a skewed layout, otherwise re-teach a corner." }]
      : []),
  ];

  if (saved) {
    return (
      <View style={cs.step}>
        <Notice tone="info" title={`Saved "${name}"`}>
          {rows} × {cols} grid, base point “{name} origin”. Pick it in a Move step’s Grid target, by row and column.
        </Notice>
        <Button label="Done" onPress={onDone} />
      </View>
    );
  }

  return (
    <View style={cs.step}>
      {fit && (
        <Card style={cs.cardGap}>
          <Text style={cs.label}>Where the cells land (top view)</Text>
          <GridPreview fit={fit} rows={rows} cols={cols} taught={taught} />
          {method === "2pt" && (
            <FormRow label="Row 2 is on the… (looking along the first row from cell 1,1)">
              <SegmentedControl
                options={[{ label: "Left", value: "left" }, { label: "Right", value: "right" }]}
                value={rowSide}
                onChange={v => onRowSide(v as RowSide)}
              />
            </FormRow>
          )}
          {method === "2pt" && (
            <Text style={cs.caption}>
              Two corners can’t tell a grid from its mirror image — check the orange first row runs from A the way
              your real first row does. Any height change is spread evenly along the diagonal.
            </Text>
          )}
        </Card>
      )}

      {fit && (
        <Card style={cs.cardGap}>
          <Text style={cs.label}>Fit</Text>
          <Stat label="Row spacing" value={`${fmt(fit.rowPitch)} mm`} />
          <Stat label="Column spacing" value={`${fmt(fit.colPitch)} mm`} />
          {method !== "2pt" && pitchDiff > 0.5 && rows > 1 && cols > 1 && (
            <Text style={cs.caption}>Rows and columns are spaced differently ({fmt(pitchDiff)} mm apart).</Text>
          )}
          <Stat label="Row ↔ column angle" value={`${fmt(fit.axisAngleDeg, 2)}°`} />
          <Stat label="First row direction (from +X)" value={`${fmt(fit.rotationDeg, 2)}°`} />
          <Stat label="Height change across the grid" value={`${fmt(fit.zSpanMm)} mm`} />
          {fit.residuals && (["A", "B", "C", "D"] as CornerKey[]).map(k => (
            <Stat key={k} label={`Corner ${k} off the fit`} value={`${fmt(fit.residuals![k] ?? NaN)} mm`} />
          ))}
          <Text style={cs.caption}>
            Saved as base point “{name} origin” (cell 1,1) plus a row step and a column step in robot X/Y/Z,
            so a Move to row r, column c lands at origin + r·row step + c·column step.
          </Text>
        </Card>
      )}

      {overwritesPoint && (
        <Notice tone="warning" title={`Replaces the point "${name} origin"`}>
          A point with that name already exists; saving moves it to this grid’s first cell.
        </Notice>
      )}
      {saveError && <Notice tone="danger" title="Couldn’t save">{saveError}</Notice>}

      <StepFooter
        requirements={requirements}
        nextLabel={saving ? "Saving…" : "Save grid"}
        nextIcon={<Save size={16} color={buttonTextColor("primary")} />}
        busy={saving}
        onBack={onBack}
        onNext={onSave}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={cs.rowBetween}>
      <Text style={cs.body}>{label}</Text>
      <Text style={cs.mono}>{value}</Text>
    </View>
  );
}
