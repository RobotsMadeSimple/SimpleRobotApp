import { Text, View } from "react-native";
import { Save, Sigma } from "lucide-react-native";

import { Button, buttonTextColor, Card, colors, StatusPill } from "@/src/components/ui/kit";
import { CalibrationSolveResult, CalibrationTaughtDot } from "@/src/models/robotModels";
import { CalibrationProblem } from "./calibrationErrors";
import { PITCH_SCALE_WARN_PERCENT, pitchScalePercent, taughtResiduals } from "./calibrationMath";
import { cs } from "./calibrationStyles";
import { Notice } from "./Notice";

type Props = {
  taught: CalibrationTaughtDot[];
  result: CalibrationSolveResult | null;
  saved: boolean;
  solving: boolean;
  problem: CalibrationProblem | null;
  onSolve: (save: boolean) => void;
  onBack: () => void;
  onNext: () => void;
};

const mm = (n: number) => `${n.toFixed(2)} mm`;

/** Step 4 — fit the transform, show its residuals and pitch-scale check, save. */
export function SolveStep({ taught, result, saved, solving, problem, onSolve, onBack, onNext }: Props) {
  const cal = result?.calibration;
  const residuals = cal ? taughtResiduals(cal) : [];
  const scalePct = result ? pitchScalePercent(result.pitchScaleEstimate) : 0;
  const scaleWarn = Math.abs(scalePct) > PITCH_SCALE_WARN_PERCENT;
  // "notEnoughTaught" / "taughtCollinear" explain themselves; send the user back to Teach.
  const teachProblem = problem?.code === "notEnoughTaught" || problem?.code === "taughtCollinear";

  return (
    <View style={cs.step}>
      {problem && (
        <Notice
          tone="danger"
          title={problem.title}
          action={teachProblem ? <Button label="Back to Teach" size="sm" variant="secondary" onPress={onBack} /> : undefined}
        >
          {problem.detail}
        </Notice>
      )}

      {!result && (
        <Card style={cs.cardGap}>
          <Text style={cs.body}>
            Fits the rotation and offset between the sheet and the robot from your {taught.length} taught
            dots, and takes the plane height from their mean Z. Saving makes it this camera's calibration.
          </Text>
          <View style={cs.buttons}>
            <Button
              label={solving ? "Solving…" : "Solve & save"}
              icon={<Save size={16} color={buttonTextColor("primary")} />}
              loading={solving}
              onPress={() => onSolve(true)}
              style={cs.grow}
            />
            <Button
              label="Solve (preview only)"
              variant="secondary"
              icon={<Sigma size={16} color={buttonTextColor("secondary")} />}
              disabled={solving}
              onPress={() => onSolve(false)}
              style={cs.grow}
            />
          </View>
        </Card>
      )}

      {result && cal && (
        <>
          <Card style={cs.cardGap}>
            <View style={cs.rowBetween}>
              <Text style={cs.label}>Residuals</Text>
              <StatusPill tone={saved ? "success" : "warning"} label={saved ? "Saved" : "Not saved"} dot />
            </View>
            <View>
              <View style={cs.tr}>
                <Text style={[cs.th, cs.grow]}>DOT (i, j)</Text>
                <Text style={[cs.th, { textAlign: "right" }]}>ERROR</Text>
              </View>
              {cal.taughtDots.map((d, k) => (
                <View key={`${d.i},${d.j}`} style={[cs.tr, cs.trBorder]}>
                  <Text style={[cs.td, cs.grow]}>({d.i}, {d.j})</Text>
                  <Text style={cs.tdRight}>{residuals[k] !== undefined ? mm(residuals[k]) : "—"}</Text>
                </View>
              ))}
              <View style={[cs.tr, cs.trBorder]}>
                <Text style={[cs.td, cs.grow, { fontWeight: "700" }]}>RMS</Text>
                <Text style={cs.tdRight}>{mm(result.taughtRmsMm)}</Text>
              </View>
              <View style={[cs.tr, cs.trBorder]}>
                <Text style={[cs.td, cs.grow, { fontWeight: "700" }]}>Max</Text>
                <Text style={cs.tdRight}>{mm(result.taughtMaxMm)}</Text>
              </View>
            </View>
          </Card>

          <Card style={cs.cardGap}>
            <View style={cs.rowBetween}>
              <Text style={cs.label}>Pitch scale</Text>
              <Text style={[cs.mono, { color: scaleWarn ? colors.warning : colors.textSecondary }]}>
                {result.pitchScaleEstimate.toFixed(4)} ({scalePct >= 0 ? "+" : ""}{scalePct.toFixed(1)} %)
              </Text>
            </View>
            <Text style={cs.caption}>
              Taught distances vs. the entered pitch. Above 1 means the robot measured the sheet larger than the pitch implies.
            </Text>
            {scaleWarn && (
              <Notice tone="warning" title="Check the dot pitch you entered">
                The taught dots are {Math.abs(scalePct).toFixed(1)} % {scalePct > 0 ? "farther apart" : "closer together"} than
                the pitch says. Measure the printed sheet (printers often scale), or re-teach dots whose tip placement was off.
              </Notice>
            )}
            <View style={cs.buttons}>
              <StatusPill tone="neutral" label={`Plane Z ${cal.planeZ.toFixed(2)} mm`} />
              <StatusPill tone="neutral" label={`Tool ${cal.activeTool || "None"}`} />
              {cal.mirrored && <StatusPill tone="accent" label="Mirrored grid" />}
            </View>
            {cal.mirrored && (
              <Text style={cs.caption}>
                The grid axes were assigned mirrored relative to the robot; the fit used a reflection. This is expected for some sheet orientations.
              </Text>
            )}
          </Card>

          {result.warnings.length > 0 && (
            <Notice tone="warning" title="Warnings">
              <View style={{ gap: 2 }}>
                {result.warnings.map((w, k) => <Text key={k} style={cs.body}>• {w}</Text>)}
              </View>
            </Notice>
          )}

          {!saved && (
            <Button
              label="Save calibration"
              icon={<Save size={16} color={buttonTextColor("primary")} />}
              loading={solving}
              onPress={() => onSolve(true)}
            />
          )}
        </>
      )}

      <View style={cs.buttons}>
        <Button label="Back" variant="secondary" onPress={onBack} style={cs.grow} />
        <Button label="Next: Verify" onPress={onNext} disabled={!result} style={cs.grow} />
      </View>
    </View>
  );
}
