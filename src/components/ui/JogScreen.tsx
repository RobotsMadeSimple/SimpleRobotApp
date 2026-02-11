import { JogButton } from "@/src/components/ui/JogButton";
import { robotClient } from "@/src/services/RobotConnectService";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type JogIntent = {
  axis: "x" | "y" | "z";
  direction: 1 | -1;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 60,
  },
  title: {
    fontSize: 22,
    marginBottom: 24,
  },
  grid: {
    width: 240,
    height: 240,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  cell: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function JogScreen() {
  const jogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeJog, setActiveJog] = useState<JogIntent | null>(null);

  const startJog = (intent: JogIntent) => {
    if (jogIntervalRef.current) return;
    setActiveJog(intent);
    jogIntervalRef.current = setInterval(() => {
      robotClient.sendCommand("JogL", {
        X: intent.axis === "x" ? intent.direction : 0,
        Y: intent.axis === "y" ? intent.direction : 0,
        Z: intent.axis === "z" ? intent.direction : 0,
        Speed: 50,
        Accel: 200,
        Decel: 200,
      });
    }, 20);
  };

  const stopJog = () => {
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }
    setActiveJog(null);
    robotClient.sendCommand("JogStop");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jog Control</Text>

      <View style={styles.grid}>
        <View style={styles.cell} />
        <View style={styles.cell}>
          <JogButton label="X-" onStart={() => startJog({ axis: "x", direction: -1 })} onStop={stopJog} />
        </View>
        <View style={styles.cell}>
          <JogButton label="Z+" onStart={() => startJog({ axis: "z", direction: 1 })} onStop={stopJog} />
        </View>

        <View style={styles.cell}>
          <JogButton label="Y-" onStart={() => startJog({ axis: "y", direction: -1 })} onStop={stopJog} />
        </View>
        <View style={styles.cell} />
        <View style={styles.cell}>
          <JogButton label="Y+" onStart={() => startJog({ axis: "y", direction: 1 })} onStop={stopJog} />
        </View>

        <View style={styles.cell} />
        <View style={styles.cell}>
          <JogButton label="X+" onStart={() => startJog({ axis: "x", direction: 1 })} onStop={stopJog} />
        </View>
        <View style={styles.cell}>
          <JogButton label="Z-" onStart={() => startJog({ axis: "z", direction: -1 })} onStop={stopJog} />
        </View>
      </View>
    </View>
  );
}
