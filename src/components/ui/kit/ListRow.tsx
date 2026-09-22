import { ChevronRight } from "lucide-react-native";
import { ReactNode } from "react";
import { GestureResponderEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { AnimatedPressable } from "@/src/components/ui/AnimatedPressable";
import { Card } from "./Card";
import { IconTile } from "./IconTile";
import { colors, spacing, type } from "./theme";

type Props = {
  title: string;
  /** Override the title color (accent-colored action rows, selected-item tints). */
  titleColor?: string;
  subtitle?: string;
  /** Max subtitle lines (default 1) — for two-line descriptions. */
  subtitleLines?: number;
  /** Leading icon (usually lucide, size 20). Wrapped in an IconTile. */
  icon?: ReactNode;
  /** IconTile fill behind `icon`. */
  iconColor?: string;
  /** Trailing accessory (StatusPill, switch, delete button). */
  right?: ReactNode;
  /** Show a chevron after `right`. Defaults to true when onPress is set. */
  chevron?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  /** true (default): standalone card row. false: flat row for use inside a Card. */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The standard "icon tile + title/subtitle + accessory" row. As a card
 * (default) it is the nav-card pattern used across IO/Space/Program lists; with
 * card={false} it is a flat row to stack inside one Card with Dividers.
 */
export function ListRow({
  title, titleColor, subtitle, subtitleLines = 1, icon, iconColor, right, chevron,
  onPress, onLongPress, card = true, style,
}: Props) {
  const showChevron = chevron ?? (!!onPress && right == null);

  const content = (
    <>
      {icon != null && <IconTile color={iconColor} size={44}>{icon}</IconTile>}
      <View style={styles.body}>
        <Text style={[type.title, titleColor != null && { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[type.subtitle, styles.sub]} numberOfLines={subtitleLines}>{subtitle}</Text>
        )}
      </View>
      {right}
      {showChevron && <ChevronRight size={18} color={colors.textFaint} />}
    </>
  );

  if (!card) {
    if (onPress || onLongPress) {
      return (
        <AnimatedPressable style={[styles.row, styles.flat, style]} onPress={onPress} onLongPress={onLongPress}>
          {content}
        </AnimatedPressable>
      );
    }
    return <View style={[styles.row, styles.flat, style]}>{content}</View>;
  }

  return (
    <Card onPress={onPress} onLongPress={onLongPress} padded={false} style={style}>
      <View style={[styles.row, styles.padded]}>{content}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", gap: spacing.md },
  padded: { padding: spacing.lg - 2 },
  flat:   { paddingVertical: spacing.sm + 2 },
  body:   { flex: 1 },
  sub:    { marginTop: 2 },
});

