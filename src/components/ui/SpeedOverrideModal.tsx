import { robotClient } from "@/src/services/RobotConnectService";
import { Gauge, X } from "lucide-react-native";
import { useRef } from "react";
import { Modal, PanResponder, Text, TouchableOpacity, View } from "react-native";

export function SpeedOverrideModal({
  visible,
  overridePercent,
  onClose,
}: {
  visible: boolean;
  overridePercent: number;
  onClose: () => void;
}) {
  const THUMB_D    = 22;
  const MIN        = 5;
  const MAX        = 200;
  const barWRef    = useRef(1);
  const startRef   = useRef(overridePercent);
  const currentRef = useRef(overridePercent);
  currentRef.current = overridePercent;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startRef.current = currentRef.current; },
    onPanResponderMove: (_, g) => {
      const raw     = startRef.current + (g.dx / Math.max(1, barWRef.current)) * (MAX - MIN);
      const clamped = Math.max(MIN, Math.min(MAX, Math.round(raw)));
      robotClient.setSpeedOverride(clamped);
    },
    onPanResponderRelease: () => {},
  })).current;

  const frac  = Math.max(0, Math.min(1, (overridePercent - MIN) / (MAX - MIN)));
  const color = overridePercent > 100 ? "#dc2626" : overridePercent < 50 ? "#d97706" : "#2563eb";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 20, paddingBottom: 36, gap: 16 }}>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Gauge size={18} color={color} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827", flex: 1 }}>Speed Override</Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color, minWidth: 54, textAlign: "right" }}>
              {Math.round(overridePercent)}%
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <View style={{ height: THUMB_D + 12, justifyContent: "center" }}
            onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
            {...pan.panHandlers}>
            <View style={{ height: 6, backgroundColor: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
              <View style={{ width: `${frac * 100}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
            </View>
            <View style={{
              position: "absolute",
              left: `${frac * 100}%`,
              marginLeft: -THUMB_D / 2,
              width: THUMB_D, height: THUMB_D,
              borderRadius: THUMB_D / 2,
              backgroundColor: "#fff",
              borderWidth: 2, borderColor: color,
              shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
            }} />
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            {[25, 50, 75, 100, 150, 200].map(p => (
              <TouchableOpacity key={p} onPress={() => robotClient.setSpeedOverride(p)} activeOpacity={0.7}
                style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8,
                  backgroundColor: Math.round(overridePercent) === p ? color : "#f3f4f6",
                  borderWidth: 1, borderColor: Math.round(overridePercent) === p ? color : "#e5e7eb" }}>
                <Text style={{ fontSize: 11, fontWeight: "700",
                  color: Math.round(overridePercent) === p ? "#fff" : "#6b7280" }}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: "#9ca3af" }}>
            Scales all explicitly-set program speeds. Jog speeds are not affected.
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
