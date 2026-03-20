import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
  const isRow = iconPosition === "left" || iconPosition === "right";
  const isReverse =
    iconPosition === "below" || iconPosition === "right";

  const fontSize = Math.round(size * 0.24);

  return (
    <Pressable
      onPressIn={onStart}
      onPressOut={onStop}
      style={[styles.button, { width: size, height: size }]}
    >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#666",
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
