import { JogButton } from "@/src/components/ui/JogButton";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp
} from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

type JogIntent = {
  axis: "x" | "y" | "z";
  direction: 1 | -1;
};

const cellSize = 80;

const styles = StyleSheet.create({
  grid: {
    width: cellSize*4.5, // 80 * 4 + spacing
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  cell: {
    width: cellSize,
    height: cellSize,
    alignItems: "center",
    justifyContent: "center",
  },
  narrowCell: {
    width: cellSize/2,
    height: cellSize,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function JogPad() {
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
  <View style={styles.grid}>
    {/* Row 1 */}
    <View style={styles.cell} />

    {/* X- */}
    <View style={styles.cell}>
      <JogButton
        label="X-"
        icon={<ChevronUp size={30} color="#666" />}
        iconPosition="above"
        onStart={() => startJog({ axis: "x", direction: -1 })}
        onStop={stopJog}
      />
    </View>

    <View style={styles.cell} />
    <View style={styles.narrowCell} />

    {/* Z+ (moved right) */}
    <View style={styles.cell}>
      <JogButton
        label="Z+"
        icon={<ChevronUp size={30} color="#666" />}
        iconPosition="above"
        onStart={() => startJog({ axis: "z", direction: 1 })}
        onStop={stopJog}
      />
    </View>

    {/* Row 2 */}
    <View style={styles.cell}>
      <JogButton
        label="Y-"
        icon={<ChevronLeft size={30} color="#666" />}
        iconPosition="left"
        onStart={() => startJog({ axis: "y", direction: -1 })}
        onStop={stopJog}
      />
    </View>

    <View style={styles.cell} />
    <View style={styles.cell}>
      <JogButton
        label="Y+"
        icon={<ChevronRight size={30} color="#666" />}
        iconPosition="right"
        onStart={() => startJog({ axis: "y", direction: 1 })}
        onStop={stopJog}
      />
    </View>
    <View style={styles.narrowCell} />
    <View style={styles.cell} />

    {/* Row 3 */}
    <View style={styles.cell} />

    {/* X+ */}
    <View style={styles.cell}>
      <JogButton
        label="X+"
        icon={<ChevronDown size={30} color="#666" />}
        iconPosition="below"
        onStart={() => startJog({ axis: "x", direction: 1 })}
        onStop={stopJog}
      />
    </View>

    <View style={styles.cell} />
    <View style={styles.narrowCell} />

    {/* Z- (moved right) */}
    <View style={styles.cell}>
      <JogButton
        label="Z-"
        icon={<ChevronDown size={30} color="#666" />}
        iconPosition="below"
        onStart={() => startJog({ axis: "z", direction: -1 })}
        onStop={stopJog}
      />
    </View>
  </View>
);

}
