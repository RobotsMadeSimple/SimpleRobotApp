import { Point } from "@/src/models/robotModels";
import { usePoints, useSelectedRobot } from "@/src/providers/RobotProvider";
import { robotClient } from "@/src/services/RobotConnectService";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  LayoutRectangle,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const LABEL_WIDTH = 60;
const MAX_LABEL_SCREEN_PX = 11;
const BASE_LABEL_SIZE = 9;

function PointLabel({
  name,
  cx,
  cy,
  scale,
}: {
  name: string;
  cx: number;
  cy: number;
  scale: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    fontSize: Math.min(BASE_LABEL_SIZE, MAX_LABEL_SCREEN_PX / scale.value),
  }));
  return (
    <Animated.Text
      style={[
        styles.pointLabel,
        style,
        { left: cx - LABEL_WIDTH / 2, top: cy + DOT_RADIUS + 2 },
      ]}
    >
      {name}
    </Animated.Text>
  );
}

const MAP_HEIGHT = 300;
const DOT_RADIUS = 6;
const HIT_THRESHOLD_PX = 28;

function PointsMap({
  points,
  onPointPress,
}: {
  points: Point[];
  onPointPress: (p: Point) => void;
}) {
  const robot = useSelectedRobot();
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);

  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedFocalX = useSharedValue(0);
  const savedFocalY = useSharedValue(0);
  const centerX = useSharedValue(0);
  const centerY = useSharedValue(0);
  const isPinching = useSharedValue(false);

  // Tap position stored as state so we can detect in JS
  const [tapPos, setTapPos] = useState<{ x: number; y: number } | null>(null);

  // Keep refs to shared values so the tap effect can read them synchronously
  const offsetXRef = useRef(offsetX);
  const offsetYRef = useRef(offsetY);
  const scaleRef = useRef(scale);

  useEffect(() => {
    if (!tapPos || !layout) {
      setTapPos(null);
      return;
    }
    const cx = layout.width / 2;
    const cy = layout.height / 2;
    const curScale = scaleRef.current.value;
    const curOffX = offsetXRef.current.value;
    const curOffY = offsetYRef.current.value;

    // Invert the transform: screen → world
    const worldX = (tapPos.x - cx - curOffX) / curScale;
    const worldY = -(tapPos.y - cy - curOffY) / curScale;

    // Hit threshold in world units
    const threshold = HIT_THRESHOLD_PX / curScale;
    let closest: Point | null = null;
    let minDist = threshold;
    for (const p of points) {
      const d = Math.sqrt((p.x - worldX) ** 2 + (p.y - worldY) ** 2);
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }
    setTapPos(null);
    if (closest) onPointPress(closest);
  }, [tapPos]);

  // Pan: 1-finger only so it doesn't fight with pinch translation
  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(6)
    .onStart(() => {
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
    })
    .onUpdate((e) => {
      if (isPinching.value) {
        // Keep saved in sync so pan resumes cleanly after pinch
        savedOffsetX.value = offsetX.value - e.translationX;
        savedOffsetY.value = offsetY.value - e.translationY;
        return;
      }
      offsetX.value = savedOffsetX.value + e.translationX;
      offsetY.value = savedOffsetY.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      isPinching.value = true;
      savedScale.value = scale.value;
      savedOffsetX.value = offsetX.value;
      savedOffsetY.value = offsetY.value;
      savedFocalX.value = e.focalX;
      savedFocalY.value = e.focalY;
    })
    .onEnd(() => {
      isPinching.value = false;
    })
    .onUpdate((e) => {
      const newScale = Math.max(0.05, Math.min(20, savedScale.value * e.scale));
      // World point that was under the start focal — keep it under the current focal
      const childX = (savedFocalX.value - centerX.value - savedOffsetX.value) / savedScale.value;
      const childY = (savedFocalY.value - centerY.value - savedOffsetY.value) / savedScale.value;
      offsetX.value = e.focalX - centerX.value - childX * newScale;
      offsetY.value = e.focalY - centerY.value - childY * newScale;
      scale.value = newScale;
    });

  // Tap: Race with pan/pinch so that any panning cancels the tap gesture
  const tap = Gesture.Tap()
    .maxDuration(300)
    .onEnd((e) => {
      runOnJS(setTapPos)({ x: e.x, y: e.y });
    });

  const composed = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      style={styles.mapContainer}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout(e.nativeEvent.layout);
        centerX.value = width / 2;
        centerY.value = height / 2;
      }}
    >
      <GestureDetector gesture={composed}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
            {/* Axis lines */}
            <View style={styles.axisH} />
            <View style={styles.axisV} />

            {/* Point dots */}
            {layout &&
              points.map((p) => {
                const cx = layout.width / 2 + p.x;
                const cy = layout.height / 2 - p.y;
                return (
                  <View key={p.name}>
                    <View
                      style={[
                        styles.pointDot,
                        { left: cx - DOT_RADIUS, top: cy - DOT_RADIUS },
                      ]}
                    />
                    <PointLabel
                      name={p.name}
                      cx={cx}
                      cy={cy}
                      scale={scale}
                    />
                  </View>
                );
              })}

            {/* Robot current position marker */}
            {layout && robot && (
              <View
                style={[
                  styles.robotDot,
                  {
                    left: layout.width / 2 + robot.status.x - 7,
                    top: layout.height / 2 - robot.status.y - 7,
                  },
                ]}
              />
            )}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Corner hint */}
      <Text style={styles.hint}>Pinch to zoom · drag to pan · tap a point</Text>
    </View>
  );
}

