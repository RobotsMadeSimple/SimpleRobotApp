import { JogButton } from "@/src/components/ui/JogButton";
import { colors, radii } from "@/src/components/ui/kit";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

export type JointAxis = "j1" | "j2" | "j3" | "j4";

const JOINTS: { key: JointAxis; label: string }[] = [
  { key: "j1", label: "J1" },
  { key: "j2", label: "J2" },
  { key: "j3", label: "J3" },
  { key: "j4", label: "J4" },
];

type Props = {
  onStart:    (joint: JointAxis, direction: 1 | -1) => void;
  onStopAxis: (joint: JointAxis, direction: 1 | -1) => void;
  /** When set, buttons shrink so a column (two buttons + label) fits this height. */
  maxHeight?: number;
};

/**
 * Joint jog panel — 4 columns of up/down buttons, one per joint.
 * J1 = base rotation, J2 = shoulder, J3 = elbow, J4 = EOAT.
 */
export function JointJogPanel({ onStart, onStopAxis, maxHeight }: Props) {
  const { width } = useWindowDimensions();

  // 4 equal columns with 8 px gaps between them (3 gaps = 24 px). On short screens also cap
  // by height — a column is two buttons plus the axis label.
  const colWidth   = (width - 24 - 24) / 4;
  const buttonSize = Math.min(Math.round(colWidth * 0.9), 80, maxHeight ? (maxHeight - 50) / 2.2 : Infinity);
  const iconSize   = Math.round(buttonSize * 0.45);

  return (
    <View style={styles.grid}>
      {JOINTS.map(({ key, label }) => (
        <View key={key} style={styles.column}>
          {/* Up */}
          <JogButton
            label={`+${label}`}
            icon={<ChevronUp size={iconSize} color={colors.textMuted} />}
            iconPosition="above"
            onStart={() => onStart(key,  1)}
            onStop={() => onStopAxis(key, 1)}
            size={buttonSize}
          />

          {/* Axis label */}
          <View style={styles.labelWrap}>
            <Text style={styles.axisLabel}>{label}</Text>
          </View>

          {/* Down */}
          <JogButton
            label={`-${label}`}
            icon={<ChevronDown size={iconSize} color={colors.textMuted} />}
            iconPosition="below"
            onStart={() => onStart(key, -1)}
            onStop={() => onStopAxis(key, -1)}
            size={buttonSize}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems:     "center",
    width:          "100%",
  },
  column: {
    alignItems: "center",
    gap:        8,
  },
  labelWrap: {
    paddingVertical:   4,
    paddingHorizontal: 10,
    backgroundColor:   colors.background,
    borderRadius:      radii.sm,
  },
  axisLabel: {
    fontSize:   13,
    fontWeight: "700",
    color:      colors.textSecondary,
    letterSpacing: 0.5,
  },
});
