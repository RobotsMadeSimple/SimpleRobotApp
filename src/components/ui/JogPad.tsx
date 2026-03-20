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
import { useWindowDimensions, View } from "react-native";

type JogIntent = {
  axis: "x" | "y" | "z" | "rz";
  direction: 1 | -1;
};

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
  const { width } = useWindowDimensions();
  const jogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeJog, setActiveJog] = useState<JogIntent | null>(null);
  const activeSpeed = speedMap[selectedSpeed];

  // Scale the grid to fill the available width (container has 12px padding each side)
  // Grid is 4.5 columns wide. Cap at 90px per cell so tablets don't get huge buttons.
  const cellSize = Math.min((width - 24) / 4.5, 90);
  const buttonSize = Math.round(cellSize * 0.875);
  const iconSize = Math.round(buttonSize * 0.43);

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

  const cell  = { width: cellSize,   height: cellSize,   alignItems: "center" as const, justifyContent: "center" as const };
  const narrow = { width: cellSize/2, height: cellSize,   alignItems: "center" as const, justifyContent: "center" as const };
  const grid  = { width: cellSize * 4.5, flexDirection: "row" as const, flexWrap: "wrap" as const, justifyContent: "space-between" as const, alignContent: "space-between" as const };

  const btn = (label: string, icon: React.ReactNode, pos: "above"|"below"|"left"|"right", intent: JogIntent) => (
    <JogButton
      label={label}
      icon={icon}
      iconPosition={pos}
      onStart={() => startJog(intent)}
      onStop={stopJog}
      size={buttonSize}
    />
  );

  return (
    <View style={grid}>
      {/* Row 1 */}
      <View style={cell}>{btn("+RZ", <UndoDot   size={iconSize} color="#666" />, "above", { axis: "rz", direction:  1 })}</View>
      <View style={cell}>{btn("-X",  <ChevronUp size={iconSize} color="#666" />, "above", { axis: "x",  direction: -1 })}</View>
      <View style={cell}>{btn("-RZ", <RedoDot   size={iconSize} color="#666" />, "above", { axis: "rz", direction: -1 })}</View>
      <View style={narrow} />
      <View style={cell}>{btn("+Z",  <ChevronUp size={iconSize} color="#666" />, "above", { axis: "z",  direction:  1 })}</View>

      {/* Row 2 */}
      <View style={cell}>{btn("-Y",  <ChevronLeft  size={iconSize} color="#666" />, "left",  { axis: "y", direction: -1 })}</View>
      <View style={cell} />
      <View style={cell}>{btn("+Y",  <ChevronRight size={iconSize} color="#666" />, "right", { axis: "y", direction:  1 })}</View>
      <View style={narrow} />
      <View style={cell} />

      {/* Row 3 */}
      <View style={cell} />
      <View style={cell}>{btn("+X",  <ChevronDown size={iconSize} color="#666" />, "below", { axis: "x", direction:  1 })}</View>
      <View style={cell} />
      <View style={narrow} />
      <View style={cell}>{btn("-Z",  <ChevronDown size={iconSize} color="#666" />, "below", { axis: "z", direction: -1 })}</View>
    </View>
  );
}