export default function PointsPage() {
  const points = usePoints();
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);

  function closeMenu() {
    setSelectedPoint(null);
  }

  function moveTo() {
    if (!selectedPoint) return;
    robotClient.sendCommand("MoveToPoint", { name: selectedPoint.name });
    closeMenu();
  }

  function reteach() {
    if (!selectedPoint) return;
    robotClient.sendCommand("TeachPoint", { name: selectedPoint.name });
    closeMenu();
  }

  const renderItem = ({ item }: { item: Point }) => (
    <Pressable onPress={() => setSelectedPoint(item)}>
      <View style={styles.row}>
        <Text style={[styles.cell, styles.name]}>{item.name}</Text>
        <Text style={styles.cell}>{item.x.toFixed(1)}</Text>
        <Text style={styles.cell}>{item.y.toFixed(1)}</Text>
        <Text style={styles.cell}>{item.z.toFixed(1)}</Text>
        <Text style={styles.cell}>{item.rz.toFixed(1)}</Text>
      </View>
    </Pressable>
  );

  const Header = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.headerCell, styles.name]}>Name</Text>
      <Text style={styles.headerCell}>X</Text>
      <Text style={styles.headerCell}>Y</Text>
      <Text style={styles.headerCell}>Z</Text>
      <Text style={styles.headerCell}>RZ</Text>
    </View>
  );

  return (
    <View style={styles.page}>
      <PointsMap points={points} onPointPress={setSelectedPoint} />

      <FlatList
        data={points}
        keyExtractor={(item) => item.name}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No points available</Text>
        }
      />

      <Modal
        visible={!!selectedPoint}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.overlay} onPress={closeMenu}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{selectedPoint?.name}</Text>
            <View style={styles.coords}>
              <Text style={styles.coordText}>
                X {selectedPoint?.x.toFixed(1)}{"  "}
                Y {selectedPoint?.y.toFixed(1)}{"  "}
                Z {selectedPoint?.z.toFixed(1)}
              </Text>
            </View>

            <Pressable style={styles.button} onPress={moveTo}>
              <Text style={styles.buttonText}>Move To</Text>
            </Pressable>

            <Pressable style={styles.button} onPress={reteach}>
              <Text style={styles.buttonText}>Re-Teach</Text>
            </Pressable>

            <Pressable style={styles.cancel} onPress={closeMenu}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#fff",
  },

  // ── Map ──────────────────────────────────────────────────────────────────
  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: "#dde1e8",
    overflow: "hidden",
  },

  axisH: {
    position: "absolute",
    top: "50%",
    left: -9999,
    right: -9999,
    height: 1,
    backgroundColor: "#b0b8c6",
  },

  axisV: {
    position: "absolute",
    left: "50%",
    top: -9999,
    bottom: -9999,
    width: 1,
    backgroundColor: "#b0b8c6",
  },

  pointDot: {
    position: "absolute",
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: "#4ade80",
    borderWidth: 1.5,
    borderColor: "#166534",
  },

  pointLabel: {
    position: "absolute",
    width: LABEL_WIDTH,
    color: "#1f2937",
    textAlign: "center",
  },

  robotDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#3b82f6",
    borderWidth: 2,
    borderColor: "#93c5fd",
  },

  hint: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 10,
    color: "#6b7280",
  },

  // ── List ─────────────────────────────────────────────────────────────────
  list: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },

  headerRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#fff",
  },

  headerCell: {
    flex: 1,
    fontWeight: "600",
    fontSize: 13,
    color: "#000",
    textAlign: "center",
  },

  row: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },

  cell: {
    flex: 1,
    fontFamily: "monospace",
    textAlign: "center",
    color: "#000",
    fontSize: 13,
  },

  name: {
    flex: 2,
    textAlign: "left",
    paddingLeft: 6,
  },

  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#888",
  },

  // ── Modal ─────────────────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    width: 270,
    backgroundColor: "white",
    borderRadius: 14,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },

  dialogTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },

  coords: {
    marginBottom: 16,
  },

  coordText: {
    fontSize: 12,
    color: "#666",
    fontFamily: "monospace",
  },

  button: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },

  buttonText: {
    fontSize: 16,
    color: "#2563eb",
  },

  cancel: {
    marginTop: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eee",
  },

  cancelText: {
    color: "#999",
    fontSize: 15,
  },
});
