import { JogButton } from "@/src/components/ui/JogButton";
import { robotClient } from "@/src/services/RobotConnectService";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RedoDot,
  UndoDot
} from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

type JogIntent = {
  axis: "x" | "y" | "z" | "rz";
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

type JogPadProps = {
  jogMode: string;
  selectedSpeed: string;
};

const speedMap: Record<string, number> = {
  "0.1mm": 0.1,
  "1mm": 1,
  "10mm": 10,
  Slow: 10,
  Normal: 100,
  Fast: 300,
};

export default function JogPad({
  jogMode,
  selectedSpeed
}: JogPadProps) {
  const jogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeJog, setActiveJog] = useState<JogIntent | null>(null);
  const activeSpeed = speedMap[selectedSpeed];


  const startJog = (intent: JogIntent) => {
    if (jogIntervalRef.current) return;

    setActiveJog(intent);

    if (jogMode === "Tool"){
      jogIntervalRef.current = setInterval(() => {
        robotClient.jogTool({
          x: intent.axis === "x" ? intent.direction : 0,
          y: intent.axis === "y" ? intent.direction : 0,
          z: intent.axis === "z" ? intent.direction : 0,
          rz: intent.axis === "rz" ? intent.direction : 0,
          speed: activeSpeed,
          accel: 200,
          decel: 1000
        })
      }, 20);
      return;
    }

    if (!selectedSpeed.includes("mm")){
      jogIntervalRef.current = setInterval(() => {
        robotClient.jogL({
          x: intent.axis === "x" ? intent.direction : 0,
          y: intent.axis === "y" ? intent.direction : 0,
          z: intent.axis === "z" ? intent.direction : 0,
          rz: intent.axis === "rz" ? intent.direction : 0,
          speed: activeSpeed,
          accel: 200,
          decel: 1000
        })
      }, 20);
      return;
    }
    else{
      robotClient.offsetL({
        x: intent.axis === "x" ? activeSpeed * intent.direction : 0,
        y: intent.axis === "y" ? activeSpeed * intent.direction : 0,
        z: intent.axis === "z" ? activeSpeed * intent.direction : 0,
        rz: intent.axis === "rz" ? activeSpeed * intent.direction : 0,
        speed: 100,
        accel: 200,
        decel: 1000,
      });
      return;
    }
  };

  const stopJog = () => {
    if (jogIntervalRef.current) {
      clearInterval(jogIntervalRef.current);
      jogIntervalRef.current = null;
    }
    setActiveJog(null);
    robotClient.stopJog();
  };

  return (
  <View style={styles.grid}>
    {/* Row 1 */}

    {/* +RZ */}
    <View style={styles.cell}>
      <JogButton
        label="+RZ"
        icon={<UndoDot size={30} color="#666" />}
        iconPosition="above"
        onStart={() => startJog({ axis: "rz", direction: 1 })}
        onStop={stopJog}
      />
    </View>

    {/* X- */}
    <View style={styles.cell}>
      <JogButton
        label="-X"
        icon={<ChevronUp size={30} color="#666" />}
        iconPosition="above"
        onStart={() => startJog({ axis: "x", direction: -1 })}
        onStop={stopJog}
      />
    </View>

    {/* -RZ */}
    <View style={styles.cell}>
      <JogButton
        label="-RZ"
        icon={<RedoDot size={30} color="#666" />}
        iconPosition="above"
        onStart={() => startJog({ axis: "rz", direction: -1 })}
        onStop={stopJog}
      />
    </View>
    <View style={styles.narrowCell} />

    {/* Z+ (moved right) */}
    <View style={styles.cell}>
      <JogButton
        label="+Z"
        icon={<ChevronUp size={30} color="#666" />}
        iconPosition="above"
        onStart={() => startJog({ axis: "z", direction: 1 })}
        onStop={stopJog}
      />
    </View>

    {/* Row 2 */}
    <View style={styles.cell}>
      <JogButton
        label="-Y"
        icon={<ChevronLeft size={30} color="#666" />}
        iconPosition="left"
        onStart={() => startJog({ axis: "y", direction: -1 })}
        onStop={stopJog}
      />
    </View>

    <View style={styles.cell} />
    <View style={styles.cell}>
      <JogButton
        label="+Y"
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
        label="+X"
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
        label="-Z"
        icon={<ChevronDown size={30} color="#666" />}
        iconPosition="below"
        onStart={() => startJog({ axis: "z", direction: -1 })}
        onStop={stopJog}
      />
    </View>
  </View>
);

}
