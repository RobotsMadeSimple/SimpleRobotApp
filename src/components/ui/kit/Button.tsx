import { ReactNode } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from "react-native";

import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { colors, radii, spacing } from "./theme";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "dangerSoft"
  | "ghost"
  | "dashed";

type Props = {
  label: string;
  /** Filled blue / white outlined / filled red / soft red ("Restart Controller")
   *  / borderless accent text / dashed-border "add new" CTA. */
  variant?: ButtonVariant;
  /** md (default) for page actions, sm for inline/row actions. */
  size?: "md" | "sm";
  /** Leading icon; pass color matching the variant's text (see `buttonTextColor`). */
  icon?: ReactNode;
  /** Swap content for a spinner and block presses while the action runs. */
  loading?: boolean;
  disabled?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

/** Text/icon color to use inside each button variant (for `icon`). */
export function buttonTextColor(variant: ButtonVariant): string {
  return variant === "primary" || variant === "destructive" ? colors.onAccent
    : variant === "ghost" || variant === "dashed" ? colors.accent
    : variant === "dangerSoft" ? colors.danger
    : colors.textSecondary;
}

/**
 * The standard button. Press scale animation and an inline spinner while its
 * action is in flight (supersedes ActionButton, same loading behavior).
 */
export function Button({
  label, variant = "primary", size = "md", icon,
  loading = false, disabled = false, onPress, style, textStyle,
}: Props) {
  const inactive = disabled || loading;
  const textColor = buttonTextColor(variant);

  return (
    <AnimatedPressable
      style={[
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        style,
        // After `style` so the dim survives a caller background override
        // (e.g. a device-tint save button still reads as disabled).
        inactive && styles.dimmed,
      ]}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon}
          <Text
            style={[styles.label, size === "sm" && styles.labelSm, { color: textColor }, textStyle]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radii.md,
  },
  label:   { fontSize: 14, fontWeight: "600" },
  labelSm: { fontSize: 13 },
  dimmed:  { opacity: 0.5 },
});

const sizeStyles = StyleSheet.create({
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 44 },
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md + 2, minHeight: 36, borderRadius: radii.sm },
});

const variantStyles = StyleSheet.create({
  primary:     { backgroundColor: colors.accent },
  destructive: { backgroundColor: colors.danger },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dangerSoft: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  ghost: { backgroundColor: "transparent" },
  dashed: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accentBorder,
  },
});

