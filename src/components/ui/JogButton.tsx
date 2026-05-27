import { ReactNode } from "react";
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
};

export function JogButton({
  label,
  icon,
  iconPosition,
  onStart,
  onStop,
  size = 70,
}: Props) {
  const isRow     = iconPosition === "left" || iconPosition === "right";
  const isReverse = iconPosition === "below" || iconPosition === "right";
  const fontSize  = Math.round(size * 0.24);

  const pressed = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onBegin(() => {
      pressed.value = withTiming(1, { duration: 60 });
      runOnJS(onStart)();
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 180 });
      runOnJS(onStop)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pressed.value, [0, 1], ["transparent", "#dbeafe"]),
    borderColor:     interpolateColor(pressed.value, [0, 1], ["#666666",     "#2563eb"]),
    transform: [{ scale: 1 - pressed.value * 0.06 }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.button, { width: size, height: size }, animatedStyle]}>
        <View
          style={[
            styles.content,
            { flexDirection: isRow ? "row" : "column" },
            isReverse && { flexDirection: isRow ? "row-reverse" : "column-reverse" },
          ]}
        >
          {icon}
          <Text style={[styles.text, { fontSize }]}>{label}</Text>
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
    borderRadius: 8,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#666",
    fontWeight: "600",
  },
});
