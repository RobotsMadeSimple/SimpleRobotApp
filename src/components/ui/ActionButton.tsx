import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleProp,
  Text,
  TextStyle,
  ViewStyle,
} from "react-native";
import { AnimatedPressable } from "./AnimatedPressable";

/**
 * Pressable action button with a press scale/opacity animation and an inline
 * spinner while its action is in flight. Pass `loading` (controlled by the
 * parent) to swap the label/icon for an ActivityIndicator and block presses.
 */
export function ActionButton({
  label,
  icon,
  loading = false,
  disabled = false,
  onPress,
  style,
  textStyle,
  spinnerColor = "#fff",
}: {
  label: string;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  spinnerColor?: string;
}) {
  const inactive = disabled || loading;
  return (
    <AnimatedPressable
      style={style}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        <>
          {icon}
          <Text style={textStyle}>{label}</Text>
        </>
      )}
    </AnimatedPressable>
  );
}
