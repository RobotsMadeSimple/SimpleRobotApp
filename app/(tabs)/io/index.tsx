import { NotConnectedOverlay } from "@/src/components/ui/NotConnectedOverlay";
import { useSelectedRobot } from "@/src/providers/RobotProvider";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

function InputIndicator({ label, value }: { label: string; value: boolean }) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.indicator,
          value ? styles.indicatorOn : styles.indicatorOff
        ]}
      />

      <Text style={styles.value}>{value ? "ON" : "OFF"}</Text>
    </View>
  );
}

export default function IoPage() {
  const robot = useSelectedRobot();
  const status = robot?.status;

  return (
    <View style={styles.container}>
      <NotConnectedOverlay />

      {!robot ? (
        <View style={styles.center}>
          <Text style={styles.noRobot}>No robot selected</Text>
        </View>
      ) : (
        <>
          <Text style={styles.title}>Robot Inputs</Text>
          <InputIndicator label="Input 1" value={status!.input1} />
          <InputIndicator label="Input 2" value={status!.input2} />
          <InputIndicator label="Input 3" value={status!.input3} />
          <InputIndicator label="Input 4" value={status!.input4} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },

  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16
  },

  label: {
    width: 80,
    fontSize: 16
  },

  indicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 12
  },

  indicatorOn: {
    backgroundColor: "#22c55e"
  },

  indicatorOff: {
    backgroundColor: "#444"
  },

  value: {
    fontSize: 16
  },

  noRobot: {
    fontSize: 16,
    color: "#888"
  }
});