import { Pressable, Text, StyleSheet } from "react-native";

type Props = {
    label: string;
    onStart: () => void;
    onStop: () => void;
};

export function JogButton({ label, onStart, onStop }: Props) {
    return (
        <Pressable
            onPressIn={onStart}
            onPressOut={onStop}
            style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
            ]}
        >
            <Text style={styles.text}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    button: {
        width: 80,
        height: 80,
        backgroundColor: "#333",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
    },
    pressed: {
        backgroundColor: "#555",
    },
    text: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "600",
    },
});
