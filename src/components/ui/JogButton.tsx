import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type IconPosition = "above" | "below" | "left" | "right";

type Props = {
  label: string;
  icon: ReactNode;
  iconPosition: IconPosition;
  onStart: () => void;
  onStop: () => void;
};

export function JogButton({
  label,
  icon,
  iconPosition,
  onStart,
  onStop,
}: Props) {
  const isRow = iconPosition === "left" || iconPosition === "right";
  const isReverse =
    iconPosition === "below" || iconPosition === "right";

  return (
    <Pressable
      onPressIn={onStart}
      onPressOut={onStop}
      style={styles.button}
    >
      <View
        style={[
          styles.content,
          { flexDirection: isRow ? "row" : "column" },
          isReverse && { flexDirection: isRow ? "row-reverse" : "column-reverse" },
        ]}
      >
        {icon}
        <Text style={styles.text}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 70,
    height: 70,
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
    fontSize: 18,
    fontWeight: "600",
  },
});

