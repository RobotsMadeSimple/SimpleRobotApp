import { JogButton } from "@/src/components/ui/JogButton";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RedoDot,
  UndoDot,
} from "lucide-react-native";
import { useWindowDimensions, View } from "react-native";

export type CartesianAxis = "x" | "y" | "z" | "rz";

type Props = {
  onStart: (axis: CartesianAxis, direction: 1 | -1) => void;
  onStop:  () => void;
};

/**
 * XYZ / Tool jog grid — the standard cross + Z column layout.
 * Used for both "XYZ" and "Tool" jog modes; the parent decides
 * which command to send.
 */
export function CartesianJogPanel({ onStart, onStop }: Props) {
  const { width } = useWindowDimensions();

  // Grid is 4.5 columns wide; cap at 90 px so tablets don't get huge buttons
  const cellSize   = Math.min((width - 24) / 4.5, 90);
  const buttonSize = Math.round(cellSize * 0.875);
  const iconSize   = Math.round(buttonSize * 0.43);

  const cell   = { width: cellSize,     height: cellSize,   alignItems: "center" as const, justifyContent: "center" as const };
  const narrow = { width: cellSize / 2, height: cellSize,   alignItems: "center" as const, justifyContent: "center" as const };
  const grid   = { width: cellSize * 4.5, flexDirection: "row" as const, flexWrap: "wrap" as const, justifyContent: "space-between" as const, alignContent: "space-between" as const };

  const btn = (label: string, icon: React.ReactNode, pos: "above" | "below" | "left" | "right", axis: CartesianAxis, dir: 1 | -1) => (
    <JogButton
      label={label}
      icon={icon}
      iconPosition={pos}
      onStart={() => onStart(axis, dir)}
      onStop={onStop}
      size={buttonSize}
    />
  );

  return (
    <View style={grid}>
      {/* Row 1 */}
      <View style={cell}>{btn("+RZ", <UndoDot    size={iconSize} color="#666" />, "above", "rz",  1)}</View>
      <View style={cell}>{btn("-X",  <ChevronUp  size={iconSize} color="#666" />, "above", "x",  -1)}</View>
      <View style={cell}>{btn("-RZ", <RedoDot    size={iconSize} color="#666" />, "above", "rz", -1)}</View>
      <View style={narrow} />
      <View style={cell}>{btn("+Z",  <ChevronUp  size={iconSize} color="#666" />, "above", "z",   1)}</View>

      {/* Row 2 */}
      <View style={cell}>{btn("-Y",  <ChevronLeft  size={iconSize} color="#666" />, "left",  "y", -1)}</View>
      <View style={cell} />
      <View style={cell}>{btn("+Y",  <ChevronRight size={iconSize} color="#666" />, "right", "y",  1)}</View>
      <View style={narrow} />
      <View style={cell} />

      {/* Row 3 */}
      <View style={cell} />
      <View style={cell}>{btn("+X",  <ChevronDown size={iconSize} color="#666" />, "below", "x",  1)}</View>
      <View style={cell} />
      <View style={narrow} />
      <View style={cell}>{btn("-Z",  <ChevronDown size={iconSize} color="#666" />, "below", "z", -1)}</View>
    </View>
  );
}
