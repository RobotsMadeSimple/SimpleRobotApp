import { Text, View } from "react-native";

import { Card, colors } from "@/src/components/ui/kit";
import { DeleteIconButton } from "@/src/components/ui/DeleteIconButton";
import { CalibrationTaughtDot } from "@/src/models/robotModels";
import { cs } from "./calibrationStyles";
import { Notice } from "./Notice";

const fmt = (n: number) => n.toFixed(2);

/** True when every taught dot lies on one grid line (i, j are integers, so exact). */
export function taughtCollinear(taught: CalibrationTaughtDot[]): boolean {
  if (taught.length < 3) return false;
  const [a, b] = taught;
  const dx = b.i - a.i, dy = b.j - a.j;
  return taught.every(t => dx * (t.j - a.j) - dy * (t.i - a.i) === 0);
}

/** The taught dots with their robot coordinates, per-dot delete, and progress guidance. */
export function TaughtList({
  taught, busy, onUnteach, onSelect,
}: {
  taught: CalibrationTaughtDot[];
  busy: boolean;
  onUnteach: (dotIndex: number) => void;
  onSelect: (dotIndex: number) => void;
}) {
  const n = taught.length;
  const collinear = taughtCollinear(taught);

  return (
    <View style={cs.cardGap}>
      <Card style={cs.cardGap}>
        <View style={cs.rowBetween}>
          <Text style={cs.label}>Taught dots</Text>
          <Text style={cs.caption}>{n} taught</Text>
        </View>
        {n === 0 ? (
          <Text style={cs.body}>None yet. Select a dot, jog the tip onto its center, then Teach.</Text>
        ) : (
          <View>
            <View style={cs.tr}>
              <Text style={[cs.th, { width: 84 }]}>DOT</Text>
              <Text style={[cs.th, cs.grow, { textAlign: "right" }]}>X</Text>
              <Text style={[cs.th, cs.grow, { textAlign: "right" }]}>Y</Text>
              <Text style={[cs.th, cs.grow, { textAlign: "right" }]}>Z</Text>
              <View style={{ width: 24 }} />
            </View>
            {taught.map(t => (
              <View key={t.dotIndex} style={[cs.tr, cs.trBorder]}>
                <Text style={[cs.td, { width: 84, color: colors.accent }]} onPress={() => onSelect(t.dotIndex)}>
                  #{t.dotIndex} ({t.i},{t.j})
                </Text>
                <Text style={[cs.tdRight, cs.grow]}>{fmt(t.robot.x)}</Text>
                <Text style={[cs.tdRight, cs.grow]}>{fmt(t.robot.y)}</Text>
                <Text style={[cs.tdRight, cs.grow]}>{fmt(t.robot.z)}</Text>
                <View style={{ width: 24, alignItems: "flex-end" }}>
                  <DeleteIconButton color={colors.danger} disabled={busy} onPress={() => onUnteach(t.dotIndex)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {collinear ? (
        <Notice tone="warning" title="All taught dots are in a line">
          Teach another dot away from that line — ideally toward the opposite corner of the sheet.
        </Notice>
      ) : (
        <Notice tone={n >= 2 ? "info" : "warning"}>
          {n === 0 ? "Teach at least 2 dots. 3 is recommended, spread out and not in a line."
            : n === 1 ? "1 more dot needed (3 recommended, not in a line)."
            : n === 2 ? "Enough to solve. A third dot away from the line through these two is recommended."
            : `${n} dots taught — ready to solve. Dots far apart give the best rotation estimate.`}
        </Notice>
      )}
    </View>
  );
}
