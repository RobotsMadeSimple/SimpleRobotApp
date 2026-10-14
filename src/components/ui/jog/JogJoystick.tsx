import { colors } from "@/src/components/ui/kit";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Below this fraction of full travel the stick reads as centered, so a resting thumb or a
// tiny wobble doesn't creep the robot.
const DEADZONE = 0.08;

type Props = {
  /** Square size for a 2-axis stick; or give width/height (e.g. a tall vertical stick). */
  size?: number;
  width?: number;
  height?: number;
  /** "both" = X/Y disc; "y" = vertical-only (thumb moves up/down, vx always 0). */
  axis?: "both" | "y";
  /** Faint edge labels. */
  hints?: { top?: string; bottom?: string; left?: string; right?: string };
  /** Unit vector while held: vx = right (+), vy = down (+), magnitude 0..1 (speed signal). */
  onChange: (vx: number, vy: number) => void;
  onRelease: () => void;
};

/**
 * Analog thumbstick. The thumb follows the finger; its offset from center, normalized to the
 * usable travel, is an analog vector (direction + magnitude). Works as a 2-axis disc or, with
 * axis="y", a vertical-only stick (for a single axis like Z).
 */
export function JogJoystick({ size, width, height, axis = "both", hints, onChange, onRelease }: Props) {
  const w = width ?? size ?? 200;
  const h = height ?? size ?? 200;
  const vertical  = axis === "y";
  const thumbSize = vertical ? Math.round(w * 0.82) : Math.round(Math.min(w, h) * 0.42);
  const cx = w / 2, cy = h / 2;
  const maxX = vertical ? 0 : w / 2 - thumbSize / 2;
  const maxY = h / 2 - thumbSize / 2;
  const maxR = Math.min(maxX || maxY, maxY);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const move = (px: number, py: number) => {
    "worklet";
    let dx = maxX ? Math.max(-maxX, Math.min(maxX, px - cx)) : 0;
    let dy = Math.max(-maxY, Math.min(maxY, py - cy));
    if (!vertical) {
      const mag = Math.hypot(dx, dy);
      if (mag > maxR && mag > 0) { dx = (dx / mag) * maxR; dy = (dy / mag) * maxR; }
    }
    tx.value = dx;
    ty.value = dy;

    let vx = maxX ? dx / maxX : 0;
    let vy = dy / maxY;
    if (Math.hypot(vx, vy) < DEADZONE) { vx = 0; vy = 0; }
    runOnJS(onChange)(vx, vy);
  };

  const pan = Gesture.Pan()
    .onBegin(e => move(e.x, e.y))
    .onUpdate(e => move(e.x, e.y))
    .onFinalize(() => {
      tx.value = withTiming(0, { duration: 140 });
      ty.value = withTiming(0, { duration: 140 });
      runOnJS(onRelease)();
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.base, { width: w, height: h, borderRadius: Math.min(w, h) / 2 }]}>
        {hints?.top    && <Text style={[styles.hint, styles.hintTop]}>{hints.top}</Text>}
        {hints?.bottom && <Text style={[styles.hint, styles.hintBottom]}>{hints.bottom}</Text>}
        {hints?.left   && <Text style={[styles.hint, styles.hintLeft]}>{hints.left}</Text>}
        {hints?.right  && <Text style={[styles.hint, styles.hintRight]}>{hints.right}</Text>}
        <View style={styles.crosshair} />
        <Animated.View
          style={[
            styles.thumb,
            { width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2 },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  crosshair: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  thumb: {
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  hint: {
    position: "absolute",
    fontSize: 11,
    fontWeight: "600",
    color: colors.textFaint,
  },
  hintTop:    { top: 6 },
  hintBottom: { bottom: 6 },
  hintLeft:   { left: 8 },
  hintRight:  { right: 8 },
});
