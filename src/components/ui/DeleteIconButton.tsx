import React from "react";
import { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import { Trash2 } from "lucide-react-native";
import { AnimatedPressable } from "./AnimatedPressable";

/** Trash-icon delete button with a press scale/opacity animation. */
export function DeleteIconButton({
  onPress,
  size = 16,
  color = "#ef4444",
  disabled = false,
  hitSlop = 8,
  style,
}: {
  onPress?: (e: GestureResponderEvent) => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}
    >
      <Trash2 size={size} color={color} />
    </AnimatedPressable>
  );
}
