import { colors, radii, spacing } from "@/src/components/ui/kit";
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
  const color = overridePercent > 100 ? colors.danger : overridePercent < 50 ? colors.warning : colors.accent;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={{ backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
            padding: 20, paddingBottom: 36, gap: spacing.lg }}>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Gauge size={18} color={color} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, flex: 1 }}>Speed Override</Text>
            <Text style={{ fontSize: 22, fontWeight: "800", color, minWidth: 54, textAlign: "right" }}>
              {Math.round(overridePercent)}%
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          <View style={{ height: THUMB_D + 12, justifyContent: "center" }}
            onLayout={e => { barWRef.current = e.nativeEvent.layout.width; }}
            {...pan.panHandlers}>
            <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
              <View style={{ width: `${frac * 100}%`, height: "100%", backgroundColor: color, borderRadius: 3 }} />
            </View>
            <View style={{
              position: "absolute",
              left: `${frac * 100}%`,
              marginLeft: -THUMB_D / 2,
              width: THUMB_D, height: THUMB_D,
              borderRadius: THUMB_D / 2,
              backgroundColor: colors.surface,
              borderWidth: 2, borderColor: color,
              shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
            }} />
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            {[25, 50, 75, 100, 150, 200].map(p => (
              <TouchableOpacity key={p} onPress={() => robotClient.setSpeedOverride(p)} activeOpacity={0.7}
                style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8,
                  backgroundColor: Math.round(overridePercent) === p ? color : colors.background,
                  borderWidth: 1, borderColor: Math.round(overridePercent) === p ? color : colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: "700",
                  color: Math.round(overridePercent) === p ? colors.onAccent : colors.textMuted }}>{p}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: 11, color: colors.textFaint }}>
            Scales all explicitly-set program speeds. Jog speeds are not affected.
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
