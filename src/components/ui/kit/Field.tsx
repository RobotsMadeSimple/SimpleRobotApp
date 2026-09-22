import { X } from "lucide-react-native";
import { ReactNode, useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { colors, radii, spacing, type } from "./theme";

// ── Input ─────────────────────────────────────────────────────────────────────

type InputProps = TextInputProps & {
  /** Leading icon inside the well (lucide, size 16, colors.textFaint). */
  icon?: ReactNode;
  /** Show a trailing ✕ that clears the value (needs `value` + `onChangeText`). */
  clearable?: boolean;
};

/**
 * Standard text input: muted well, rounded, accent border on focus.
 * `style` accepts TextStyle (e.g. `type.mono`); with `icon`/`clearable` the
 * well styles move to a wrapper and `style` still styles the text itself.
 */
export function Input({ style, icon, clearable, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  const focusProps = {
    onFocus: (e: any) => { setFocused(true); onFocus?.(e); },
    onBlur:  (e: any) => { setFocused(false); onBlur?.(e); },
  };

  if (icon == null && !clearable) {
    return (
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        {...focusProps}
        style={[styles.input, focused && styles.inputFocused, style]}
      />
    );
  }

  const showClear = !!clearable && !!props.value;
  return (
    <View style={[styles.input, styles.adornedWell, focused && styles.inputFocused]}>
      {icon}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        {...focusProps}
        style={[styles.adornedInput, style]}
      />
      {showClear && (
        <Pressable
          onPress={() => props.onChangeText?.("")}
          hitSlop={8}
          accessibilityLabel="Clear text"
        >
          <X size={16} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

// ── FormRow ───────────────────────────────────────────────────────────────────

type FormRowProps = {
  label: string;
  /** Helper or unit text under the control. */
  hint?: string;
  /** The control: an Input, switch, stepper, etc. */
  children: ReactNode;
  /** true: label left, control right (switches/steppers). false (default): stacked. */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Labeled form field wrapper used on config/settings screens. */
export function FormRow({ label, hint, children, inline = false, style }: FormRowProps) {
  if (inline) {
    return (
      <View style={[styles.inlineRow, style]}>
        <View style={styles.inlineLabelBlock}>
          <Text style={styles.label}>{label}</Text>
          {!!hint && <Text style={[type.caption, styles.hint]}>{hint}</Text>}
        </View>
        {children}
      </View>
    );
  }
  return (
    <View style={style}>
      <Text style={[styles.label, styles.stackedLabel]}>{label}</Text>
      {children}
      {!!hint && <Text style={[type.caption, styles.hint]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
    fontSize: 14,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.accentBorder, backgroundColor: colors.surface },
  /** Wrapper form when icon/clearable adornments are present. */
  adornedWell: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 0,
  },
  adornedInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },

  label:        { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  stackedLabel: { marginBottom: spacing.xs + 2 },
  hint:         { marginTop: spacing.xs },

  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  inlineLabelBlock: { flex: 1 },
});

