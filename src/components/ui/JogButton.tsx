import { colors, radii } from "@/src/components/ui/kit";
import { ReactNode, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type IconPosition = "above" | "below" | "left" | "right";

type Props = {
  label: string;
  icon: ReactNode;
  iconPosition: IconPosition;
  onStart: () => void;
  onStop: () => void;
  size?: number;
  /** Rest border + text colour (default neutral grey). */
  color?: string;
  /** Border colour while pressed (default blue). */
  activeColor?: string;
  /** Background colour while pressed (default light blue). */
  activeBg?: string;
  /** Background colour at rest (default transparent). */
  restBg?: string;
  /** Border colour at rest, when it should differ from `color` (e.g. a tonal button). */
  restBorder?: string;
  /** Stretch to the row's width (flex: 1) instead of a `size` square; `size` stays the height. */
  fill?: boolean;
  /** Label font size (default scales with `size`). */
  labelSize?: number;
};

export function JogButton({
  label,
  icon,
  iconPosition,
  onStart,
  onStop,
  size = 70,
  color = colors.textMuted,
  activeColor = colors.accent,
  activeBg = colors.accentSoft,
  restBg = "transparent",
  restBorder,
  fill = false,
  labelSize,
}: Props) {
  const borderRest = restBorder ?? color;
  const isRow     = iconPosition === "left" || iconPosition === "right";
  const isReverse = iconPosition === "below" || iconPosition === "right";
  const fontSize  = labelSize ?? Math.round(size * 0.24);

  const pressed = useSharedValue(0);

  // A jog starts on touch-down and must stop on release. If the button unmounts
  // while still held — e.g. navigating off the screen mid-jog — the gesture is
  // torn down WITHOUT onFinalize firing, so onStop never runs and a continuous
  // jog (StartAuxContinuous / continuous move) would run forever. Track the held
  // state and fire onStop on unmount, but only if still held, as a backstop.
  // A ref mirror of the state lets the unmount cleanup see the latest value, and
  // a ref keeps onStop current so the backstop calls the right handler.
  const [held, setHeld] = useState(false);
  const heldRef   = useRef(false);
  const onStopRef = useRef(onStop);
  useEffect(() => { heldRef.current = held; }, [held]);
  useEffect(() => { onStopRef.current = onStop; });

  useEffect(() => () => {
    // Unmounted while still held: send the stop the released gesture never did.
    if (heldRef.current) {
      heldRef.current = false;
      onStopRef.current();
    }
  }, []);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      pressed.value = withTiming(1, { duration: 60 });
      runOnJS(setHeld)(true);
      runOnJS(onStart)();
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 180 });
      runOnJS(setHeld)(false);
      runOnJS(onStop)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pressed.value, [0, 1], [restBg, activeBg]),
    borderColor:     interpolateColor(pressed.value, [0, 1], [borderRest, activeColor]),
    transform: [{ scale: 1 - pressed.value * 0.06 }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.button, fill ? { flex: 1, height: size } : { width: size, height: size }, animatedStyle]}>
        <View
          style={[
            styles.content,
            { flexDirection: isRow ? "row" : "column" },
            isReverse && { flexDirection: isRow ? "row-reverse" : "column-reverse" },
          ]}
        >
          {icon}
          <Text style={[styles.text, { fontSize, color }]}>{label}</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: colors.textMuted,
    fontWeight: "600",
  },
});
