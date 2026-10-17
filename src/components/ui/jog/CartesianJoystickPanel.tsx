import { JogButton } from "@/src/components/ui/JogButton";
import { CartesianAxis } from "@/src/components/ui/jog/CartesianJogPanel";
import { JogJoystick } from "@/src/components/ui/jog/JogJoystick";
import { colors } from "@/src/components/ui/kit";
import { RedoDot, UndoDot } from "lucide-react-native";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

type Props = {
  onJoyChange:   (vx: number, vy: number) => void;
  onJoyRelease:  () => void;
  /** Vertical Z stick: vy = screen-down (+). */
  onJoyZChange:  (vy: number) => void;
  onJoyZRelease: () => void;
  onStart:       (axis: CartesianAxis, direction: 1 | -1) => void;   // RZ bumpers
  onStopAxis:    (axis: CartesianAxis, direction: 1 | -1) => void;
  maxHeight?:    number;
};

/**
 * Joystick jog layout: an analog X/Y thumbstick with RZ "bumpers" at its top corners and a
 * vertical Z thumbstick beside it (up = +Z). The Z stick and the main stick are the same height
 * and vertically aligned. Everything feeds the same multi-touch path, so Z/RZ move at the same
 * time as X/Y.
 */
export function CartesianJoystickPanel({
  onJoyChange, onJoyRelease, onJoyZChange, onJoyZRelease, onStart, onStopAxis, maxHeight,
}: Props) {
  const { width } = useWindowDimensions();

  const cellSize = Math.min((width - 24) / 4.5, 90);
  let zWidth   = Math.round(cellSize * 0.95);
  let bumpSize = Math.round(cellSize * 0.63);
  let joySize  = Math.min(width - zWidth - 104, 220);

  // On short screens scale the whole panel (stick + bumpers + Z) down to fit the pad area.
  const naturalH = bumpSize + 8 + joySize;
  if (maxHeight && naturalH > maxHeight) {
    const f = maxHeight / naturalH;
    joySize  = Math.round(joySize * f);
    zWidth   = Math.round(zWidth * f);
    bumpSize = Math.round(bumpSize * f);
  }
  const bumpIcon = Math.round(bumpSize * 0.42);

  const bumper = (label: string, icon: React.ReactNode, dir: 1 | -1) => (
    <JogButton
      label={label}
      icon={icon}
      iconPosition="below"
      onStart={() => onStart("rz", dir)}
      onStop={() => onStopAxis("rz", dir)}
      size={bumpSize}
    />
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.joyCol}>
        <View style={[styles.bumperRow, { width: joySize }]}>
          {bumper("+RZ", <UndoDot size={bumpIcon} color={colors.textMuted} />,  1)}
          {bumper("-RZ", <RedoDot size={bumpIcon} color={colors.textMuted} />, -1)}
        </View>
        <JogJoystick
          size={joySize}
          hints={{ top: "-X", bottom: "+X", left: "-Y", right: "+Y" }}
          onChange={onJoyChange}
          onRelease={onJoyRelease}
        />
      </View>

      <View style={styles.zCol}>
        <View style={{ height: bumpSize, justifyContent: "center" }}>
          <Text style={styles.zLabel}>Z</Text>
        </View>
        <JogJoystick
          axis="y"
          width={zWidth}
          height={joySize}
          hints={{ top: "+Z", bottom: "-Z" }}
          onChange={(_vx, vy) => onJoyZChange(vy)}
          onRelease={onJoyZRelease}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 48 },
  joyCol:    { alignItems: "center", gap: 8 },
  bumperRow: { flexDirection: "row", justifyContent: "space-between" },
  zCol:      { alignItems: "center", gap: 8 },
  zLabel:    { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.5 },
});
